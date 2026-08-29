package documentmigration

import (
	"testing"

	"quotierlabs/backend/domain/documentmodel"
)

func testIDs() IDFactory {
	n := 0
	return func(prefix string) string { n++; return prefix + "-generated-" + string(rune('0'+n)) }
}

func TestMigrateLegacyRowsToV5(t *testing.T) {
	d, err := Migrate([]byte(`{"rows":[{"id":"r1","columns":[{"id":"c1","width":"100%","sections":[{"id":"s1"}]}]}]}`), testIDs())
	if err != nil {
		t.Fatal(err)
	}
	if d.SchemaVersion != documentmodel.SchemaVersion || len(d.Root.Pages) != 1 {
		t.Fatalf("unexpected V5 document: %+v", d)
	}
	if len(d.Root.Pages[0].Children) != 1 || d.Root.Pages[0].Children[0].ID != "r1" {
		t.Fatalf("legacy IDs/order not retained")
	}
	encoded, err := MarshalV5(d)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := documentmodel.Parse(encoded); err != nil {
		t.Fatalf("V5 round-trip failed: %v", err)
	}
}

func TestMigrateRejectsUnknownVersion(t *testing.T) {
	if _, err := Migrate([]byte(`{"schema_version":99}`), testIDs()); err == nil {
		t.Fatal("expected unsupported version")
	}
}
