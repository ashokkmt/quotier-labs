package wails

import (
	"encoding/json"
	"testing"

	"quotierlabs/backend/domain/documentv6"
	appconfig "quotierlabs/backend/infrastructure/config"
)

func TestTemplateV6CreationGate(t *testing.T) {
	document, err := json.Marshal(documentv6.NewBlank("paragraph"))
	if err != nil {
		t.Fatal(err)
	}
	store := appconfig.NewStore(t.TempDir() + "/preferences.json")
	handler := &TemplateHandler{preferences: store}
	if err := handler.requireV6CreationEnabled(string(document)); err == nil {
		t.Fatal("disabled V6 creation was allowed")
	}
	if _, err := store.Update(func(value *appconfig.Preferences) error {
		value.V6EditorEnabled = true
		return nil
	}); err != nil {
		t.Fatal(err)
	}
	if err := handler.requireV6CreationEnabled(string(document)); err != nil {
		t.Fatalf("enabled V6 creation was rejected: %v", err)
	}
	if err := handler.requireV6CreationEnabled(`{"schema_version":5}`); err != nil {
		t.Fatalf("non-V6 layout should reach normal validation, got %v", err)
	}
}
