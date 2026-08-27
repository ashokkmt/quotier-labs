package domain

import "time"

type AuditMetadata struct {
	CreatedAt time.Time
	UpdatedAt time.Time
	CreatedBy *string
	UpdatedBy *string
	Version   int
	DeletedAt *time.Time
}
