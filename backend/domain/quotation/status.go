package quotation

import "errors"

type Status string

const (
	StatusDraft     Status = "DRAFT"
	StatusFinalized Status = "FINALIZED"
	StatusSent      Status = "SENT"
	StatusAccepted  Status = "ACCEPTED"
	StatusRejected  Status = "REJECTED"
	StatusExpired   Status = "EXPIRED"
)

var ErrInvalidTransition = errors.New("invalid quotation status transition")

func CanTransition(from, to Status) bool {
	if from == to {
		return true // technically a no-op, but not invalid
	}
	switch from {
	case StatusDraft:
		return to == StatusFinalized
	case StatusFinalized:
		return to == StatusSent || to == StatusExpired
	case StatusSent:
		return to == StatusAccepted || to == StatusRejected || to == StatusExpired
	case StatusAccepted, StatusRejected, StatusExpired:
		// Terminal states, no transitions out
		return false
	default:
		return false
	}
}

func ValidateTransition(from, to Status) error {
	if !CanTransition(from, to) {
		return ErrInvalidTransition
	}
	return nil
}
