package service

import (
	"encoding/json"
	"fmt"
	"mediathek3d/pkg/model"
	"sort"
	"strconv"
	"strings"
	"sync"
)

// Summary holds aggregate statistics about the Mediathek shelves and boxes.
type Summary struct {
	TotalShelves int      `json:"totalShelves"`
	TotalBoxes   int      `json:"totalBoxes"`
	ShelfKeys    []string `json:"shelfKeys"`
	Areas        []string `json:"areas"`
}

// KistenService defines operations for querying shelf geometry and box information.
type KistenService interface {
	GetRawJSON() []byte
	GetShelves() map[string]model.Shelf
	GetShelf(name string) (*model.Shelf, bool)
	GetShelfKeys() []string
	GetAllBoxes() []model.BoxItem
	GetBoxByID(id string) (*model.BoxItem, bool)
	SearchBoxes(query string, limit int) []model.BoxItem
	GetSummary() Summary
}

type kistenService struct {
	rawJSON   []byte
	shelves   map[string]model.Shelf
	shelfKeys []string
	boxes     []model.BoxItem
	boxMap    map[string]model.BoxItem
	areas     []string
	summary   Summary
	mu        sync.RWMutex
}

// NewKistenService creates and initializes a KistenService from JSON bytes.
func NewKistenService(jsonData []byte) (KistenService, error) {
	var rawShelves map[string]struct {
		Point []model.Point `json:"point"`
		Aside string        `json:"aside"`
		Area  string        `json:"area,omitempty"`
		Level map[string]struct {
			Indent interface{} `json:"indent"`
			Boxes  interface{} `json:"boxes"`
		} `json:"level"`
	}

	if err := json.Unmarshal(jsonData, &rawShelves); err != nil {
		return nil, fmt.Errorf("failed to parse shelf data JSON: %w", err)
	}

	shelves := make(map[string]model.Shelf, len(rawShelves))
	var shelfKeys []string
	areaSet := make(map[string]struct{})
	var allBoxes []model.BoxItem
	boxMap := make(map[string]model.BoxItem)

	for key, rawShelf := range rawShelves {
		shelfKeys = append(shelfKeys, key)
		if rawShelf.Area != "" {
			areaSet[rawShelf.Area] = struct{}{}
		}

		shelf := model.Shelf{
			Point: rawShelf.Point,
			Aside: rawShelf.Aside,
			Area:  rawShelf.Area,
			Level: make(map[string]model.LevelInfo),
		}

		for lvlKey, lvlRaw := range rawShelf.Level {
			var indent float64
			var boxes int

			switch v := lvlRaw.Indent.(type) {
			case float64:
				indent = v
			case int:
				indent = float64(v)
			case string:
				indent, _ = strconv.ParseFloat(v, 64)
			}

			switch v := lvlRaw.Boxes.(type) {
			case float64:
				boxes = int(v)
			case int:
				boxes = v
			case string:
				boxes, _ = strconv.Atoi(v)
			}

			shelf.Level[lvlKey] = model.LevelInfo{
				Indent: indent,
				Boxes:  boxes,
			}

			lvlNum, _ := strconv.Atoi(lvlKey)
			for i := 1; i <= boxes; i++ {
				boxID := model.FormatBoxID(key, lvlNum, i)
				oppIndex := boxes - i + 1
				boxID2 := model.FormatBoxID(key, lvlNum, oppIndex)
				item := model.BoxItem{
					ID:         boxID,
					ID2:        boxID2,
					Shelf:      key,
					Level:      lvlNum,
					Index:      i,
					Index2:     oppIndex,
					Area:       rawShelf.Area,
					Aside:      rawShelf.Aside,
					TotalInLvl: boxes,
				}
				allBoxes = append(allBoxes, item)
				boxMap[boxID] = item
			}
		}

		shelves[key] = shelf
	}

	sort.Strings(shelfKeys)
	sort.Slice(allBoxes, func(i, j int) bool {
		return allBoxes[i].ID < allBoxes[j].ID
	})

	var areas []string
	for a := range areaSet {
		areas = append(areas, a)
	}
	sort.Strings(areas)

	summary := Summary{
		TotalShelves: len(shelves),
		TotalBoxes:   len(allBoxes),
		ShelfKeys:    shelfKeys,
		Areas:        areas,
	}

	return &kistenService{
		rawJSON:   jsonData,
		shelves:   shelves,
		shelfKeys: shelfKeys,
		boxes:     allBoxes,
		boxMap:    boxMap,
		areas:     areas,
		summary:   summary,
	}, nil
}

func (s *kistenService) GetRawJSON() []byte {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.rawJSON
}

func (s *kistenService) GetShelves() map[string]model.Shelf {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.shelves
}

func (s *kistenService) GetShelf(name string) (*model.Shelf, bool) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	shelf, ok := s.shelves[name]
	if !ok {
		return nil, false
	}
	return &shelf, true
}

func (s *kistenService) GetShelfKeys() []string {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.shelfKeys
}

func (s *kistenService) GetAllBoxes() []model.BoxItem {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.boxes
}

func (s *kistenService) GetBoxByID(id string) (*model.BoxItem, bool) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	box, ok := s.boxMap[strings.ToUpper(strings.TrimSpace(id))]
	if !ok {
		return nil, false
	}
	return &box, true
}

func (s *kistenService) SearchBoxes(query string, limit int) []model.BoxItem {
	s.mu.RLock()
	defer s.mu.RUnlock()

	q := strings.ToUpper(strings.TrimSpace(query))
	if q == "" {
		if limit > 0 && limit < len(s.boxes) {
			return s.boxes[:limit]
		}
		return s.boxes
	}

	var results []model.BoxItem
	for _, box := range s.boxes {
		if strings.Contains(strings.ToUpper(box.ID), q) ||
			strings.EqualFold(box.Shelf, q) ||
			strings.Contains(strings.ToUpper(box.Area), q) {
			results = append(results, box)
			if limit > 0 && len(results) >= limit {
				break
			}
		}
	}
	return results
}

func (s *kistenService) GetSummary() Summary {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.summary
}
