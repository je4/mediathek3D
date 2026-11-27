package main

import (
	"context"
	"flag"
	"fmt"
	"log"
	"os"
	"os/signal"
	"strings"
	"syscall"
	"time"

	"github.com/je4/mediathek3D/pkg/snapshot"
)

func main() {
	var (
		outDir      string
		serverURL   string
		shelvesStr  string
		boxesStr    string
		sideStr     string
		width       int
		height      int
		browserPath string
		naming      string
		theme       string
		overwrite   bool
		dataPath    string
		quiet       bool
		delayMs     int
	)

	flag.StringVar(&outDir, "out", "./snapshots", "Zielverzeichnis für die generierten Kisten-Snapshots")
	flag.StringVar(&outDir, "o", "./snapshots", "Kurzform für --out")
	flag.StringVar(&serverURL, "server", "", "URL eines laufenden Mediathek3D-Servers (Standard: startet automatisch internen Server)")
	flag.StringVar(&shelvesStr, "shelves", "", "Kommagetrennte Liste von Regalen (z.B. A,B,S). Standard: Alle Regale")
	flag.StringVar(&shelvesStr, "shelf", "", "Alias für --shelves")
	flag.StringVar(&boxesStr, "box", "", "Einzelne Kiste oder kommagetrennte Kisten (z.B. A101,S105)")
	flag.StringVar(&boxesStr, "boxes", "", "Alias für --box")
	flag.StringVar(&sideStr, "side", "both", "Zu erfassende Seiten: 'both' (A & B), 'a' (nur Vorderseite), 'b' (nur Rückseite)")
	flag.IntVar(&width, "width", 1080, "Snapshot-Breite in Pixeln")
	flag.IntVar(&width, "w", 1080, "Kurzform für --width")
	flag.IntVar(&height, "height", 1080, "Snapshot-Höhe in Pixeln")
	flag.IntVar(&height, "h", 1080, "Kurzform für --height")
	flag.StringVar(&browserPath, "browser", "", "Pfad zur Chromium/Edge/Chrome ausführbaren Datei (Standard: automatische Erkennung)")
	flag.StringVar(&naming, "naming", "flat", "Dateibenennung: 'flat' (A101a.png, A101b.png) oder 'structured' (A/A101a.png)")
	flag.StringVar(&theme, "theme", "olive", "Farb-Theme: 'olive' (Olivenhain), 'ocher' (Ocker Lounge), 'sage' (Salbei & Natur), 'terracotta' (Warm Terrakotta), 'classic' (Klassisch)")
	flag.BoolVar(&overwrite, "overwrite", false, "Bereits vorhandene Snapshot-Dateien überschreiben")
	flag.StringVar(&dataPath, "data", "", "Pfad zu einer benutzerdefinierten kistendata.json")
	flag.BoolVar(&quiet, "quiet", false, "Weniger Konsolenausgaben")
	flag.BoolVar(&quiet, "q", false, "Kurzform für --quiet")
	flag.IntVar(&delayMs, "delay", 0, "Wartezeit in Millisekunden zwischen Snapshots")

	flag.Usage = func() {
		fmt.Fprintf(os.Stderr, "HGK Mediathek 3D - Kisten Snapshot Generator\n\n")
		fmt.Fprintf(os.Stderr, "Erzeugt automatisierte 3D-Snapshots für jede Kiste (Seite A & B) mit isoliertem Regalaufbau.\n\n")
		fmt.Fprintf(os.Stderr, "Verwendung:\n")
		fmt.Fprintf(os.Stderr, "  go run ./cmd/snapshot [Optionen]\n\n")
		fmt.Fprintf(os.Stderr, "Optionen:\n")
		flag.PrintDefaults()
		fmt.Fprintf(os.Stderr, "\nBeispiele:\n")
		fmt.Fprintf(os.Stderr, "  go run ./cmd/snapshot --shelves A,B --out ./export\n")
		fmt.Fprintf(os.Stderr, "  go run ./cmd/snapshot --box A101 --side both\n")
		fmt.Fprintf(os.Stderr, "  go run ./cmd/snapshot --naming flat --overwrite\n")
	}

	flag.Parse()

	var shelves []string
	if shelvesStr != "" {
		for _, s := range strings.Split(shelvesStr, ",") {
			trimmed := strings.TrimSpace(s)
			if trimmed != "" {
				shelves = append(shelves, trimmed)
			}
		}
	}

	var boxes []string
	if boxesStr != "" {
		for _, b := range strings.Split(boxesStr, ",") {
			trimmed := strings.TrimSpace(b)
			if trimmed != "" {
				boxes = append(boxes, trimmed)
			}
		}
	}

	var sides []string
	switch strings.ToLower(strings.TrimSpace(sideStr)) {
	case "a", "side_a", "1", "front":
		sides = []string{"a"}
	case "b", "side_b", "2", "back":
		sides = []string{"b"}
	default:
		sides = []string{"a", "b"}
	}

	cfg := snapshot.Config{
		OutputDir:   outDir,
		ServerURL:   serverURL,
		Shelves:     shelves,
		Boxes:       boxes,
		Sides:       sides,
		Theme:       theme,
		Width:       width,
		Height:      height,
		BrowserPath: browserPath,
		Naming:      naming,
		Overwrite:   overwrite,
		DataPath:    dataPath,
		Quiet:       quiet,
		Delay:       time.Duration(delayMs) * time.Millisecond,
	}

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	// Graceful termination handling
	sigChan := make(chan os.Signal, 1)
	signal.Notify(sigChan, os.Interrupt, syscall.SIGTERM, syscall.SIGINT)
	go func() {
		<-sigChan
		log.Println("[INFO] Abbruchsignal empfangen, beende Snapshot-Generator...")
		cancel()
	}()

	fmt.Println("================================================================")
	fmt.Println("  HGK Mediathek 3D - Kisten Snapshot Generator")
	fmt.Printf("  Zielordner: %s\n", cfg.OutputDir)
	fmt.Printf("  Theme:      %s\n", cfg.Theme)
	if len(cfg.Shelves) > 0 {
		fmt.Printf("  Regale:     %s\n", strings.Join(cfg.Shelves, ", "))
	} else {
		fmt.Println("  Regale:     Alle (A–T, Y)")
	}
	if len(cfg.Boxes) > 0 {
		fmt.Printf("  Kisten:     %s\n", strings.Join(cfg.Boxes, ", "))
	}
	fmt.Printf("  Seiten:     %s\n", strings.Join(cfg.Sides, ", "))
	fmt.Printf("  Auflösung:  %dx%d\n", cfg.Width, cfg.Height)
	fmt.Printf("  Benennung:  %s\n", cfg.Naming)
	fmt.Println("================================================================")

	res, err := snapshot.Run(ctx, cfg)
	if err != nil {
		log.Fatalf("[FATAL] Fehler bei der Snapshot-Erstellung: %v", err)
	}

	fmt.Println("================================================================")
	fmt.Printf("  Erfolgreich abgeschlossen!\n")
	fmt.Printf("  Snapshots erstellt: %d\n", res.TotalSnapshots)
	fmt.Printf("  Übersprungen:       %d\n", res.SkippedSnapshots)
	fmt.Printf("  Dauer:              %s\n", res.Duration.Round(time.Millisecond))
	fmt.Printf("  Ausgabeordner:      %s\n", res.OutputDir)
	fmt.Println("================================================================")
}
