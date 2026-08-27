package tests

import (
	"testing"
	"quotierlabs/backend/infrastructure/id"
)

func TestIDGeneration(t *testing.T) {
	generator := id.NewULIDGenerator()
	id1 := generator.Generate()
	id2 := generator.Generate()

	if id1 == "" || id2 == "" {
		t.Errorf("expected non-empty IDs")
	}

	if id1 == id2 {
		t.Errorf("expected unique IDs, got identical: %s", id1)
	}
}
