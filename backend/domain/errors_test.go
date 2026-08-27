package domain

import (
	"testing"
)

func TestErrorTaxonomy(t *testing.T) {
	if ErrNotFound.Error() != "record not found" {
		t.Errorf("unexpected error string")
	}

	vErr := ValidationErrors{
		&ValidationError{Field: "name", Message: "required"},
	}

	if vErr.Error() != "validation failed: name: required" {
		t.Errorf("unexpected validation error string: %v", vErr.Error())
	}
}
