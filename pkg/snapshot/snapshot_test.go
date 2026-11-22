package snapshot_test

import (
	"context"
	"os"
	"path/filepath"
	"testing"
	"time"

	"mediathek3d/pkg/snapshot"
)

func TestSnapshotRun(t *testing.T) {
	browserPath, err := snapshot.FindBrowser("")
	if err != nil {
		t.Skipf("Skipping end-to-end browser test: %v", err)
	}

	tempDir, err := os.MkdirTemp("", "mediathek-snap-test-*")
	if err != nil {
		t.Fatalf("Failed to create temp dir: %v", err)
	}
	defer func() {
		_ = os.RemoveAll(tempDir)
	}()

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	cfg := snapshot.Config{
		OutputDir:   tempDir,
		Shelves:     []string{"A", "P"},
		Boxes:       []string{"A101", "P301"},
		Sides:       []string{"a", "b"},
		Theme:       "olive",
		Width:       1080,
		Height:      1080,
		BrowserPath: browserPath,
		Naming:      "flat",
		Quiet:       true,
		Overwrite:   true,
	}

	res, err := snapshot.Run(ctx, cfg)
	if err != nil {
		t.Fatalf("Snapshot Run failed: %v", err)
	}

	if res.TotalSnapshots < 3 {
		t.Errorf("Expected at least 3 snapshot sets, got %d", res.TotalSnapshots)
	}

	// Verify subdirectories and files
	subdirs := []string{"raw", "title", "raw_small", "title_small"}
	expectedFiles := []string{"A101a.png", "A101b.png", "P301a.png", "P301b.png"}

	for _, sub := range subdirs {
		for _, f := range expectedFiles {
			p := filepath.Join(tempDir, sub, f)
			if info, err := os.Stat(p); err != nil || info.Size() == 0 {
				t.Errorf("Expected valid file at %s, error: %v", p, err)
			}
		}
	}

	// Verify extra Information snapshot for P301a
	infoTitlePath := filepath.Join(tempDir, "title", "P301a_information.png")
	if info, err := os.Stat(infoTitlePath); err != nil || info.Size() == 0 {
		t.Errorf("Expected valid Information snapshot at %s", infoTitlePath)
	}

	infoSmallPath := filepath.Join(tempDir, "title_small", "P301a_information.png")
	if info, err := os.Stat(infoSmallPath); err != nil || info.Size() == 0 {
		t.Errorf("Expected valid Information thumbnail at %s", infoSmallPath)
	}
}
