package config_test

import (
	"github.com/je4/mediathek3D/pkg/config"
	"os"
	"testing"
)

func TestDefaultConfig(t *testing.T) {
	cfg := config.DefaultConfig()
	if cfg.Port != 8080 {
		t.Errorf("Expected default port 8080, got %d", cfg.Port)
	}
	if cfg.Address() != "0.0.0.0:8080" {
		t.Errorf("Expected address '0.0.0.0:8080', got %q", cfg.Address())
	}
}

func TestParseFlags(t *testing.T) {
	args := []string{
		"-host=127.0.0.1",
		"-port=9090",
		"-title=Test Mediathek",
		"-enable-cors=false",
	}

	cfg, err := config.ParseFlags(args)
	if err != nil {
		t.Fatalf("ParseFlags failed: %v", err)
	}

	if cfg.Host != "127.0.0.1" {
		t.Errorf("Expected host 127.0.0.1, got %q", cfg.Host)
	}
	if cfg.Port != 9090 {
		t.Errorf("Expected port 9090, got %d", cfg.Port)
	}
	if cfg.Title != "Test Mediathek" {
		t.Errorf("Expected title 'Test Mediathek', got %q", cfg.Title)
	}
	if cfg.EnableCORS {
		t.Errorf("Expected EnableCORS false, got true")
	}
	if cfg.Address() != "127.0.0.1:9090" {
		t.Errorf("Expected address '127.0.0.1:9090', got %q", cfg.Address())
	}
}

func TestEnvOverride(t *testing.T) {
	os.Setenv("MEDIATHEK_PORT", "9999")
	os.Setenv("MEDIATHEK_TITLE", "Env Title")
	defer func() {
		os.Unsetenv("MEDIATHEK_PORT")
		os.Unsetenv("MEDIATHEK_TITLE")
	}()

	cfg, err := config.ParseFlags([]string{})
	if err != nil {
		t.Fatalf("ParseFlags failed: %v", err)
	}

	if cfg.Port != 9999 {
		t.Errorf("Expected env port 9999, got %d", cfg.Port)
	}
	if cfg.Title != "Env Title" {
		t.Errorf("Expected env title 'Env Title', got %q", cfg.Title)
	}
}
