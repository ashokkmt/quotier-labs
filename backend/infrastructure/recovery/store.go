package recovery

import (
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"time"

	"quotierlabs/backend/infrastructure/fileutil"
)

var safeID = regexp.MustCompile(`^[A-Za-z0-9_-]{1,128}$`)

type Checkpoint struct {
	SchemaVersion int             `json:"schema_version"`
	UpdatedAt     time.Time       `json:"updated_at"`
	Document      json.RawMessage `json:"document"`
}

type Store struct{ root string }

func NewStore(root string) *Store { return &Store{root: root} }

func (s *Store) Save(id string, document json.RawMessage) error {
	path, err := s.path(id)
	if err != nil {
		return err
	}
	if len(document) == 0 || len(document) > 25*1024*1024 || !json.Valid(document) {
		return errors.New("invalid or oversized recovery document")
	}
	value, err := json.Marshal(Checkpoint{SchemaVersion: 1, UpdatedAt: time.Now().UTC(), Document: document})
	if err != nil {
		return err
	}
	if err := os.MkdirAll(s.root, 0700); err != nil {
		return err
	}
	return fileutil.AtomicWrite(path, value, 0600)
}

func (s *Store) Load(id string) (*Checkpoint, error) {
	path, err := s.path(id)
	if err != nil {
		return nil, err
	}
	raw, err := os.ReadFile(path)
	if errors.Is(err, os.ErrNotExist) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	var value Checkpoint
	if err := json.Unmarshal(raw, &value); err != nil || value.SchemaVersion != 1 || !json.Valid(value.Document) {
		return nil, errors.New("invalid recovery checkpoint")
	}
	return &value, nil
}

func (s *Store) Clear(id string) error {
	path, err := s.path(id)
	if err != nil {
		return err
	}
	err = os.Remove(path)
	if errors.Is(err, os.ErrNotExist) {
		return nil
	}
	return err
}

func (s *Store) path(id string) (string, error) {
	if !safeID.MatchString(id) {
		return "", fmt.Errorf("invalid recovery identifier")
	}
	return filepath.Join(s.root, id+".json"), nil
}
