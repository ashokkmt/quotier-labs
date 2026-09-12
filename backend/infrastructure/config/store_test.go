package config

import (
	"path/filepath"
	"testing"
)

func TestStoreRoundTrip(t *testing.T) {
	store := NewStore(filepath.Join(t.TempDir(), "config", "settings.json"))
	value, err := store.Load()
	if err != nil || value.Theme != "system" {
		t.Fatalf("defaults: %#v %v", value, err)
	}
	value.Theme = "dark"
	value.Density = "compact"
	value.V6EditorEnabled = true
	if err := store.Save(value); err != nil {
		t.Fatal(err)
	}
	got, err := store.Load()
	if err != nil || got.Theme != "dark" || got.Density != "compact" || !got.V6EditorEnabled {
		t.Fatalf("round trip: %#v %v", got, err)
	}
}
