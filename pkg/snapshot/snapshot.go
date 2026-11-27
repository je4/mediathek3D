package snapshot

import (
	"context"
	"encoding/base64"
	"fmt"
	"log"
	"net"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/je4/mediathek3D/pkg/config"
	"github.com/je4/mediathek3D/pkg/service"
	"github.com/je4/mediathek3D/pkg/web"
)

// Config defines options for the automated box snapshot generation.
type Config struct {
	OutputDir   string        `json:"outputDir"`
	ServerURL   string        `json:"serverUrl"`
	Shelves     []string      `json:"shelves"`
	Boxes       []string      `json:"boxes"`
	Sides       []string      `json:"sides"`
	Theme       string        `json:"theme"`
	Width       int           `json:"width"`
	Height      int           `json:"height"`
	BrowserPath string        `json:"browserPath"`
	Naming      string        `json:"naming"` // "structured" (A/A101_side_a.png) or "flat" (A101a.png)
	Overwrite   bool          `json:"overwrite"`
	DataPath    string        `json:"dataPath"`
	Port        int           `json:"port"`
	Quiet       bool          `json:"quiet"`
	Delay       time.Duration `json:"delay"`
}

// Result contains execution statistics from a snapshot run.
type Result struct {
	TotalSnapshots   int           `json:"totalSnapshots"`
	SkippedSnapshots int           `json:"skippedSnapshots"`
	Duration         time.Duration `json:"duration"`
	OutputDir        string        `json:"outputDir"`
}

type boxInfo struct {
	ID    string `json:"id"`
	ID2   string `json:"id2"`
	Name  string `json:"name"`
	Shelf string `json:"shelf"`
	Level int    `json:"level"`
	Index int    `json:"index"`
	HasB  bool   `json:"hasB"`
	Area  string `json:"area"`
}

type extraSnapshot struct {
	Name              string `json:"name"`
	TitleDataURL      string `json:"titleDataUrl"`
	TitleSmallDataURL string `json:"titleSmallDataUrl"`
}

type captureResponse struct {
	Skipped           bool            `json:"skipped"`
	Reason            string          `json:"reason"`
	BoxID             string          `json:"boxId"`
	Side              string          `json:"side"`
	DataURL           string          `json:"dataUrl"`
	RawDataURL        string          `json:"rawDataUrl"`
	TitleDataURL      string          `json:"titleDataUrl"`
	RawSmallDataURL   string          `json:"rawSmallDataUrl"`
	TitleSmallDataURL string          `json:"titleSmallDataUrl"`
	Extras            []extraSnapshot `json:"extras"`
}

