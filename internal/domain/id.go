package domain

// IDGenerator defines the interface for generating unique IDs.
type IDGenerator interface {
	// Generate returns a new globally unique, sortable string ID.
	Generate() string
}
