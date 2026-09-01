package diagnostics

import (
	"archive/zip"
	"bytes"
	"context"
	"errors"
	"os"
	"path/filepath"
	"testing"
	"time"

	"quotierlabs/backend/infrastructure/appidentity"
	"quotierlabs/backend/infrastructure/apppaths"
)

type fakeCollector struct{}

func (fakeCollector) Capabilities() Capabilities {
	return Capabilities{ProcessTree: true, CPU: true, RSS: true}
}
func (fakeCollector) Collect() (ProcessStats, ProcessStats, error) {
	cpu := 12.5
	rss := int64(1024)
	s := ProcessStats{CPUPercent: &cpu, RSSBytes: &rss}
	return s, s, nil
}

func testManager(t *testing.T, channel string) (*Manager, string) {
	t.Helper()
	root := t.TempDir()
	path := filepath.Join(root, "diagnostics")
	if err := os.Mkdir(path, 0700); err != nil {
		t.Fatal(err)
	}
	build := appidentity.BuildInfo{Channel: channel, Version: "test", OS: "linux", Arch: "amd64"}
	return NewManagerWithConfig(apppaths.Paths{DiagnosticsRoot: path}, build, Config{Interval: time.Hour, Collector: fakeCollector{}}), path
}
func TestRecordingWritesBoundedSafeEvidence(t *testing.T) {
	m, root := testManager(t, "development")
	status, err := m.Start("manual")
	if err != nil {
		t.Fatal(err)
	}
	if !status.Recording {
		t.Fatal("expected recording")
	}
	m.RecordOperation(context.Background(), "quotation.save", 4*time.Millisecond, "success", map[string]int64{"node_count": 3})
	m.RecordOperation(context.Background(), "not.allowed", 4*time.Millisecond, "success", nil)
	m.RecordFrontend(context.Background(), "canvas.frame_timing", time.Millisecond, map[string]int64{"frame_count": 2})
	status, err = m.Stop()
	if err != nil {
		t.Fatal(err)
	}
	if status.Recording {
		t.Fatal("recording should stop")
	}
	dir := filepath.Join(root, status.LastSessionID)
	for _, name := range []string{"manifest.json", "samples.jsonl", "operations.jsonl", "frontend.jsonl", "summary.json"} {
		if _, err := os.Stat(filepath.Join(dir, name)); err != nil {
			t.Fatalf("%s: %v", name, err)
		}
	}
	raw, err := os.ReadFile(filepath.Join(dir, "operations.jsonl"))
	if err != nil {
		t.Fatal(err)
	}
	if bytes.Contains(raw, []byte("not.allowed")) || !bytes.Contains(raw, []byte("quotation.save")) {
		t.Fatalf("unexpected operation output %s", raw)
	}
	var out bytes.Buffer
	if err := m.ArchiveSession(status.LastSessionID, &out); err != nil {
		t.Fatal(err)
	}
	zr, err := zip.NewReader(bytes.NewReader(out.Bytes()), int64(out.Len()))
	if err != nil {
		t.Fatal(err)
	}
	if len(zr.File) == 0 {
		t.Fatal("empty archive")
	}
}
func TestRecordingIsUnavailableInProduction(t *testing.T) {
	m, _ := testManager(t, "production")
	_, err := m.Start("manual")
	if !errors.Is(err, ErrUnavailable) {
		t.Fatalf("err=%v", err)
	}
}
func TestRejectsUnsafeInput(t *testing.T) {
	m, _ := testManager(t, "development")
	if _, err := m.Start("../../../secret"); err == nil {
		t.Fatal("expected scenario rejection")
	}
	if err := m.ArchiveSession("../../x", &bytes.Buffer{}); err == nil {
		t.Fatal("expected path rejection")
	}
}
