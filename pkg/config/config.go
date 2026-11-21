package config

import (
	"flag"
	"fmt"
	"os"
	"strconv"
)

// Config holds the runtime configuration parameters for the Mediathek 3D server.
type Config struct {
	Host        string `json:"host"`
	Port        int    `json:"port"`
	BaseURL     string `json:"baseUrl"`
	Title       string `json:"title"`
	DataPath    string `json:"dataPath"`    // Optional override for kistendata.json
	StaticDir   string `json:"staticDir"`   // Optional live static files directory
	TemplateDir string `json:"templateDir"` // Optional live templates directory
	EnableCORS  bool   `json:"enableCors"`
	LogLevel    string `json:"logLevel"`
}

// DefaultConfig returns a Config struct populated with production-ready defaults.
func DefaultConfig() *Config {
	return &Config{
		Host:        "0.0.0.0",
		Port:        8080,
		BaseURL:     "./",
		Title:       "HGK Mediathek 3D",
		DataPath:    "",
		StaticDir:   "",
		TemplateDir: "",
		EnableCORS:  true,
		LogLevel:    "info",
	}
}

// ParseFlags parses command line arguments and environment variables into Config.
func ParseFlags(args []string) (*Config, error) {
	cfg := DefaultConfig()

	fs := flag.NewFlagSet("mediathek3d", flag.ContinueOnError)

	fs.StringVar(&cfg.Host, "host", getEnvString("MEDIATHEK_HOST", cfg.Host), "HTTP server host to bind")
	fs.IntVar(&cfg.Port, "port", getEnvInt("MEDIATHEK_PORT", cfg.Port), "HTTP server port to listen on")
	fs.StringVar(&cfg.BaseURL, "base-url", getEnvString("MEDIATHEK_BASE_URL", cfg.BaseURL), "Base URL path prefix")
	fs.StringVar(&cfg.Title, "title", getEnvString("MEDIATHEK_TITLE", cfg.Title), "Application title displayed in browser")
	fs.StringVar(&cfg.DataPath, "data-path", getEnvString("MEDIATHEK_DATA_PATH", cfg.DataPath), "Custom path to kistendata.json (default: embedded)")
	fs.StringVar(&cfg.StaticDir, "static-dir", getEnvString("MEDIATHEK_STATIC_DIR", cfg.StaticDir), "Live static files directory for development (default: embedded)")
	fs.StringVar(&cfg.TemplateDir, "template-dir", getEnvString("MEDIATHEK_TEMPLATE_DIR", cfg.TemplateDir), "Live template directory for development (default: embedded)")
	fs.BoolVar(&cfg.EnableCORS, "enable-cors", getEnvBool("MEDIATHEK_ENABLE_CORS", cfg.EnableCORS), "Enable Cross-Origin Resource Sharing (CORS)")
	fs.StringVar(&cfg.LogLevel, "log-level", getEnvString("MEDIATHEK_LOG_LEVEL", cfg.LogLevel), "Log level (debug, info, warn, error)")

	if err := fs.Parse(args); err != nil {
		return nil, err
	}

	return cfg, nil
}

// Address returns the formatted host:port network address.
func (c *Config) Address() string {
	return fmt.Sprintf("%s:%d", c.Host, c.Port)
}

func getEnvString(key, defaultValue string) string {
	if val, ok := os.LookupEnv(key); ok && val != "" {
		return val
	}
	return defaultValue
}

func getEnvInt(key string, defaultValue int) int {
	if val, ok := os.LookupEnv(key); ok && val != "" {
		if parsed, err := strconv.Atoi(val); err == nil {
			return parsed
		}
	}
	return defaultValue
}

func getEnvBool(key string, defaultValue bool) bool {
	if val, ok := os.LookupEnv(key); ok && val != "" {
		if parsed, err := strconv.ParseBool(val); err == nil {
			return parsed
		}
	}
	return defaultValue
}
