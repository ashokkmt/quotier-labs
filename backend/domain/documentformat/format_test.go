package documentformat

import (
	"encoding/json"
	"testing"

	"quotierlabs/backend/domain/documentmodel"
	"quotierlabs/backend/domain/documentv6"
)

func TestValidateDispatch(t *testing.T) {
	for _, value := range []any{documentmodel.NewBlank("v5-page"), documentv6.NewBlank("v6-paragraph")} {
		raw, _ := json.Marshal(value)
		version, err := Validate(raw)
		if err != nil || (version != 5 && version != 6) {
			t.Fatalf("version=%d err=%v", version, err)
		}
	}
	if _, err := Validate([]byte(`{"schema_version":7}`)); err == nil {
		t.Fatal("unknown schema accepted")
	}
}
