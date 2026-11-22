package snapshot

import (
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
)

// FindBrowser locates a Chromium-based browser (Edge, Chrome, Chromium) on the system.
func FindBrowser(customPath string) (string, error) {
	if customPath != "" {
		if _, err := os.Stat(customPath); err == nil {
			return filepath.Abs(customPath)
		}
		if path, err := exec.LookPath(customPath); err == nil {
			return filepath.Abs(path)
		}
		return "", fmt.Errorf("custom browser path %q not found", customPath)
	}

	var candidates []string

	switch runtime.GOOS {
	case "windows":
		// Standard Edge and Chrome locations on Windows
		localAppData := os.Getenv("LOCALAPPDATA")
		progFiles := os.Getenv("ProgramFiles")
		progFilesX86 := os.Getenv("ProgramFiles(x86)")

		if progFiles != "" {
			candidates = append(candidates,
				filepath.Join(progFiles, "Microsoft", "Edge", "Application", "msedge.exe"),
				filepath.Join(progFiles, "Google", "Chrome", "Application", "chrome.exe"),
			)
		}
		if progFilesX86 != "" {
			candidates = append(candidates,
				filepath.Join(progFilesX86, "Microsoft", "Edge", "Application", "msedge.exe"),
				filepath.Join(progFilesX86, "Google", "Chrome", "Application", "chrome.exe"),
			)
		}
		if localAppData != "" {
			candidates = append(candidates,
				filepath.Join(localAppData, "Microsoft", "Edge", "Application", "msedge.exe"),
				filepath.Join(localAppData, "Google", "Chrome", "Application", "chrome.exe"),
				filepath.Join(localAppData, "Chromium", "Application", "chrome.exe"),
			)
		}
		candidates = append(candidates, "msedge.exe", "chrome.exe", "chromium.exe")

	case "darwin":
		candidates = append(candidates,
			"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
			"/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
			"/Applications/Chromium.app/Contents/MacOS/Chromium",
			"google-chrome",
			"microsoft-edge",
			"chromium",
		)

	default: // Linux / Unix
		candidates = append(candidates,
			"google-chrome",
			"google-chrome-stable",
			"chromium",
			"chromium-browser",
			"microsoft-edge",
			"microsoft-edge-stable",
			"/usr/bin/google-chrome",
			"/usr/bin/chromium",
			"/usr/bin/chromium-browser",
			"/usr/bin/microsoft-edge",
			"/snap/bin/chromium",
		)
	}

	for _, cand := range candidates {
		if filepath.IsAbs(cand) {
			if _, err := os.Stat(cand); err == nil {
				return cand, nil
			}
		} else {
			if path, err := exec.LookPath(cand); err == nil {
				return filepath.Abs(path)
			}
		}
	}

	return "", fmt.Errorf("no Chromium-based browser (Chrome, Edge, Chromium) found on your system. Please specify via --browser")
}
