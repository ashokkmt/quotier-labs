package quotation

import "testing"

func TestDocumentSchemaVersion(t *testing.T) {
	tests := []struct {
		name, input string
		want        int
	}{
		{"empty", "", 1},
		{"legacy", `{"rows":[]}`, 1},
		{"v4", `{"schema_version":4,"root":{"id":"root"}}`, 4},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			got, err := DocumentSchemaVersion(tc.input)
			if err != nil {
				t.Fatal(err)
			}
			if got != tc.want {
				t.Fatalf("got %d, want %d", got, tc.want)
			}
		})
	}
	if _, err := DocumentSchemaVersion(`{"schema_version":0}`); err == nil {
		t.Fatal("expected invalid version")
	}
}