// Run executes the full snapshot generation pipeline.
func Run(ctx context.Context, cfg Config) (*Result, error) {
	startTime := time.Now()

	if cfg.OutputDir == "" {
		cfg.OutputDir = "./snapshots"
	}
	if cfg.Width <= 0 {
		cfg.Width = 1080
	}
	if cfg.Height <= 0 {
		cfg.Height = 1080
	}
	if cfg.Naming == "" {
		cfg.Naming = "flat"
	}
	if cfg.Theme == "" {
		cfg.Theme = "olive"
	}
	if len(cfg.Sides) == 0 {
		cfg.Sides = []string{"a", "b"}
	}

	absOutputDir, err := filepath.Abs(cfg.OutputDir)
	if err != nil {
		return nil, fmt.Errorf("invalid output directory %s: %w", cfg.OutputDir, err)
	}

	subdirs := []string{"raw", "title", "raw_small", "title_small"}
	for _, sub := range subdirs {
		if err := os.MkdirAll(filepath.Join(absOutputDir, sub), 0755); err != nil {
			return nil, fmt.Errorf("failed to create output subdirectory %s/%s: %w", absOutputDir, sub, err)
		}
	}

	// 1. Locate Chrome / Edge browser executable
	browserPath, err := FindBrowser(cfg.BrowserPath)
	if err != nil {
		return nil, err
	}
	if !cfg.Quiet {
		log.Printf("[INFO] Using browser: %s", browserPath)
	}

	// 2. Start internal web server if ServerURL is not provided
	serverURL := cfg.ServerURL
	var srv *web.Server
	if serverURL == "" {
		var jsonData []byte
		if cfg.DataPath != "" {
			data, err := os.ReadFile(cfg.DataPath)
			if err != nil {
				return nil, fmt.Errorf("failed to read shelf data from %s: %w", cfg.DataPath, err)
			}
			jsonData = data
		} else {
			data, err := web.StaticFS.ReadFile("static/data/kistendata.json")
			if err != nil {
				return nil, fmt.Errorf("failed to read embedded shelf data: %w", err)
			}
			jsonData = data
		}

		kistenSvc, err := service.NewKistenService(jsonData)
		if err != nil {
			return nil, fmt.Errorf("failed to initialize shelf service: %w", err)
		}

		// Find a free TCP port
		listener, err := net.Listen("tcp", fmt.Sprintf("127.0.0.1:%d", cfg.Port))
		if err != nil {
			return nil, fmt.Errorf("failed to bind ephemeral server port: %w", err)
		}
		port := listener.Addr().(*net.TCPAddr).Port
		_ = listener.Close()

		webCfg := &config.Config{
			Port:       port,
			Host:       "127.0.0.1",
			Title:      "HGK Mediathek 3D Snapshotter",
			EnableCORS: true,
		}

		srv, err = web.NewServer(webCfg, kistenSvc)
		if err != nil {
			return nil, fmt.Errorf("failed to initialize web server: %w", err)
		}

		go func() {
			_ = srv.ListenAndServe()
		}()

		serverURL = fmt.Sprintf("http://127.0.0.1:%d", port)
		if !cfg.Quiet {
			log.Printf("[INFO] Started background snapshot server on %s", serverURL)
		}

		defer func() {
			shutdownCtx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
			defer cancel()
			_ = srv.Shutdown(shutdownCtx)
		}()
	}

	// 3. Launch Headless Browser
	if !cfg.Quiet {
		log.Printf("[INFO] Launching headless browser (%dx%d)...", cfg.Width, cfg.Height)
	}

	cdp, err := LaunchBrowser(ctx, browserPath, cfg.Width, cfg.Height)
	if err != nil {
		return nil, fmt.Errorf("failed to launch headless browser: %w", err)
	}
	defer func() {
		_ = cdp.Close()
	}()

	// 4. Navigate to Snapshot endpoint
	targetURL := fmt.Sprintf("%s/snapshot?hud=false&theme=%s", strings.TrimSuffix(serverURL, "/"), url.QueryEscape(cfg.Theme))
	if !cfg.Quiet {
		log.Printf("[INFO] Loading snapshot viewport (theme: %s): %s", cfg.Theme, targetURL)
	}

	if err := cdp.Navigate(ctx, targetURL); err != nil {
		return nil, fmt.Errorf("failed to navigate to %s: %w", targetURL, err)
	}

	// 5. Wait for Three.js engine readiness
	readyDeadline := time.Now().Add(15 * time.Second)
	isReady := false
	for time.Now().Before(readyDeadline) {
		var ready bool
		err := cdp.Evaluate(ctx, "Boolean(window.snapshotAPI && window.snapshotAPI.isReady())", &ready)
		if err == nil && ready {
			isReady = true
			break
		}
		time.Sleep(150 * time.Millisecond)
	}

	if !isReady {
		return nil, fmt.Errorf("timeout waiting for 3D snapshot engine initialization")
	}

	// Apply requested theme to 3D scene engine
	if cfg.Theme != "" {
		_ = cdp.Evaluate(ctx, fmt.Sprintf("window.snapshotAPI.setTheme(%q)", cfg.Theme), nil)
	}

	// 6. Fetch all shelf keys
	var allShelfKeys []string
	if err := cdp.Evaluate(ctx, "window.snapshotAPI.getShelfKeys()", &allShelfKeys); err != nil {
		return nil, fmt.Errorf("failed to retrieve shelf keys: %w", err)
	}

	// Filter target shelves
	targetShelves := allShelfKeys
	if len(cfg.Shelves) > 0 {
		filterMap := make(map[string]bool)
		for _, s := range cfg.Shelves {
			filterMap[strings.ToUpper(strings.TrimSpace(s))] = true
		}
		var filtered []string
		for _, s := range allShelfKeys {
			if filterMap[s] {
				filtered = append(filtered, s)
			}
		}
		targetShelves = filtered
	}

	// Filter target boxes map
	targetBoxesMap := make(map[string]bool)
	if len(cfg.Boxes) > 0 {
		for _, b := range cfg.Boxes {
			clean := strings.ToUpper(strings.TrimSpace(b))
			clean = strings.TrimSuffix(clean, "A")
			clean = strings.TrimSuffix(clean, "B")
			targetBoxesMap[clean] = true
		}
	}

	wantSideA := false
	wantSideB := false
	for _, s := range cfg.Sides {
		side := strings.ToLower(strings.TrimSpace(s))
		if side == "a" || side == "side_a" || side == "both" || side == "1" {
			wantSideA = true
		}
		if side == "b" || side == "side_b" || side == "both" || side == "2" {
			wantSideB = true
		}
	}

	totalSnapshots := 0
	skippedSnapshots := 0

	if !cfg.Quiet {
		log.Printf("[INFO] Starting snapshot processing for %d shelves...", len(targetShelves))
	}

	// 7. Iterate through shelves and capture boxes
	for shelfIdx, shelfKey := range targetShelves {
		if !cfg.Quiet {
			log.Printf("[INFO] [%d/%d] Building isolated shelf %s...", shelfIdx+1, len(targetShelves), shelfKey)
		}

		// Load isolated shelf in browser
		initExpr := fmt.Sprintf("window.snapshotAPI.initShelf(%q)", shelfKey)
		if err := cdp.Evaluate(ctx, initExpr, nil); err != nil {
			return nil, fmt.Errorf("failed to isolate shelf %s: %w", shelfKey, err)
		}

		time.Sleep(100 * time.Millisecond)

		// Get boxes for shelf
		var boxes []boxInfo
		getBoxesExpr := fmt.Sprintf("window.snapshotAPI.getBoxes(%q)", shelfKey)
		if err := cdp.Evaluate(ctx, getBoxesExpr, &boxes); err != nil {
			return nil, fmt.Errorf("failed to get box list for shelf %s: %w", shelfKey, err)
		}

		// Ensure shelf subdirectory exists if structured naming
		if cfg.Naming == "structured" {
			shelfDir := filepath.Join(absOutputDir, shelfKey)
			_ = os.MkdirAll(shelfDir, 0755)
		}

		for _, box := range boxes {
			if len(targetBoxesMap) > 0 && !targetBoxesMap[box.Name] {
				continue
			}

			// Capture Side A
			if wantSideA {
				var relFilename string
				if cfg.Naming == "structured" {
					relFilename = filepath.Join(shelfKey, fmt.Sprintf("%sa.png", box.Name))
				} else {
					relFilename = fmt.Sprintf("%sa.png", box.Name)
				}

				checkRaw := filepath.Join(absOutputDir, "raw", relFilename)
				checkTitle := filepath.Join(absOutputDir, "title", relFilename)
				checkRawSmall := filepath.Join(absOutputDir, "raw_small", relFilename)
				checkTitleSmall := filepath.Join(absOutputDir, "title_small", relFilename)

				if !cfg.Overwrite && fileExists(checkRaw) && fileExists(checkTitle) && fileExists(checkRawSmall) && fileExists(checkTitleSmall) {
					skippedSnapshots++
				} else {
					if err := captureAndSaveAll(ctx, cdp, box.Name, "a", absOutputDir, shelfKey, cfg.Naming); err != nil {
						log.Printf("[WARN] Failed capturing %s (Side A): %v", box.Name, err)
					} else {
						totalSnapshots++
						if !cfg.Quiet {
							log.Printf("  -> Saved %s [raw, title, raw_small, title_small]", relFilename)
						}
					}
					if cfg.Delay > 0 {
						time.Sleep(cfg.Delay)
					}
				}
			}

			// Capture Side B (if box has side B)
			if wantSideB && box.HasB {
				var relFilename string
				if cfg.Naming == "structured" {
					relFilename = filepath.Join(shelfKey, fmt.Sprintf("%sb.png", box.Name))
				} else {
					relFilename = fmt.Sprintf("%sb.png", box.Name)
				}

				checkRaw := filepath.Join(absOutputDir, "raw", relFilename)
				checkTitle := filepath.Join(absOutputDir, "title", relFilename)
				checkRawSmall := filepath.Join(absOutputDir, "raw_small", relFilename)
				checkTitleSmall := filepath.Join(absOutputDir, "title_small", relFilename)

				if !cfg.Overwrite && fileExists(checkRaw) && fileExists(checkTitle) && fileExists(checkRawSmall) && fileExists(checkTitleSmall) {
					skippedSnapshots++
				} else {
					if err := captureAndSaveAll(ctx, cdp, box.Name, "b", absOutputDir, shelfKey, cfg.Naming); err != nil {
						log.Printf("[WARN] Failed capturing %s (Side B): %v", box.Name, err)
					} else {
						totalSnapshots++
						if !cfg.Quiet {
							log.Printf("  -> Saved %s [raw, title, raw_small, title_small]", relFilename)
						}
					}
					if cfg.Delay > 0 {
						time.Sleep(cfg.Delay)
					}
				}
			}
		}
	}

	elapsed := time.Since(startTime)
	if !cfg.Quiet {
		log.Printf("[INFO] Completed! Generated %d snapshots (%d skipped) in %s -> %s",
			totalSnapshots, skippedSnapshots, elapsed.Round(time.Millisecond), absOutputDir)
	}

	return &Result{
		TotalSnapshots:   totalSnapshots,
		SkippedSnapshots: skippedSnapshots,
		Duration:         elapsed,
		OutputDir:        absOutputDir,
	}, nil
}

