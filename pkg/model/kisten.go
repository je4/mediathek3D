package model

import "fmt"

// Point represents a 2D coordinate on the 2048x2048 Mediathek floor plan.
type Point struct {
	X float64 `json:"x"`
	Y float64 `json:"y"`
}

// LevelInfo describes the configuration of a specific shelf level,
// including its lateral offset (indent) and total box capacity.
type LevelInfo struct {
	Indent float64 `json:"indent"`
	Boxes  int     `json:"boxes"`
}

// Shelf defines the geometric curve, orientation, area label, and multi-level
// configuration of a shelf unit within the Mediathek.
type Shelf struct {
	Point []Point              `json:"point"`
	Aside string               `json:"aside"` // "left" or "right"
	Area  string               `json:"area,omitempty"`
	Level map[string]LevelInfo `json:"level"`
}

// BoxItem represents an individual physical box within a shelf unit and level.
type BoxItem struct {
	ID         string `json:"id"`         // e.g. "A101", "K302"
	Shelf      string `json:"shelf"`      // Shelf letter (e.g. "A")
	Level      int    `json:"level"`      // Level number (e.g. 1)
	Index      int    `json:"index"`      // Box index within level (e.g. 1)
	Area       string `json:"area"`       // Functional area name (e.g. "Backoffice")
	Aside      string `json:"aside"`      // Aside orientation ("left" or "right")
	TotalInLvl int    `json:"totalInLvl"` // Total boxes on this level
}

// FormatBoxID formats shelf letter, level index, and box index into a standard 4-character ID (e.g. "A101").
func FormatBoxID(shelf string, level int, index int) string {
	return fmt.Sprintf("%s%d%02d", shelf, level, index)
}
