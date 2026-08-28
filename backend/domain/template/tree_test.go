package template

import (
	"errors"
	domain "quotierlabs/backend/domain"
	"testing"
)

func TestCanContain(t *testing.T) {
	tests := []struct {
		parent, child BlockKind
		want          bool
	}{
		{"root", BlockSection, true}, {"root", BlockRow, true}, {"root", BlockColumn, false},
		{BlockSection, BlockRow, true}, {BlockSection, BlockColumn, false}, {BlockRow, BlockColumn, true}, {BlockColumn, BlockSection, true}, {BlockColumn, BlockRow, true},
	}
	for _, tt := range tests {
		if got := CanContain(tt.parent, tt.child); got != tt.want {
			t.Errorf("CanContain(%q,%q)=%v", tt.parent, tt.child, got)
		}
	}
}

func TestValidateRootAndMovePreserveSubtree(t *testing.T) {
	section := Block{ID: "s", Kind: BlockSection, Visible: true, Children: []Block{{ID: "r", Kind: BlockRow, Visible: true, Children: []Block{{ID: "c", Kind: BlockColumn, Visible: true, Children: []Block{{ID: "nested", Kind: BlockSection, Visible: true}}}}}}}
	if err := ValidateRoot([]Block{section}); err != nil {
		t.Fatal(err)
	}
	moved, err := MoveBlock([]Block{section}, "nested", "s", 0)
	if err != nil {
		t.Fatal(err)
	}
	if len(moved[0].Children) != 2 || moved[0].Children[0].ID != "nested" {
		t.Fatalf("subtree was not reparented: %#v", moved)
	}
	if _, err := MoveBlock(moved, "s", "nested", 0); !errors.Is(err, domain.ErrCycle) {
		t.Fatalf("expected cycle error, got %v", err)
	}
}

func TestValidateRootRejectsInvalidParentAndDepth(t *testing.T) {
	if err := ValidateRoot([]Block{{ID: "column", Kind: BlockColumn}}); !errors.Is(err, domain.ErrInvalidParent) {
		t.Fatal(err)
	}
	b := Block{ID: "0", Kind: BlockSection, Visible: true}
	current := &b
	for i := 1; i < MaxDepth+1; i++ {
		current.Children = []Block{{ID: string(rune('a' + i)), Kind: BlockSection, Visible: true}}
		current = &current.Children[0]
	}
	if err := ValidateTree(b); !errors.Is(err, domain.ErrMaxDepthExceeded) {
		t.Fatalf("expected depth error, got %v", err)
	}
}
