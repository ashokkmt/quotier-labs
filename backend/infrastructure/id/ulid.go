package id

import (
	"crypto/rand"
	"time"

	"github.com/oklog/ulid/v2"
	"quotierlabs/backend/domain"
)

// ULIDGenerator implements domain.IDGenerator using ULID.
type ULIDGenerator struct{}

// NewULIDGenerator creates a new ULIDGenerator.
func NewULIDGenerator() domain.IDGenerator {
	return &ULIDGenerator{}
}

// Generate creates a new ULID string.
func (g *ULIDGenerator) Generate() string {
	ms := ulid.Timestamp(time.Now())
	id, err := ulid.New(ms, rand.Reader)
	if err != nil {
		return ulid.Make().String()
	}
	return id.String()
}
