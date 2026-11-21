package service_test

import (
	"mediathek3d/pkg/service"
	"os"
	"path/filepath"
	"testing"
)

func TestKistenService(t *testing.T) {
	// Sample JSON data
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
			"level": {
				"1": {"indent": 0, "boxes": 1}
			}
		}
	}`)

	svc, err := service.NewKistenService(sampleJSON)
	if err != nil {
		t.Fatalf("NewKistenService failed: %v", err)
	}

	// Verify shelves
	shelves := svc.GetShelves()
	if len(shelves) != 2 {
		t.Errorf("Expected 2 shelves, got %d", len(shelves))
	}

	shelfA, ok := svc.GetShelf("A")
	if !ok || shelfA == nil {
		t.Fatalf("Expected shelf A to exist")
	}
	if shelfA.Area != "Backoffice" {
		t.Errorf("Expected shelf A area to be 'Backoffice', got %q", shelfA.Area)
	}
	if shelfA.Aside != "right" {
		t.Errorf("Expected shelf A aside to be 'right', got %q", shelfA.Aside)
	}

	// Verify shelf keys
	keys := svc.GetShelfKeys()
	if len(keys) != 2 || keys[0] != "A" || keys[1] != "B" {
		t.Errorf("Unexpected shelf keys: %v", keys)
	}

	// Verify boxes: A has (2 + 3) = 5 boxes, B has 1 box => 6 total
	boxes := svc.GetAllBoxes()
	if len(boxes) != 6 {
		t.Errorf("Expected 6 boxes, got %d", len(boxes))
	}

	// Check specific box lookup
	boxA101, found := svc.GetBoxByID("A101")
	if !found || boxA101 == nil {
		t.Errorf("Expected box A101 to be found")
	} else {
		if boxA101.Shelf != "A" || boxA101.Level != 1 || boxA101.Index != 1 || boxA101.ID2 != "A102" || boxA101.Index2 != 2 {
			t.Errorf("Box A101 data mismatch: %+v", boxA101)
		}
	}

	boxA201, foundA201 := svc.GetBoxByID("A201")
	if !foundA201 || boxA201 == nil {
		t.Errorf("Expected box A201 to be found")
	} else {
		if boxA201.ID2 != "A203" || boxA201.Index2 != 3 {
			t.Errorf("Box A201 ID2 mismatch: %+v", boxA201)
		}
	}

	boxA203, found := svc.GetBoxByID("a203")
	if !found || boxA203 == nil {
		t.Errorf("Expected case-insensitive lookup for a203 to succeed")
	}

	_, foundInvalid := svc.GetBoxByID("INVALID")
	if foundInvalid {
		t.Errorf("Expected INVALID box to not be found")
	}

	// Search tests
	searchResults := svc.SearchBoxes("Backoffice", 10)
	if len(searchResults) != 5 {
		t.Errorf("Expected 5 boxes in Backoffice search, got %d", len(searchResults))
	}

	summary := svc.GetSummary()
	if summary.TotalShelves != 2 || summary.TotalBoxes != 6 {
		t.Errorf("Unexpected summary: %+v", summary)
	}
}

func TestKistenServiceWithRealData(t *testing.T) {
	dataPath := filepath.Join("..", "web", "static", "data", "kistendata.json")
	data, err := os.ReadFile(dataPath)
	if err != nil {
		t.Skipf("Skipping real data test, file not found at %s: %v", dataPath, err)
		return
	}

	svc, err := service.NewKistenService(data)
	if err != nil {
		t.Fatalf("Failed to load real kistendata.json: %v", err)
	}

	summary := svc.GetSummary()
	if summary.TotalShelves == 0 || summary.TotalBoxes == 0 {
		t.Errorf("Expected non-empty shelves and boxes, got: %+v", summary)
	}

	t.Logf("Loaded %d shelves and %d total boxes from real data", summary.TotalShelves, summary.TotalBoxes)
}
