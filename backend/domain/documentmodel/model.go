// Package documentmodel contains the versioned, renderer-independent document contract.
// It deliberately has no persistence, UI, or PDF dependencies.
package documentmodel

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
)

const (
	SchemaVersion = 5
	DUPerPoint    = 100
	A4WidthDU     = 59528
	A4HeightDU    = 84189
	MaxNodes      = 2000
	MaxDepth      = 8
)

type Document struct {
	SchemaVersion int      `json:"schema_version"`
	Root          Root     `json:"root"`
	Stories       []Story  `json:"stories,omitempty"`
	Settings      Settings `json:"settings"`
}

type Root struct {
	Pages   []Page   `json:"pages"`
	Masters []Master `json:"masters,omitempty"`
}

type Page struct {
	ID       string   `json:"id"`
	Width    int64    `json:"width"`
	Height   int64    `json:"height"`
	Margin   Insets   `json:"margin"`
	ChildIDs []string `json:"child_ids"`
	Children []Node   `json:"children"`
	MasterID string   `json:"master_id,omitempty"`
}

type Master struct {
	ID       string   `json:"id"`
	ChildIDs []string `json:"child_ids"`
	Children []Node   `json:"children"`
}

type Node struct {
	ID           string          `json:"id"`
	Kind         string          `json:"kind"`
	Role         string          `json:"role"`
	Name         string          `json:"name,omitempty"`
	Geometry     Geometry        `json:"geometry"`
	LayoutMode   string          `json:"layout_mode"`
	BindingKind  string          `json:"binding_kind,omitempty"`
	Locked       bool            `json:"locked"`
	Visibility   string          `json:"visibility"`
	Optional     bool            `json:"optional"`
	ChildIDs     []string        `json:"child_ids,omitempty"`
	Children     []Node          `json:"children,omitempty"`
	StoryID      string          `json:"story_id,omitempty"`
	NextFrameID  string          `json:"next_frame_id,omitempty"`
	Continuation string          `json:"continuation,omitempty"`
	Props        json.RawMessage `json:"props,omitempty"`
}

type Geometry struct {
	X, Y, Width, Height int64
	Rotation            int32
}

func (g *Geometry) UnmarshalJSON(b []byte) error {
	var v struct {
		X        int64 `json:"x"`
		Y        int64 `json:"y"`
		Width    int64 `json:"width"`
		Height   int64 `json:"height"`
		Rotation int32 `json:"rotation"`
	}
	if err := json.Unmarshal(b, &v); err != nil {
		return err
	}
	g.X, g.Y, g.Width, g.Height, g.Rotation = v.X, v.Y, v.Width, v.Height, v.Rotation
	return nil
}
func (g Geometry) MarshalJSON() ([]byte, error) {
	return json.Marshal(struct {
		X        int64 `json:"x"`
		Y        int64 `json:"y"`
		Width    int64 `json:"width"`
		Height   int64 `json:"height"`
		Rotation int32 `json:"rotation"`
	}{g.X, g.Y, g.Width, g.Height, g.Rotation})
}

type Insets struct {
	Top    int64 `json:"top"`
	Right  int64 `json:"right"`
	Bottom int64 `json:"bottom"`
	Left   int64 `json:"left"`
}
type Settings struct {
	PageSize        string `json:"page_size"`
	Orientation     string `json:"orientation"`
	DefaultMasterID string `json:"default_master_id,omitempty"`
}
type Story struct {
	ID      string          `json:"id"`
	Kind    string          `json:"kind"`
	Content json.RawMessage `json:"content"`
}

var (
	ErrSchemaVersion = errors.New("unsupported document schema version")
	ErrInvalid       = errors.New("invalid V5 document")
)

func Parse(data []byte) (*Document, error) {
	dec := json.NewDecoder(bytes.NewReader(data))
	dec.DisallowUnknownFields()
	var d Document
	if err := dec.Decode(&d); err != nil {
		return nil, err
	}
	if d.SchemaVersion != SchemaVersion {
		return nil, fmt.Errorf("%w: %d", ErrSchemaVersion, d.SchemaVersion)
	}
	if err := Validate(&d); err != nil {
		return nil, err
	}
	return &d, nil
}

