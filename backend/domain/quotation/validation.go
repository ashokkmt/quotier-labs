package quotation

import (
	"errors"
	"quotierlabs/backend/domain"
	"quotierlabs/backend/domain/documentmodel"
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
	if _, err := documentmodel.Parse([]byte(q.Document)); err != nil {
		return ErrInvalidDocument
	}

	return nil
}
