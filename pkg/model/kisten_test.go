package model_test

import (
	"github.com/je4/mediathek3D/pkg/model"
	"testing"
)

func TestFormatBoxID(t *testing.T) {
	tests := []struct {
		shelf    string
		level    int
		index    int
		expected string
	}{
		{"A", 1, 1, "A101"},
		{"A", 2, 7, "A207"},
		{"K", 3, 12, "K312"},
		{"Z", 5, 3, "Z503"},
	}

	for _, tt := range tests {
		result := model.FormatBoxID(tt.shelf, tt.level, tt.index)
		if result != tt.expected {
			t.Errorf("FormatBoxID(%q, %d, %d) = %q; want %q", tt.shelf, tt.level, tt.index, result, tt.expected)
		}
	}
}

func TestFormatBoxSideID(t *testing.T) {
	tests := []struct {
		shelf    string
		level    int
		index    int
		side     string
		expected string
	}{
		{"P", 1, 1, "a", "P101a"},
		{"P", 1, 1, "b", "P101b"},
		{"A", 2, 7, "a", "A207a"},
		{"A", 2, 7, "b", "A207b"},
	}

	for _, tt := range tests {
		result := model.FormatBoxSideID(tt.shelf, tt.level, tt.index, tt.side)
		if result != tt.expected {
			t.Errorf("FormatBoxSideID(%q, %d, %d, %q) = %q; want %q", tt.shelf, tt.level, tt.index, tt.side, result, tt.expected)
		}
	}
}