func Validate(d *Document) error {
	if d == nil || d.SchemaVersion != SchemaVersion {
		return ErrSchemaVersion
	}
	if d.Settings.PageSize != "A4" || (d.Settings.Orientation != "portrait" && d.Settings.Orientation != "landscape") {
		return fmt.Errorf("%w: settings must be A4 portrait or landscape", ErrInvalid)
	}
	if len(d.Root.Pages) == 0 {
		return fmt.Errorf("%w: at least one page is required", ErrInvalid)
	}
	seen := map[string]string{}
	stories := map[string]bool{}
	for _, s := range d.Stories {
		if s.ID == "" || stories[s.ID] {
			return fmt.Errorf("%w: duplicate or empty story id", ErrInvalid)
		}
		stories[s.ID] = true
	}
	count := 0
	for _, p := range d.Root.Pages {
		if p.ID == "" {
			return fmt.Errorf("%w: page id is required", ErrInvalid)
		}
		if err := validatePageSize(p.Width, p.Height, d.Settings.Orientation); err != nil {
			return err
		}
		if _, ok := seen[p.ID]; ok {
			return fmt.Errorf("%w: duplicate id %q", ErrInvalid, p.ID)
		}
		seen[p.ID] = "page"
		if err := validateChildren(p.Children, p.ChildIDs, "page", 0, seen, stories, &count); err != nil {
			return err
		}
	}
	for _, m := range d.Root.Masters {
		if m.ID == "" {
			return fmt.Errorf("%w: master id is required", ErrInvalid)
		}
		if _, ok := seen[m.ID]; ok {
			return fmt.Errorf("%w: duplicate id %q", ErrInvalid, m.ID)
		}
		seen[m.ID] = "master"
		if err := validateChildren(m.Children, m.ChildIDs, "master", 0, seen, stories, &count); err != nil {
			return err
		}
	}
	if count > MaxNodes {
		return fmt.Errorf("%w: node limit exceeded", ErrInvalid)
	}
	return nil
}

func validatePageSize(w, h int64, orientation string) error {
	if orientation == "portrait" && (w != A4WidthDU || h != A4HeightDU) {
		return fmt.Errorf("%w: invalid portrait A4 dimensions", ErrInvalid)
	}
	if orientation == "landscape" && (w != A4HeightDU || h != A4WidthDU) {
		return fmt.Errorf("%w: invalid landscape A4 dimensions", ErrInvalid)
	}
	return nil
}
func validateChildren(children []Node, ids []string, parent string, depth int, seen map[string]string, stories map[string]bool, count *int) error {
	if len(ids) > 0 {
		if len(ids) != len(children) {
			return fmt.Errorf("%w: child_ids length mismatch", ErrInvalid)
		}
		for i, id := range ids {
			if id != children[i].ID {
				return fmt.Errorf("%w: child order mismatch at %s[%d]", ErrInvalid, parent, i)
			}
		}
	}
	for _, n := range children {
		(*count)++
		if n.ID == "" || n.Role == "" || n.Kind == "" {
			return fmt.Errorf("%w: node id, kind, and role are required", ErrInvalid)
		}
		if _, ok := seen[n.ID]; ok {
			return fmt.Errorf("%w: duplicate id %q", ErrInvalid, n.ID)
		}
		seen[n.ID] = n.Role
		if n.Geometry.Width <= 0 || n.Geometry.Height <= 0 || n.Geometry.X < 0 || n.Geometry.Y < 0 {
			return fmt.Errorf("%w: invalid geometry for %q", ErrInvalid, n.ID)
		}
		if n.Visibility != "shown" && n.Visibility != "hidden" {
			return fmt.Errorf("%w: invalid visibility for %q", ErrInvalid, n.ID)
		}
		if n.LayoutMode != "fixed" && n.LayoutMode != "intrinsic" && n.LayoutMode != "flow-frame" {
			return fmt.Errorf("%w: invalid layout mode for %q", ErrInvalid, n.ID)
		}
		if depth >= MaxDepth {
			return fmt.Errorf("%w: maximum group depth exceeded", ErrInvalid)
		}
		if n.Role == "flow-frame" {
			if n.StoryID == "" || !stories[n.StoryID] {
				return fmt.Errorf("%w: flow frame %q references missing story", ErrInvalid, n.ID)
			}
			if n.LayoutMode != "flow-frame" {
				return fmt.Errorf("%w: flow frame %q must use flow-frame layout", ErrInvalid, n.ID)
			}
		}
		if n.Role != "group" && len(n.Children) > 0 {
			return fmt.Errorf("%w: only groups may contain children", ErrInvalid)
		}
		if err := validateChildren(n.Children, n.ChildIDs, n.ID, depth+1, seen, stories, count); err != nil {
			return err
		}
	}
	return nil
}
