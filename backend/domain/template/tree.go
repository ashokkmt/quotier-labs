package template

import (
	"errors"
	"fmt"
	"quotierlabs/backend/domain"
)

// MoveBlock detaches a complete subtree and inserts it into destination. An
// empty destinationID means the document root. The input is not mutated.
func MoveBlock(root []Block, blockID, destinationID string, index int) ([]Block, error) {
	if blockID == "" {
		return nil, errors.New("block id is required")
	}
	if blockID == destinationID {
		return nil, errors.Join(domain.ErrInvalidParent, domain.ErrCycle)
	}
	if containsDescendant(root, blockID, destinationID) {
		return nil, domain.ErrCycle
	}
	next := cloneBlocks(root)
	moved, remaining, ok := detach(next, blockID)
	if !ok {
		return nil, fmt.Errorf("block %q not found", blockID)
	}
	if destinationID == "" {
		if !CanContain("root", moved.Kind) {
			return nil, domain.ErrInvalidParent
		}
		remaining = insert(remaining, moved, index)
	} else if !insertInto(remaining, destinationID, moved, index) {
		return nil, fmt.Errorf("destination %q not found", destinationID)
	}
	if err := ValidateRoot(remaining); err != nil {
		return nil, err
	}
	return remaining, nil
}

func DuplicateBlock(root []Block, blockID string, id func() string) ([]Block, error) {
	next := cloneBlocks(root)
	var source *Block
	visit(next, blockID, func(b *Block) { source = b })
	if source == nil {
		return nil, errors.New("block not found")
	}
	copy := cloneBlock(*source)
	refreshIDs(&copy, id)
	for i := range next {
		if next[i].ID == blockID {
			next = insert(next, copy, i+1)
			return next, nil
		}
	}
	if !appendDuplicate(next, blockID, copy) {
		return nil, errors.New("block not found")
	}
	return next, nil
}

// CloneWithFreshIDs deep-copies a complete tree, including fields and tables.
func CloneWithFreshIDs(root []Block, id func() string) []Block {
	cloned := cloneBlocks(root)
	for i := range cloned {
		refreshIDs(&cloned[i], id)
	}
	return cloned
}

func cloneBlocks(in []Block) []Block {
	out := make([]Block, len(in))
	for i := range in {
		out[i] = cloneBlock(in[i])
	}
	return out
}
func cloneBlock(in Block) Block {
	out := in
	out.Children = cloneBlocks(in.Children)
	if in.Overrides != nil {
		out.Overrides = map[string]interface{}{}
		for k, v := range in.Overrides {
			out.Overrides[k] = v
		}
	}
	return out
}
func refreshIDs(b *Block, id func() string) {
	b.ID = id()
	for i := range b.Children {
		refreshIDs(&b.Children[i], id)
	}
	for i := range b.Fields {
		b.Fields[i].ID = id()
	}
	for i := range b.Tables {
		b.Tables[i].ID = id()
	}
}
func visit(bs []Block, id string, fn func(*Block)) {
	for i := range bs {
		if bs[i].ID == id {
			fn(&bs[i])
			return
		}
		visit(bs[i].Children, id, fn)
	}
}
func detach(bs []Block, id string) (Block, []Block, bool) {
	for i := range bs {
		if bs[i].ID == id {
			m := bs[i]
			return m, append(bs[:i:i], bs[i+1:]...), true
		}
		m, rest, ok := detach(bs[i].Children, id)
		if ok {
			bs[i].Children = rest
			return m, bs, true
		}
	}
	return Block{}, bs, false
}
func insert(bs []Block, b Block, index int) []Block {
	if index < 0 || index > len(bs) {
		index = len(bs)
	}
	bs = append(bs, Block{})
	copy(bs[index+1:], bs[index:])
	bs[index] = b
	return bs
}
func insertInto(bs []Block, id string, b Block, index int) bool {
	for i := range bs {
		if bs[i].ID == id {
			if !CanContain(bs[i].Kind, b.Kind) {
				return false
			}
			bs[i].Children = insert(bs[i].Children, b, index)
			return true
		}
		if insertInto(bs[i].Children, id, b, index) {
			return true
		}
	}
	return false
}
func appendDuplicate(bs []Block, id string, b Block) bool {
	for i := range bs {
		if appendDuplicate(bs[i].Children, id, b) {
			return true
		}
		if bs[i].ID == id {
			bs[i].Children = insert(bs[i].Children, b, len(bs[i].Children))
			return true
		}
	}
	return false
}

func containsDescendant(bs []Block, source, target string) bool {
	for _, b := range bs {
		if b.ID == source {
			return containsID(b.Children, target)
		}
		if containsDescendant(b.Children, source, target) {
			return true
		}
	}
	return false
}
func containsID(bs []Block, target string) bool {
	for _, b := range bs {
		if b.ID == target || containsID(b.Children, target) {
			return true
		}
	}
	return false
}
