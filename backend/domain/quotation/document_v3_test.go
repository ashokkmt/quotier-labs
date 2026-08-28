package quotation

import (
	"errors"
	domain "quotierlabs/backend/domain"
	"testing"
)

func TestParseV3NestedDocumentPreservesWidgetData(t *testing.T) {
	doc, err := ParseDocument(`{"schema_version":3,"root":{"id":"root","kind":"root","widget":"root","children":[{"id":"heading","kind":"section","widget":"field.heading","props":{"text":"Crane"},"meta":{"visible":true,"optional":false},"children":[]}]}}`)
	if err != nil {
		t.Fatal(err)
	}
	if len(doc.Children) != 1 || doc.Children[0].WidgetType != "field.heading" || doc.Children[0].Settings["text"] != "Crane" {
		t.Fatalf("v3 widget data was not preserved: %#v", doc.Children)
	}
	if err := ValidateDocument(doc); err != nil {
		t.Fatal(err)
	}
}

func TestParseV3RejectsInvalidTree(t *testing.T) {
	doc, err := ParseDocument(`{"schema_version":3,"root":{"id":"root","kind":"root","children":[{"id":"column","kind":"column","children":[]}]}}`)
	if err != nil {
		t.Fatal(err)
	}
	if err := ValidateDocument(doc); !errors.Is(err, domain.ErrInvalidParent) {
		t.Fatalf("expected invalid parent, got %v", err)
	}
}