func captureAndSaveAll(ctx context.Context, cdp *CDPClient, boxName, side, baseOutputDir, shelfKey, naming string) error {
	expr := fmt.Sprintf("window.snapshotAPI.captureBox(%q, %q)", boxName, side)
	var resp captureResponse
	if err := cdp.Evaluate(ctx, expr, &resp); err != nil {
		return err
	}

	if resp.Skipped {
		return fmt.Errorf("skipped by engine: %s", resp.Reason)
	}

	var relPath string
	if naming == "structured" {
		relPath = filepath.Join(shelfKey, fmt.Sprintf("%s%s.png", boxName, side))
	} else {
		relPath = fmt.Sprintf("%s%s.png", boxName, side)
	}

	// 1. Raw 1080x1080
	rawURL := resp.RawDataURL
	if rawURL == "" {
		rawURL = resp.DataURL
	}
	if rawURL != "" {
		if err := saveBase64PNG(rawURL, filepath.Join(baseOutputDir, "raw", relPath)); err != nil {
			return fmt.Errorf("saving raw snapshot failed: %w", err)
		}
	}

	// 2. Title 1080x1080 (with top & bottom bars)
	if resp.TitleDataURL != "" {
		if err := saveBase64PNG(resp.TitleDataURL, filepath.Join(baseOutputDir, "title", relPath)); err != nil {
			return fmt.Errorf("saving title snapshot failed: %w", err)
		}
	}

	// 3. Raw Small 230x230
	if resp.RawSmallDataURL != "" {
		if err := saveBase64PNG(resp.RawSmallDataURL, filepath.Join(baseOutputDir, "raw_small", relPath)); err != nil {
			return fmt.Errorf("saving raw_small snapshot failed: %w", err)
		}
	}

	// 4. Title Small 230x230
	if resp.TitleSmallDataURL != "" {
		if err := saveBase64PNG(resp.TitleSmallDataURL, filepath.Join(baseOutputDir, "title_small", relPath)); err != nil {
			return fmt.Errorf("saving title_small snapshot failed: %w", err)
		}
	}

	// 5. Extras (e.g. P301a with "Information")
	for _, extra := range resp.Extras {
		var extraRelPath string
		if naming == "structured" {
			extraRelPath = filepath.Join(shelfKey, extra.Name)
		} else {
			extraRelPath = extra.Name
		}
		if extra.TitleDataURL != "" {
			_ = saveBase64PNG(extra.TitleDataURL, filepath.Join(baseOutputDir, "title", extraRelPath))
		}
		if extra.TitleSmallDataURL != "" {
			_ = saveBase64PNG(extra.TitleSmallDataURL, filepath.Join(baseOutputDir, "title_small", extraRelPath))
		}
	}

	return nil
}

func saveBase64PNG(dataURL, destPath string) error {
	if dataURL == "" {
		return nil
	}
	commaIdx := strings.Index(dataURL, ",")
	if commaIdx == -1 {
		return fmt.Errorf("invalid data URL format")
	}

	imgBytes, err := base64.StdEncoding.DecodeString(dataURL[commaIdx+1:])
	if err != nil {
		return fmt.Errorf("failed to decode base64 PNG: %w", err)
	}

	dir := filepath.Dir(destPath)
	if err := os.MkdirAll(dir, 0755); err != nil {
		return err
	}

	return os.WriteFile(destPath, imgBytes, 0644)
}

func fileExists(path string) bool {
	info, err := os.Stat(path)
	if err != nil {
		return false
	}
	return !info.IsDir() && info.Size() > 0
}
