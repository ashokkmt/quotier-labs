package quotation

import (
	"errors"
	"quotierlabs/backend/domain"
)

var (
	ErrInvalidStatus = errors.New("invalid quotation status")
	ErrInvalidDocument = errors.New("invalid quotation document")
)

const (
	StatusDraft     = "DRAFT"
	StatusFinalized = "FINALIZED"
	StatusSent      = "SENT"
	StatusAccepted  = "ACCEPTED"
	StatusRejected  = "REJECTED"
	StatusExpired   = "EXPIRED"
)

func ValidateQuotation(q *domain.Quotation) error {
	switch q.Status {
	case StatusDraft, StatusFinalized, StatusSent, StatusAccepted, StatusRejected, StatusExpired:
		// Valid
	default:
		return ErrInvalidStatus
	}

	if q.Document != "" {
		doc, err := ParseDocument(q.Document)
		if err != nil {
			return ErrInvalidDocument
		}
		if err := ValidateDocument(doc); err != nil {
			return err
		}
	}

	return nil
}
