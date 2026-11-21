package web_test

import (
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"mediathek3d/pkg/config"
	"mediathek3d/pkg/model"
	"mediathek3d/pkg/service"
	"mediathek3d/pkg/web"
)

func setupTestServer(t *testing.T) (*web.Server, service.KistenService) {
	t.Helper()

	sampleJSON := []byte(`{
		"A": {
			"point": [{"x": 100, "y": 200}, {"x": 300, "y": 400}],
			"aside": "right",
			"area": "Backoffice",
			"level": {
				"1": {"indent": 1, "boxes": 2},
				"2": {"indent": 1.5, "boxes": 3}
			}
		},
		"B": {
			"point": [{"x": 500, "y": 600}],
			"aside": "left",
			"area": "Reading Area",
			"level": {
				"1": {"indent": 0, "boxes": 1}
			}
		}
	}`)

	kistenSvc, err := service.NewKistenService(sampleJSON)
	if err != nil {
		t.Fatalf("Failed to create KistenService: %v", err)
	}

	cfg := config.DefaultConfig()
	cfg.Title = "Test HGK Mediathek"
	cfg.EnableCORS = true

	srv, err := web.NewServer(cfg, kistenSvc)
	if err != nil {
		t.Fatalf("Failed to create Web Server: %v", err)
	}

	return srv, kistenSvc
}

func TestIndexPage(t *testing.T) {
	srv, _ := setupTestServer(t)
	handler := srv.Handler()

	req := httptest.NewRequest("GET", "/?box=A101&shelf=A", nil)
	w := httptest.NewRecorder()
	handler.ServeHTTP(w, req)

	resp := w.Result()
	if resp.StatusCode != http.StatusOK {
		t.Errorf("Expected status 200, got %d", resp.StatusCode)
	}

	body, _ := io.ReadAll(resp.Body)
	bodyStr := string(body)

	if !strings.Contains(bodyStr, "Test HGK Mediathek") {
		t.Errorf("Expected title 'Test HGK Mediathek' in rendered HTML")
	}
	if !strings.Contains(bodyStr, "initialBox: 'A101'") {
		t.Errorf("Expected initialBox 'A101' in inline script")
	}
	if !strings.Contains(bodyStr, "renderer-container") {
		t.Errorf("Expected renderer-container DOM element in HTML")
	}
	if !strings.Contains(bodyStr, `"three": "./static/js/three/three.module.js"`) {
		t.Errorf("Expected relative importmap for 'three', got HTML:\n%s", bodyStr)
	}
	if !strings.Contains(bodyStr, `"three/addons/": "./static/js/three/addons/"`) {
		t.Errorf("Expected relative importmap for 'three/addons/'")
	}
	if !strings.Contains(bodyStr, `"mediathek-app": "./static/js/mediathek-app.js"`) {
		t.Errorf("Expected relative importmap for 'mediathek-app'")
	}
	if !strings.Contains(bodyStr, `import { MediathekApp } from 'mediathek-app';`) {
		t.Errorf("Expected module import from 'mediathek-app', got HTML:\n%s", bodyStr)
	}
}

func TestEmbedPage(t *testing.T) {
	srv, _ := setupTestServer(t)
	handler := srv.Handler()

	req := httptest.NewRequest("GET", "/embed?box=B101", nil)
	w := httptest.NewRecorder()
	handler.ServeHTTP(w, req)

	resp := w.Result()
	if resp.StatusCode != http.StatusOK {
		t.Errorf("Expected status 200, got %d", resp.StatusCode)
	}

	body, _ := io.ReadAll(resp.Body)
	bodyStr := string(body)

	if !strings.Contains(bodyStr, "embed-mode") {
		t.Errorf("Expected embed-mode class on body")
	}
	if !strings.Contains(bodyStr, "isEmbed: true") {
		t.Errorf("Expected isEmbed: true in script")
	}
}

func TestBoxesJSONAPI(t *testing.T) {
	srv, _ := setupTestServer(t)
	handler := srv.Handler()

	req := httptest.NewRequest("GET", "/api/boxes", nil)
	w := httptest.NewRecorder()
	handler.ServeHTTP(w, req)

	resp := w.Result()
	if resp.StatusCode != http.StatusOK {
		t.Errorf("Expected status 200, got %d", resp.StatusCode)
	}

	var data map[string]interface{}
	if err := json.NewDecoder(resp.Body).Decode(&data); err != nil {
		t.Fatalf("Failed to decode JSON: %v", err)
	}

	if _, ok := data["A"]; !ok {
		t.Errorf("Expected shelf 'A' in JSON response")
	}
}

