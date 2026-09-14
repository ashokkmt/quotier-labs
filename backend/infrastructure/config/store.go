package config

import (
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"sync"

	"quotierlabs/backend/infrastructure/fileutil"
)

const SchemaVersion = 1

type Preferences struct {
	SchemaVersion             int    `json:"schema_version"`
	Theme                     string `json:"theme"`
	Density                   string `json:"density"`
	AutomaticUpdates          bool   `json:"automatic_updates"`
	SkippedVersion            string `json:"skipped_version,omitempty"`
	LastUpdateCheckUTC        string `json:"last_update_check_utc,omitempty"`
	LastObservedUpdateVersion string `json:"last_observed_update_version,omitempty"`
	UpdateFeedETag            string `json:"update_feed_etag,omitempty"`
	UpdateFeedLastModified    string `json:"update_feed_last_modified,omitempty"`
}

func Defaults() Preferences {
	return Preferences{SchemaVersion: SchemaVersion, Theme: "system", Density: "default", AutomaticUpdates: false}
}

type Store struct {
	path string
	mu   sync.Mutex
}

func NewStore(path string) *Store { return &Store{path: path} }

func (s *Store) Load() (Preferences, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.loadLocked()
}

func (s *Store) Save(value Preferences) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.saveLocked(value)
}

func (s *Store) Update(fn func(*Preferences) error) (Preferences, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	value, err := s.loadLocked()
	if err != nil {
		return Preferences{}, err
	}
	if err := fn(&value); err != nil {
		return Preferences{}, err
	}
	if err := s.saveLocked(value); err != nil {
		return Preferences{}, err
	}
	return value, nil
}

func (s *Store) loadLocked() (Preferences, error) {
	value := Defaults()
	raw, err := os.ReadFile(s.path)
	if errors.Is(err, os.ErrNotExist) {
		return value, nil
	}
	if err != nil {
		return Preferences{}, fmt.Errorf("read preferences: %w", err)
	}
	if err := json.Unmarshal(raw, &value); err != nil {
		quarantine := s.path + ".corrupt"
		_ = os.Rename(s.path, quarantine)
		return Defaults(), fmt.Errorf("preferences were corrupt and preserved as %s: %w", filepath.Base(quarantine), err)
	}
	if value.SchemaVersion != SchemaVersion {
		return Preferences{}, fmt.Errorf("unsupported preferences schema %d", value.SchemaVersion)
	}
	if !validTheme(value.Theme) {
		value.Theme = "system"
	}
	if !validDensity(value.Density) {
		value.Density = "default"
	}
	return value, nil
}

func (s *Store) saveLocked(value Preferences) error {
	value.SchemaVersion = SchemaVersion
	if !validTheme(value.Theme) || !validDensity(value.Density) {
		return errors.New("invalid appearance preference")
	}
	if err := os.MkdirAll(filepath.Dir(s.path), 0700); err != nil {
		return fmt.Errorf("create preference directory: %w", err)
	}
	raw, err := json.MarshalIndent(value, "", "  ")
	if err != nil {
		return fmt.Errorf("encode preferences: %w", err)
	}
	if err := fileutil.AtomicWrite(s.path, raw, 0600); err != nil {
		return fmt.Errorf("replace preferences: %w", err)
	}
	return nil
}

func validTheme(value string) bool { return value == "system" || value == "light" || value == "dark" }
func validDensity(value string) bool {
	return value == "compact" || value == "default" || value == "comfortable"
}
