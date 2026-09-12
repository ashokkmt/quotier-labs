package quotation

import (
	"errors"
	"quotierlabs/backend/domain"
	"quotierlabs/backend/domain/documentformat"
)

var (
	ErrInvalidStatus   = errors.New("invalid quotation status")
	ErrInvalidDocument = errors.New("invalid quotation document")
)

func ValidateQuotation(q *domain.Quotation) error {
	switch Status(q.Status) {
	case StatusDraft, StatusFinalized, StatusSent, StatusAccepted, StatusRejected, StatusExpired:
		// Valid
	default:
		return ErrInvalidStatus
	}

	if q.Document == "" {
		return ErrInvalidDocument
	}
	version, err := documentformat.Validate([]byte(q.Document))
	if err != nil || (q.SchemaVersion != 0 && version != q.SchemaVersion) {
		return ErrInvalidDocument
	}

	return nil
}
