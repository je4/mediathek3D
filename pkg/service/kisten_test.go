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
		},
		"T": {
			"point": [{"x": 1100, "y": 600}, {"x": 1700, "y": 600}],
			"aside": "right",
			"hasb": false,
			"area": "Regal",
			"level": {
				"1": {"indent": 0, "boxes": 2}
			}
		}
	}`)

	svc, err := service.NewKistenService(sampleJSON)
	if err != nil {
		t.Fatalf("NewKistenService failed: %v", err)
	}

	// Verify shelves
	shelves := svc.GetShelves()
	if len(shelves) != 3 {
		t.Errorf("Expected 3 shelves, got %d", len(shelves))
	}

	shelfT, okT := svc.GetShelf("T")
	if !okT || shelfT == nil {
		t.Fatalf("Expected shelf T to exist")
	}
	if shelfT.HasBSide() {
		t.Errorf("Expected shelf T HasBSide() to be false")
	}

	// Verify boxes: A has 5, B has 1, T has 2 => 8 total
	boxes := svc.GetAllBoxes()
	if len(boxes) != 8 {
		t.Errorf("Expected 8 boxes, got %d", len(boxes))
	}

	// Box T101 should only have Side A ("T101a") and no Side B
	boxT101, foundT101 := svc.GetBoxByID("T101")
	if !foundT101 || boxT101 == nil {
		t.Errorf("Expected box T101 to be found")
	} else {
		if boxT101.ID != "T101a" || boxT101.ID2 != "" || boxT101.Name != "T101" {
			t.Errorf("Expected box T101 to have ID 'T101a' and empty ID2, got: %+v", boxT101)
		}
	}

	boxT101a, foundT101a := svc.GetBoxByID("T101a")
	if !foundT101a || boxT101a == nil {
		t.Errorf("Expected box T101a to be found")
	}

	_, foundT101b := svc.GetBoxByID("T101b")
	if foundT101b {
		t.Errorf("Expected box T101b to NOT be found since shelf T has no side B")
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
	if len(keys) != 3 || keys[0] != "A" || keys[1] != "B" || keys[2] != "T" {
		t.Errorf("Unexpected shelf keys: %v", keys)
	}

	// Verify boxes: A has (2 + 3) = 5 boxes, B has 1 box, T has 2 boxes => 8 total
	if len(boxes) != 8 {
		t.Errorf("Expected 8 boxes, got %d", len(boxes))
	}

	// Check specific box lookup by base ID, side a, and side b
	boxA101, found := svc.GetBoxByID("A101")
	if !found || boxA101 == nil {
		t.Errorf("Expected box A101 to be found")
	} else {
		if boxA101.Shelf != "A" || boxA101.Level != 1 || boxA101.Index != 1 || boxA101.ID != "A101a" || boxA101.ID2 != "A101b" || boxA101.Name != "A101" {
			t.Errorf("Box A101 data mismatch: %+v", boxA101)
		}
	}

	boxA101a, foundA101a := svc.GetBoxByID("a101a")
	if !foundA101a || boxA101a == nil || boxA101a.ID != "A101a" {
		t.Errorf("Expected box a101a to be found by side a: %+v", boxA101a)
	}

	boxA101b, foundA101b := svc.GetBoxByID("A101b")
	if !foundA101b || boxA101b == nil || boxA101b.ID2 != "A101b" {
		t.Errorf("Expected box A101b to be found by side b: %+v", boxA101b)
	}

	boxA201, foundA201 := svc.GetBoxByID("A201")
	if !foundA201 || boxA201 == nil {
		t.Errorf("Expected box A201 to be found")
	} else {
		if boxA201.ID != "A201a" || boxA201.ID2 != "A201b" {
			t.Errorf("Box A201 ID/ID2 mismatch: %+v", boxA201)
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

	searchBySideA := svc.SearchBoxes("A101a", 10)
	if len(searchBySideA) != 1 || searchBySideA[0].ID != "A101a" {
		t.Errorf("Expected search for A101a to return 1 match, got %+v", searchBySideA)
	}

	searchByBase := svc.SearchBoxes("A101", 10)
	if len(searchByBase) != 1 || searchByBase[0].Name != "A101" {
		t.Errorf("Expected search for A101 to return 1 match, got %+v", searchByBase)
	}

	summary := svc.GetSummary()
	if summary.TotalShelves != 3 || summary.TotalBoxes != 8 {
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
