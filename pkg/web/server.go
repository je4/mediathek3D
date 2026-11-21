package web

import (
	"context"
	"fmt"
	"io/fs"
	"log"
	"net/http"
	"strings"
	"time"

	"mediathek3d/pkg/config"
	"mediathek3d/pkg/service"
)

// Server wraps the HTTP server instance and router configuration.
type Server struct {
	cfg        *config.Config
	handlers   *Handlers
	httpServer *http.Server
	router     http.Handler
}

// NewServer initializes the HTTP routing table, static file handlers, and middleware.
func NewServer(cfg *config.Config, kistenSvc service.KistenService) (*Server, error) {
	handlers, err := NewHandlers(cfg, kistenSvc)
	if err != nil {
		return nil, fmt.Errorf("failed to initialize web handlers: %w", err)
	}

	mux := http.NewServeMux()

	// Static Assets Server
	var staticHandler http.Handler
	if cfg.StaticDir != "" {
		// Live filesystem directory for frontend development
		staticHandler = http.StripPrefix("/static/", http.FileServer(http.Dir(cfg.StaticDir)))
	} else {
		// Embedded static files
		staticSubFS, err := fs.Sub(StaticFS, "static")
		if err != nil {
			return nil, fmt.Errorf("failed to create static sub-filesystem: %w", err)
		}
		staticHandler = http.StripPrefix("/static/", http.FileServer(http.FS(staticSubFS)))
	}

	mux.Handle("/static/", staticHandler)

	// Web Pages (Templates)
	mux.HandleFunc("/", handlers.HandleIndex)
	mux.HandleFunc("/index.html", handlers.HandleIndex)
	mux.HandleFunc("/3d", handlers.HandleIndex)
	mux.HandleFunc("/3dfull", handlers.HandleIndex)
	mux.HandleFunc("/embed", handlers.HandleEmbed)

	// JSON REST API Endpoints
	mux.HandleFunc("/api/boxes", func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/api/boxes" {
			handlers.HandleBoxesJSON(w, r)
			return
		}
		http.NotFound(w, r)
	})
	mux.HandleFunc("/api/boxes/", func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/api/boxes/" {
			handlers.HandleBoxesJSON(w, r)
			return
		}
		handlers.HandleBoxDetail(w, r)
	})
	mux.HandleFunc("/api/boxes/search", handlers.HandleBoxesSearch)
	mux.HandleFunc("/api/boxes/summary", handlers.HandleBoxesSummary)
	mux.HandleFunc("/health", handlers.HandleHealth)

	// Apply Middlewares
	var handler http.Handler = mux
	handler = securityHeadersMiddleware(handler, cfg)
	if cfg.EnableCORS {
		handler = corsMiddleware(handler)
	}
	handler = loggingMiddleware(handler)
	handler = recoveryMiddleware(handler)

	httpServer := &http.Server{
		Addr:         cfg.Address(),
		Handler:      handler,
		ReadTimeout:  15 * time.Second,
		WriteTimeout: 15 * time.Second,
		IdleTimeout:  60 * time.Second,
	}

	return &Server{
		cfg:        cfg,
		handlers:   handlers,
		httpServer: httpServer,
		router:     handler,
	}, nil
}

// Handler returns the underlying configured HTTP handler (useful for testing).
func (s *Server) Handler() http.Handler {
	return s.router
}

// ListenAndServe starts the HTTP server.
func (s *Server) ListenAndServe() error {
	log.Printf("[INFO] Mediathek 3D server listening on http://%s", s.cfg.Address())
	if err := s.httpServer.ListenAndServe(); err != nil && err != http.ErrServerClosed {
		return err
	}
	return nil
}

// Shutdown gracefully shuts down the HTTP server without interrupting active connections.
func (s *Server) Shutdown(ctx context.Context) error {
	return s.httpServer.Shutdown(ctx)
}

// Middlewares

func recoveryMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		defer func() {
			if rec := recover(); rec != nil {
				log.Printf("[ERROR] Panic recovered in HTTP handler: %v", rec)
				http.Error(w, "Internal Server Error", http.StatusInternalServerError)
			}
		}()
		next.ServeHTTP(w, r)
	})
}

func loggingMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		start := time.Now()
		rw := &responseWriterInterceptor{ResponseWriter: w, statusCode: http.StatusOK}
		next.ServeHTTP(rw, r)
		duration := time.Since(start)

		// Omit verbose logs for static assets in non-debug
		if !strings.HasPrefix(r.URL.Path, "/static/") || rw.statusCode >= 400 {
			log.Printf("[HTTP] %s %s %d %s", r.Method, r.URL.Path, rw.statusCode, duration)
		}
	})
}

func corsMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, OPTIONS, HEAD")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Requested-With")

		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}

		next.ServeHTTP(w, r)
	})
}

func securityHeadersMiddleware(next http.Handler, cfg *config.Config) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("X-Content-Type-Options", "nosniff")
		w.Header().Set("X-XSS-Protection", "1; mode=block")
		// Allow embedding in iframes for the /embed endpoint or general viewer
		w.Header().Set("X-Frame-Options", "ALLOWALL")

		next.ServeHTTP(w, r)
	})
}

type responseWriterInterceptor struct {
	http.ResponseWriter
	statusCode int
}

func (rw *responseWriterInterceptor) WriteHeader(code int) {
	rw.statusCode = code
	rw.ResponseWriter.WriteHeader(code)
}