func TestBoxesSearchAPI(t *testing.T) {
	srv, _ := setupTestServer(t)
	handler := srv.Handler()

	req := httptest.NewRequest("GET", "/api/boxes/search?q=A10", nil)
	w := httptest.NewRecorder()
	handler.ServeHTTP(w, req)

	resp := w.Result()
	if resp.StatusCode != http.StatusOK {
		t.Errorf("Expected status 200, got %d", resp.StatusCode)
	}

	var results []model.BoxItem
	if err := json.NewDecoder(resp.Body).Decode(&results); err != nil {
		t.Fatalf("Failed to decode search results: %v", err)
	}

	if len(results) == 0 {
		t.Errorf("Expected search results for 'A10', got 0")
	} else if results[0].ID != "A101" {
		t.Errorf("Expected first result A101, got %q", results[0].ID)
	}
}

func TestBoxDetailAPI(t *testing.T) {
	srv, _ := setupTestServer(t)
	handler := srv.Handler()

	req := httptest.NewRequest("GET", "/api/boxes/A101", nil)
	w := httptest.NewRecorder()
	handler.ServeHTTP(w, req)

	resp := w.Result()
	if resp.StatusCode != http.StatusOK {
		t.Errorf("Expected status 200, got %d", resp.StatusCode)
	}

	var item model.BoxItem
	if err := json.NewDecoder(resp.Body).Decode(&item); err != nil {
		t.Fatalf("Failed to decode box detail: %v", err)
	}

	if item.ID != "A101" || item.Area != "Backoffice" {
		t.Errorf("Unexpected box item detail: %+v", item)
	}
}

func TestBoxesSummaryAPI(t *testing.T) {
	srv, _ := setupTestServer(t)
	handler := srv.Handler()

	req := httptest.NewRequest("GET", "/api/boxes/summary", nil)
	w := httptest.NewRecorder()
	handler.ServeHTTP(w, req)

	resp := w.Result()
	if resp.StatusCode != http.StatusOK {
		t.Errorf("Expected status 200, got %d", resp.StatusCode)
	}

	var summary service.Summary
	if err := json.NewDecoder(resp.Body).Decode(&summary); err != nil {
		t.Fatalf("Failed to decode summary: %v", err)
	}

	if summary.TotalShelves != 2 || summary.TotalBoxes != 6 {
		t.Errorf("Unexpected summary: %+v", summary)
	}
}

func TestHealthCheck(t *testing.T) {
	srv, _ := setupTestServer(t)
	handler := srv.Handler()

	req := httptest.NewRequest("GET", "/health", nil)
	w := httptest.NewRecorder()
	handler.ServeHTTP(w, req)

	resp := w.Result()
	if resp.StatusCode != http.StatusOK {
		t.Errorf("Expected status 200, got %d", resp.StatusCode)
	}

	var health map[string]interface{}
	if err := json.NewDecoder(resp.Body).Decode(&health); err != nil {
		t.Fatalf("Failed to decode health JSON: %v", err)
	}

	if health["status"] != "ok" {
		t.Errorf("Expected health status 'ok', got %v", health["status"])
	}
}

func TestStaticFiles(t *testing.T) {
	srv, _ := setupTestServer(t)
	handler := srv.Handler()

	staticFiles := []string{
		"/static/scss/mediathek3d.css",
		"/static/js/mediathek-core.js",
		"/static/js/mediathek-3d.js",
		"/static/js/mediathek-app.js",
		"/static/js/three/three.module.js",
		"/static/js/three/three.core.js",
		"/static/js/three/addons/controls/OrbitControls.js",
		"/static/js/three/addons/controls/TrackballControls.js",
		"/static/img/mt_background.png",
	}

	for _, path := range staticFiles {
		req := httptest.NewRequest("GET", path, nil)
		w := httptest.NewRecorder()
		handler.ServeHTTP(w, req)

		resp := w.Result()
		if resp.StatusCode != http.StatusOK {
			t.Errorf("Expected status 200 for static file %s, got %d", path, resp.StatusCode)
		}
	}
}

func TestCORSHeaders(t *testing.T) {
	srv, _ := setupTestServer(t)
	handler := srv.Handler()

	req := httptest.NewRequest("OPTIONS", "/api/boxes", nil)
	w := httptest.NewRecorder()
	handler.ServeHTTP(w, req)

	resp := w.Result()
	if resp.Header.Get("Access-Control-Allow-Origin") != "*" {
		t.Errorf("Expected CORS Access-Control-Allow-Origin: *")
	}
}
