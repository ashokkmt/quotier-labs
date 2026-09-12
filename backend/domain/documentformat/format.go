// Package documentformat performs the deliberately small V5/V6 schema switch.
package documentformat

import (
	"encoding/json"
	"fmt"

	"quotierlabs/backend/domain/documentmodel"
	"quotierlabs/backend/domain/documentv6"
)

// CurrentVersion is the newest document schema this binary can create and validate.
const CurrentVersion = documentv6.SchemaVersion

func Version(raw []byte) (int, error) {
	var envelope struct {
		SchemaVersion int `json:"schema_version"`
	}
	if err := json.Unmarshal(raw, &envelope); err != nil || envelope.SchemaVersion == 0 {
		return 0, fmt.Errorf("document schema version is required")
	}
	return envelope.SchemaVersion, nil
}

// Validate returns the explicit schema version after running its strict validator.
func Validate(raw []byte) (int, error) {
	version, err := Version(raw)
	if err != nil {
		return 0, err
	}
	switch version {
	case documentmodel.SchemaVersion:
		_, err = documentmodel.Parse(raw)
	case documentv6.SchemaVersion:
		_, err = documentv6.Parse(raw)
	default:
		return 0, fmt.Errorf("unsupported document schema version %d", version)
	}
	if err != nil {
		return 0, err
	}
	return version, nil
}
