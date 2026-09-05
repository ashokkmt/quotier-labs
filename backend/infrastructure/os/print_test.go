package os

import (
	"strings"
	"testing"
)

func TestDarwinPrintCommandUsesDialogAndPassesPathAsArgument(t *testing.T) {
	path := `/tmp/quote "special".pdf`
	cmd, err := printCommand("darwin", path)
	if err != nil {
		t.Fatal(err)
	}
	if cmd.Path == "" || len(cmd.Args) != 4 || cmd.Args[3] != path {
		t.Fatalf("path was not passed as an isolated argument: %#v", cmd.Args)
	}
	if !strings.Contains(cmd.Args[2], "with print dialog") || strings.Contains(cmd.Args[2], path) {
		t.Fatalf("unsafe or non-dialog AppleScript: %q", cmd.Args[2])
	}
}
