package wails

import (
	"errors"
	"quotierlabs/backend/domain"
)

// ErrorDTO represents a transport-safe error structure
type ErrorDTO struct {
	Code    string      `json:"code"`
	Message string      `json:"message"`
	Details interface{} `json:"details,omitempty"`
}

// MapError converts internal domain errors to safe transport DTOs
func MapError(err error) ErrorDTO {
	if err == nil {
		return ErrorDTO{}
	}

	var valErrs domain.ValidationErrors
	if errors.As(err, &valErrs) {
		return ErrorDTO{
			Code:    "VALIDATION_ERROR",
			Message: "Validation failed",
			Details: valErrs,
		}
	}

	if errors.Is(err, domain.ErrNotFound) {
		return ErrorDTO{
			Code:    "NOT_FOUND",
			Message: "The requested record was not found",
		}
	}

	if errors.Is(err, domain.ErrDuplicateNumber) {
		return ErrorDTO{
			Code:    "DUPLICATE_NUMBER",
			Message: "A record with this number already exists",
		}
	}

	if errors.Is(err, domain.ErrInvalidTransition) {
		return ErrorDTO{
			Code:    "INVALID_TRANSITION",
			Message: "This action is not allowed in the current state",
		}
	}

	if errors.Is(err, domain.ErrUnauthorized) {
		return ErrorDTO{
			Code:    "UNAUTHORIZED",
			Message: "You do not have permission to access this record",
		}
	}

	if errors.Is(err, domain.ErrConflict) {
		return ErrorDTO{
			Code:    "CONFLICT",
			Message: "The record was modified by another user",
		}
	}

	// Default fallback for internal errors
	return ErrorDTO{
		Code:    "INTERNAL_ERROR",
		Message: "An internal server error occurred",
	}
}
