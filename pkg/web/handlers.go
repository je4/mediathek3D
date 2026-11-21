package web

import (
	"encoding/json"
	"fmt"
	"html/template"
	"io/fs"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"

	"mediathek3d/pkg/config"
	"mediathek3d/pkg/service"
)

// PageData represents the context passed into HTML templates during rendering.
type PageData struct {
	Title   string          `json:"title"`
	BaseURL string          `json:"baseUrl"`
	Box     string          `json:"box"`
	Shelf   string          `json:"shelf"`
	CamJSON string          `json:"camJson"`
	IsEmbed bool            `json:"isEmbed"`
	Summary service.Summary `json:"summary"`
}

// Handlers encapsulates HTTP endpoint controllers for web pages and JSON APIs.
type Handlers struct {
	cfg       *config.Config
	kistenSvc service.KistenService
	tmpl      *template.Template
}

// NewHandlers creates and initializes the Handlers instance.
func NewHandlers(cfg *config.Config, kistenSvc service.KistenService) (*Handlers, error) {
	h := &Handlers{
		cfg:       cfg,
		kistenSvc: kistenSvc,
	}

	if err := h.loadTemplates(); err != nil {
		return nil, fmt.Errorf("failed to parse templates: %w", err)
	}

	return h, nil
}

// loadTemplates parses Go templates from embedded FS or live development directory.
func (h *Handlers) loadTemplates() error {
	funcMap := template.FuncMap{
		"json": func(v interface{}) string {
			b, _ := json.Marshal(v)
			return string(b)
		},
		"upper":   strings.ToUpper,
		"lower":   strings.ToLower,
		"safeJS":  func(s string) template.JS { return template.JS(s) },
		"safeURL": func(s string) template.URL { return template.URL(s) },
		"assetURL": func(base, path string) template.HTML {
			if base == "" {
				base = "./"
			} else if !strings.HasSuffix(base, "/") {
				base += "/"
			}
			return template.HTML(`"` + base + path + `"`)
		},
	}

	if h.cfg.TemplateDir != "" {
		// Live filesystem templates for development
		pattern := filepath.Join(h.cfg.TemplateDir, "*.gohtml")
		partialPattern := filepath.Join(h.cfg.TemplateDir, "partials", "*.gohtml")
		tmpl, err := template.New("").Funcs(funcMap).ParseGlob(pattern)
		if err != nil {
			return err
		}
		if _, err := tmpl.ParseGlob(partialPattern); err != nil && !os.IsNotExist(err) {
			return err
		}
		h.tmpl = tmpl
		return nil
	}

	// Embedded templates
	tmplFS, err := fs.Sub(TemplateFS, "template")
	if err != nil {
		return err
	}

	tmpl, err := template.New("").Funcs(funcMap).ParseFS(tmplFS, "*.gohtml", "partials/*.gohtml")
	if err != nil {
		return err
	}

	h.tmpl = tmpl
	return nil
}

// HandleIndex renders the full-featured interactive 3D Mediathek viewer page.
func (h *Handlers) HandleIndex(w http.ResponseWriter, r *http.Request) {
	if r.URL.Path != "/" && r.URL.Path != "/index.html" && r.URL.Path != "/3d" && r.URL.Path != "/3dfull" {
		http.NotFound(w, r)
		return
	}

	h.renderTemplate(w, r, "index.gohtml", false)
}

// HandleEmbed renders the minimal embeddable viewer page suitable for iframes.
func (h *Handlers) HandleEmbed(w http.ResponseWriter, r *http.Request) {
	h.renderTemplate(w, r, "embed.gohtml", true)
}

func (h *Handlers) renderTemplate(w http.ResponseWriter, r *http.Request, templateName string, isEmbed bool) {
	q := r.URL.Query()
	box := strings.TrimSpace(q.Get("box"))
	shelf := strings.TrimSpace(q.Get("shelf"))
	camJSON := strings.TrimSpace(q.Get("cam"))

	baseURL := h.cfg.BaseURL
	if baseURL == "" {
		baseURL = "./"
	} else if !strings.HasSuffix(baseURL, "/") {
		baseURL += "/"
	}

	data := PageData{
		Title:   h.cfg.Title,
		BaseURL: baseURL,
		Box:     box,
		Shelf:   shelf,
		CamJSON: camJSON,
		IsEmbed: isEmbed,
		Summary: h.kistenSvc.GetSummary(),
	}

	w.Header().Set("Content-Type", "text/html; charset=utf-8")

	// In live template dev mode, reload templates per request
	if h.cfg.TemplateDir != "" {
		if err := h.loadTemplates(); err != nil {
			http.Error(w, fmt.Sprintf("Template compilation error: %v", err), http.StatusInternalServerError)
			return
		}
	}

	if err := h.tmpl.ExecuteTemplate(w, templateName, data); err != nil {
		http.Error(w, fmt.Sprintf("Template rendering error: %v", err), http.StatusInternalServerError)
	}
}

// HandleBoxesJSON returns the raw shelf geometry and level configuration JSON.
func (h *Handlers) HandleBoxesJSON(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write(h.kistenSvc.GetRawJSON())
}

// HandleBoxesSearch searches boxes by ID, shelf letter, or area query string.
func (h *Handlers) HandleBoxesSearch(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query().Get("q")
	limitStr := r.URL.Query().Get("limit")
	limit := 50
	if limitStr != "" {
		if l, err := strconv.Atoi(limitStr); err == nil && l > 0 {
			limit = l
		}
	}

	results := h.kistenSvc.SearchBoxes(q, limit)

	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	_ = json.NewEncoder(w).Encode(results)
}

// HandleBoxDetail looks up details for an individual box ID.
func (h *Handlers) HandleBoxDetail(w http.ResponseWriter, r *http.Request) {
	// Path: /api/boxes/detail?id=A101 or /api/boxes/{id}
	boxID := r.URL.Query().Get("id")
	if boxID == "" {
		parts := strings.Split(strings.TrimPrefix(r.URL.Path, "/api/boxes/"), "/")
		if len(parts) > 0 && parts[0] != "" {
			boxID = parts[0]
		}
	}

	box, found := h.kistenSvc.GetBoxByID(boxID)
	if !found || box == nil {
		w.Header().Set("Content-Type", "application/json; charset=utf-8")
		w.WriteHeader(http.StatusNotFound)
		_ = json.NewEncoder(w).Encode(map[string]string{
			"error": fmt.Sprintf("Box %q not found", boxID),
		})
		return
	}

	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	_ = json.NewEncoder(w).Encode(box)
}

// HandleBoxesSummary returns aggregate statistics about shelves and boxes.
func (h *Handlers) HandleBoxesSummary(w http.ResponseWriter, r *http.Request) {
	summary := h.kistenSvc.GetSummary()
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	_ = json.NewEncoder(w).Encode(summary)
}

// HandleHealth provides a lightweight healthcheck endpoint.
func (h *Handlers) HandleHealth(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	_ = json.NewEncoder(w).Encode(map[string]interface{}{
		"status":  "ok",
		"version": "2.0.0",
		"service": "mediathek3d",
	})
}
