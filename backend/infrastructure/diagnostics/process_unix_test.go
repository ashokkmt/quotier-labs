//go:build linux

package diagnostics

import "testing"

func TestParsePSAndDescendants(t *testing.T) {
	values, err := parsePS("  10  1  1.5  100  3\n  11  10  2.5  200  4\n  12  11  0.5  300  5\n")
	if err != nil {
		t.Fatal(err)
	}
	if values[11].rss != 200*1024 || values[12].threads != 5 {
		t.Fatalf("parse = %#v", values)
	}
	descendants := descendantsOf(values, 10)
	if !descendants[11] || !descendants[12] || len(descendants) != 2 {
		t.Fatalf("descendants = %#v", descendants)
	}
}
