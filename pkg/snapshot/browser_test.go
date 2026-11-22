package snapshot_test

import (
	"testing"

	"mediathek3d/pkg/snapshot"
)

func TestFindBrowser(t *testing.T) {
	// Custom path check
	_, err := snapshot.FindBrowser("non_existent_custom_browser_binary_12345")
	if err == nil {
		t.Errorf("Expected error for non-existent custom browser path")
	}

	// Auto-detect browser on current test system
	path, err := snapshot.FindBrowser("")
	if err != nil {
		t.Logf("Notice: No browser found on test runner: %v", err)
	} else {
		if path == "" {
			t.Errorf("Expected non-empty browser path")
		}
		t.Logf("Detected browser: %s", path)
	}
}
