package domain

import "errors"

// Domain errors
var (
	ErrNotFound             = errors.New("record not found")
	ErrDuplicateNumber      = errors.New("duplicate number")
	ErrInvalidTransition    = errors.New("invalid status transition")
	ErrUnauthorized         = errors.New("unauthorized: company ownership violation")
	ErrConflict             = errors.New("optimistic concurrency conflict")
	ErrInternal             = errors.New("internal server error")
	ErrInvalidParent        = errors.New("block cannot be placed in that parent")
	ErrCycle                = errors.New("block tree contains a cycle")
	ErrMaxDepthExceeded     = errors.New("block tree exceeds maximum depth")
	ErrFieldsOutsideSection = errors.New("fields and tables may only be inside a section")
)

// ValidationError represents field-level validation errors
type ValidationError struct {
	Field   string
	Message string
}

func (e *ValidationError) Error() string {
	return e.Field + ": " + e.Message
}

type ValidationErrors []*ValidationError

func (v ValidationErrors) Error() string {
	if len(v) == 0 {
		return "validation failed"
	}
	return "validation failed: " + v[0].Error()
}
