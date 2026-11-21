package model_test

import (
	"mediathek3d/pkg/model"
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
