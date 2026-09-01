// Package diagnostics implements bounded, local-only performance recordings.
// It purposely has no network client and never sees document content or IDs.
package diagnostics

import (
	"archive/zip"
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"runtime"
	runtimemetrics "runtime/metrics"
	"runtime/pprof"
	"runtime/trace"
	"sort"
	"strings"
	"sync"
	"time"

	appdiagnostics "quotierlabs/backend/application/diagnostics"
	"quotierlabs/backend/infrastructure/appidentity"
	"quotierlabs/backend/infrastructure/apppaths"
)

const (
	maxSessions    = 5
	maxTotalBytes  = int64(100 << 20)
	maxSessionSize = int64(50 << 20)
	maxDuration    = 30 * time.Minute
)

var (
	ErrUnavailable        = errors.New("diagnostic recording is unavailable in this build")
	ErrNotRecording       = errors.New("no diagnostic recording is active")
	ErrAlreadyRecording   = errors.New("a diagnostic recording is already active")
	ErrProfileUnavailable = errors.New("this diagnostic profile is unavailable in this build")
)

var allowedScenarios = map[string]bool{"manual": true, "canvas-stress": true, "pdf": true, "large-table": true, "memory-check": true}
var allowedOperations = map[string]bool{
	"quotation.load": true, "quotation.save": true, "quotation.autosave": true, "quotation.finalize": true,
	"template.load": true, "template.save": true, "layout.resolve": true, "preview.generate": true,
	"pdf.generate": true, "pdf.export": true, "database.read": true, "database.write": true,
	"image.import": true, "image.decode": true, "image.persist": true, "backup.create": true,
	"backup.restore": true, "canvas.document_load": true, "canvas.undo": true, "canvas.redo": true,
	"canvas.gesture": true,
}
var allowedFrontend = map[string]bool{"canvas.frame_timing": true, "canvas.gesture": true, "preview.render": true}

type collector interface {
	Capabilities() Capabilities
	Collect() (host ProcessStats, tree ProcessStats, err error)
}

type Config struct {
	Interval    time.Duration
	MaxDuration time.Duration
	Collector   collector
	Now         func() time.Time
}

type activeSession struct {
	id, dir                       string
	started                       time.Time
	manifest                      Manifest
	samples, operations, frontend *os.File
	summary                       Summary
	lastAlloc                     uint64
	lastSample                    time.Time
}

// Manager is both an application diagnostics Recorder and the lifecycle owner.
// All mutable state is protected because Wails calls and application services
// may arrive concurrently.
type Manager struct {
	mu                    sync.Mutex
	profileMu             sync.Mutex
	paths                 apppaths.Paths
	build                 appidentity.BuildInfo
	collector             collector
	interval, maxDuration time.Duration
	now                   func() time.Time
	active                *activeSession
	latest                *ResourceSample
	lastOperation         string
	lastSessionID         string
	cancel                context.CancelFunc
	finalizing            bool
}

func NewManager(paths apppaths.Paths, build appidentity.BuildInfo) *Manager {
	return NewManagerWithConfig(paths, build, Config{})
}

func NewManagerWithConfig(paths apppaths.Paths, build appidentity.BuildInfo, cfg Config) *Manager {
	interval := cfg.Interval
	if interval <= 0 {
		if build.Channel == "beta" {
			interval = 2 * time.Second
		} else {
			interval = time.Second
		}
	}
	max := cfg.MaxDuration
	if max <= 0 {
		max = maxDuration
	}
	collect := cfg.Collector
	if collect == nil {
		collect = newProcessCollector()
	}
	now := cfg.Now
	if now == nil {
		now = time.Now
	}
	m := &Manager{paths: paths, build: build, collector: collect, interval: interval, maxDuration: max, now: now}
	if m.available() && paths.DiagnosticsRoot != "" {
		m.recoverInterrupted()
	}
	return m
}

func (m *Manager) available() bool {
	return m.build.Channel == "development" || m.build.Channel == "beta"
}

func (m *Manager) Status() Status {
	m.mu.Lock()
	defer m.mu.Unlock()
	s := Status{Available: m.available(), Channel: m.build.Channel, Finalizing: m.finalizing, LastSessionID: m.lastSessionID}
	if m.available() {
		s.DiagnosticsRoot = m.paths.DiagnosticsRoot
	}
	if m.active != nil {
		s.Recording, s.SessionID = true, m.active.id
		s.ElapsedMS = m.now().Sub(m.active.started).Milliseconds()
	}
	if m.latest != nil {
		copy := *m.latest
		s.Latest = &copy
	}
	s.LastOperation = m.lastOperation
	return s
}

func (m *Manager) Start(scenario string) (Status, error) {
	if !m.available() {
		return Status{}, ErrUnavailable
	}
	if !allowedScenarios[scenario] {
		return Status{}, errors.New("unsupported diagnostic scenario")
	}
	if m.paths.DiagnosticsRoot == "" {
		return Status{}, errors.New("diagnostic storage is not configured")
	}
	m.mu.Lock()
	if m.active != nil {
		m.mu.Unlock()
		return Status{}, ErrAlreadyRecording
	}
	if err := os.MkdirAll(m.paths.DiagnosticsRoot, 0700); err != nil {
		m.mu.Unlock()
		return Status{}, fmt.Errorf("create diagnostics root: %w", err)
	}
	if err := m.pruneLocked(); err != nil {
		m.mu.Unlock()
		return Status{}, err
	}
	id, err := newSessionID(m.now())
	if err != nil {
		m.mu.Unlock()
		return Status{}, err
	}
	dir := filepath.Join(m.paths.DiagnosticsRoot, id)
	if err := os.Mkdir(dir, 0700); err != nil {
		m.mu.Unlock()
		return Status{}, fmt.Errorf("create diagnostic session: %w", err)
	}
	started := m.now().UTC()
	manifest := Manifest{SchemaVersion: schemaVersion, SessionID: id, Scenario: scenario, Channel: m.build.Channel, Version: m.build.Version, OS: m.build.OS, Arch: m.build.Arch, StartedAtUTC: started, IntervalMS: m.interval.Milliseconds(), Capabilities: m.collector.Capabilities()}
	if err := writeJSON(filepath.Join(dir, "manifest.json"), manifest); err != nil {
		_ = os.RemoveAll(dir)
		m.mu.Unlock()
		return Status{}, err
	}
	samples, err := createPrivate(filepath.Join(dir, "samples.jsonl"))
	if err != nil {
		_ = os.RemoveAll(dir)
		m.mu.Unlock()
		return Status{}, err
	}
	operations, err := createPrivate(filepath.Join(dir, "operations.jsonl"))
	if err != nil {
		_ = samples.Close()
		_ = os.RemoveAll(dir)
		m.mu.Unlock()
		return Status{}, err
	}
	frontend, err := createPrivate(filepath.Join(dir, "frontend.jsonl"))
	if err != nil {
		_ = samples.Close()
		_ = operations.Close()
		_ = os.RemoveAll(dir)
		m.mu.Unlock()
		return Status{}, err
	}
	m.active = &activeSession{id: id, dir: dir, started: started, manifest: manifest, samples: samples, operations: operations, frontend: frontend, lastSample: started, summary: Summary{SchemaVersion: schemaVersion, SessionID: id, StartedAtUTC: started}}
	ctx, cancel := context.WithCancel(context.Background())
	m.cancel = cancel
	m.mu.Unlock()
	m.sample()
	go m.run(ctx)
	return m.Status(), nil
}

func (m *Manager) run(ctx context.Context) {
	ticker := time.NewTicker(m.interval)
	defer ticker.Stop()
	deadline := time.NewTimer(m.maxDuration)
	defer deadline.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-deadline.C:
			_, _ = m.Stop()
		case <-ticker.C:
			m.sample()
		}
	}
}

func (m *Manager) Stop() (Status, error) {
	m.mu.Lock()
	if m.active == nil {
		m.mu.Unlock()
		return m.Status(), ErrNotRecording
	}
	m.finalizing = true
	a := m.active
	cancel := m.cancel
	m.active, m.cancel = nil, nil
	m.mu.Unlock()
	if cancel != nil {
		cancel()
	}
	// A last sample makes short, manual recordings useful without extending the session.
	m.finish(a, false)
	m.mu.Lock()
	m.finalizing = false
	m.lastSessionID = a.id
	m.mu.Unlock()
	return m.Status(), nil
}

func (m *Manager) finish(a *activeSession, interrupted bool) {
	ended := m.now().UTC()
	a.manifest.EndedAtUTC, a.manifest.Interrupted = &ended, interrupted
	a.summary.EndedAtUTC = ended
	a.summary.DurationMS = ended.Sub(a.started).Milliseconds()
	_ = a.samples.Close()
	_ = a.operations.Close()
	_ = a.frontend.Close()
	_ = writeJSON(filepath.Join(a.dir, "manifest.json"), a.manifest)
	_ = writeJSON(filepath.Join(a.dir, "summary.json"), a.summary)
}

// Shutdown makes a crash/close session readable rather than deleting evidence.
func (m *Manager) Shutdown() {
	m.mu.Lock()
	if m.active == nil {
		m.mu.Unlock()
		return
	}
	a := m.active
	cancel := m.cancel
	m.active, m.cancel, m.finalizing = nil, nil, true
	m.mu.Unlock()
	if cancel != nil {
		cancel()
	}
	m.finish(a, true)
	m.mu.Lock()
	m.lastSessionID = a.id
	m.finalizing = false
	m.mu.Unlock()
}

func (m *Manager) sample() {
	host, tree, _ := m.collector.Collect()
	var ms runtime.MemStats
	runtime.ReadMemStats(&ms)
	now := m.now().UTC()
	m.mu.Lock()
	defer m.mu.Unlock()
	a := m.active
	if a == nil {
		return
	}
	if directorySize(a.dir) >= maxSessionSize {
		return
	}
	delta := now.Sub(a.lastSample).Seconds()
	rate := 0.0
	if delta > 0 && ms.TotalAlloc >= a.lastAlloc {
		rate = float64(ms.TotalAlloc-a.lastAlloc) / delta
	}
	live, goal := namedHeapMetrics(ms.HeapAlloc, ms.NextGC)
	s := ResourceSample{SchemaVersion: schemaVersion, Type: "resource_sample", ElapsedMS: now.Sub(a.started).Milliseconds(), RecordedAtUTC: now, LogicalCPUs: runtime.NumCPU(), Host: host, Tree: tree, GoLiveHeapBytes: live, GoHeapGoalBytes: goal, GoAllocBytes: ms.TotalAlloc, GoAllocRateBPS: rate, GCCycles: ms.NumGC, GCPauseTotalNS: ms.PauseTotalNs, Goroutines: runtime.NumGoroutine()}
	if err := appendJSONL(a.samples, s); err != nil {
		return
	}
	a.lastAlloc, a.lastSample = ms.TotalAlloc, now
	a.summary.SampleCount++
	if s.GoLiveHeapBytes > a.summary.PeakGoHeapBytes {
		a.summary.PeakGoHeapBytes = s.GoLiveHeapBytes
	}
	if s.Goroutines > a.summary.PeakGoroutines {
		a.summary.PeakGoroutines = s.Goroutines
	}
	if s.Tree.RSSBytes != nil && (a.summary.PeakTreeRSSBytes == nil || *s.Tree.RSSBytes > *a.summary.PeakTreeRSSBytes) {
		v := *s.Tree.RSSBytes
		a.summary.PeakTreeRSSBytes = &v
	}
	if s.Tree.CPUPercent != nil && (a.summary.PeakTreeCPU == nil || *s.Tree.CPUPercent > *a.summary.PeakTreeCPU) {
		v := *s.Tree.CPUPercent
		a.summary.PeakTreeCPU = &v
	}
	m.latest = &s
}

func (m *Manager) RecordOperation(_ context.Context, name string, duration time.Duration, result string, dimensions map[string]int64) {
	if !allowedOperations[name] || !allowedResult(result) || !safeDimensions(dimensions) {
		return
	}
	m.recordOperation(name, duration, result, dimensions)
}
func (m *Manager) recordOperation(name string, duration time.Duration, result string, dimensions map[string]int64) {
	m.mu.Lock()
	defer m.mu.Unlock()
	if m.active == nil {
		return
	}
	if directorySize(m.active.dir) >= maxSessionSize {
		return
	}
	now := m.now().UTC()
	a := m.active
	e := OperationEvent{SchemaVersion: schemaVersion, Type: "operation", ElapsedMS: now.Sub(a.started).Milliseconds(), RecordedAtUTC: now, Name: name, DurationMS: float64(duration) / float64(time.Millisecond), Result: result, Dimensions: cloneDimensions(dimensions)}
	if appendJSONL(a.operations, e) == nil {
		a.summary.OperationCount++
		m.lastOperation = name
	}
}
func (m *Manager) RecordFrontend(_ context.Context, name string, duration time.Duration, dimensions map[string]int64) {
	if !allowedFrontend[name] || !safeDimensions(dimensions) {
		return
	}
	m.mu.Lock()
	defer m.mu.Unlock()
	if m.active == nil {
		return
	}
	if directorySize(m.active.dir) >= maxSessionSize {
		return
	}
	now := m.now().UTC()
	a := m.active
	e := FrontendEvent{SchemaVersion: schemaVersion, Type: "frontend", ElapsedMS: now.Sub(a.started).Milliseconds(), RecordedAtUTC: now, Name: name, DurationMS: float64(duration) / float64(time.Millisecond), Dimensions: cloneDimensions(dimensions)}
	if appendJSONL(a.frontend, e) == nil {
		a.summary.FrontendCount++
	}
}

func (m *Manager) CaptureProfile(kind string) (string, error) {
	if m.build.Channel != "development" && !(m.build.Channel == "beta" && (kind == "heap" || kind == "goroutine")) {
		return "", ErrProfileUnavailable
	}
	if kind != "cpu" && kind != "heap" && kind != "allocs" && kind != "goroutine" && kind != "trace" {
		return "", errors.New("unsupported diagnostic profile")
	}
	m.profileMu.Lock()
	defer m.profileMu.Unlock()
	m.mu.Lock()
	if m.active == nil {
		m.mu.Unlock()
		return "", ErrNotRecording
	}
	dir := filepath.Join(m.active.dir, "profiles")
	m.mu.Unlock()
	if err := os.MkdirAll(dir, 0700); err != nil {
		return "", err
	}
	ext := ".pprof"
	if kind == "trace" {
		ext = ".out"
	}
	target := filepath.Join(dir, kind+ext)
	f, err := createPrivate(target)
	if err != nil {
		return "", err
	}
	defer func() { _ = f.Close() }()
	switch kind {
	case "cpu":
		if err := pprof.StartCPUProfile(f); err != nil {
			return "", err
		}
		time.Sleep(30 * time.Second)
		pprof.StopCPUProfile()
	case "trace":
		if err := trace.Start(f); err != nil {
			return "", err
		}
		time.Sleep(5 * time.Second)
		trace.Stop()
	case "heap", "allocs", "goroutine":
		if err := pprof.Lookup(kind).WriteTo(f, 0); err != nil {
			return "", err
		}
	}
	if err := f.Sync(); err != nil {
		_ = f.Close()
		return "", err
	}
	if err := f.Close(); err != nil {
		return "", err
	}
	if info, err := os.Stat(target); err != nil || info.Size() > 20<<20 || directorySize(dir) > maxSessionSize {
		_ = os.Remove(target)
		return "", errors.New("diagnostic profile exceeds the local recording limit")
	}
	return filepath.Base(target), nil
}

// ArchiveSession only accepts an owned session ID and writes a safe, bounded ZIP.
func (m *Manager) ArchiveSession(id string, out io.Writer) error {
	if !validSessionID(id) {
		return errors.New("invalid diagnostic session")
	}
	dir := filepath.Join(m.paths.DiagnosticsRoot, id)
	if filepath.Dir(dir) != filepath.Clean(m.paths.DiagnosticsRoot) {
		return errors.New("invalid diagnostic session")
	}
	if _, err := os.Stat(filepath.Join(dir, "manifest.json")); err != nil {
		return errors.New("diagnostic session was not found")
	}
	zw := zip.NewWriter(out)
	var total int64
	err := filepath.Walk(dir, func(filename string, info os.FileInfo, walkErr error) error {
		if walkErr != nil {
			return walkErr
		}
		if info.IsDir() {
			return nil
		}
		if info.Size() > maxSessionSize || total+info.Size() > maxSessionSize {
			return errors.New("diagnostic session exceeds export limit")
		}
		rel, err := filepath.Rel(dir, filename)
		if err != nil || strings.HasPrefix(rel, "..") {
			return errors.New("invalid diagnostic file")
		}
		w, err := zw.Create(filepath.ToSlash(filepath.Join("recording", rel)))
		if err != nil {
			return err
		}
		in, err := os.Open(filename)
		if err != nil {
			return err
		}
		defer in.Close()
		_, err = io.Copy(w, io.LimitReader(in, maxSessionSize))
		total += info.Size()
		return err
	})
	if err != nil {
		return err
	}
	return zw.Close()
}

func (m *Manager) pruneLocked() error {
	entries, err := os.ReadDir(m.paths.DiagnosticsRoot)
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return nil
		}
		return err
	}
	type candidate struct {
		path string
		mod  time.Time
		size int64
	}
	var values []candidate
	for _, entry := range entries {
		if !entry.IsDir() || !validSessionID(entry.Name()) {
			continue
		}
		info, err := entry.Info()
		if err != nil {
			continue
		}
		values = append(values, candidate{filepath.Join(m.paths.DiagnosticsRoot, entry.Name()), info.ModTime(), directorySize(filepath.Join(m.paths.DiagnosticsRoot, entry.Name()))})
	}
	sort.Slice(values, func(i, j int) bool { return values[i].mod.Before(values[j].mod) })
	var total int64
	for _, value := range values {
		total += value.size
	}
	for len(values) >= maxSessions || total > maxTotalBytes {
		victim := values[0]
		values = values[1:]
		total -= victim.size
		if err := os.RemoveAll(victim.path); err != nil {
			return fmt.Errorf("prune diagnostics: %w", err)
		}
	}
	return nil
}

// recoverInterrupted leaves a power-loss recording exportable on next launch.
// It only reads owned child directories and does not create a production root.
func (m *Manager) recoverInterrupted() {
	entries, err := os.ReadDir(m.paths.DiagnosticsRoot)
	if err != nil {
		return
	}
	for _, entry := range entries {
		if !entry.IsDir() || !validSessionID(entry.Name()) {
			continue
		}
		dir := filepath.Join(m.paths.DiagnosticsRoot, entry.Name())
		if _, err := os.Stat(filepath.Join(dir, "summary.json")); err == nil {
			continue
		}
		raw, err := os.ReadFile(filepath.Join(dir, "manifest.json"))
		if err != nil {
			continue
		}
		var manifest Manifest
		if json.Unmarshal(raw, &manifest) != nil || manifest.SessionID != entry.Name() {
			continue
		}
		now := m.now().UTC()
		manifest.EndedAtUTC, manifest.Interrupted = &now, true
		_ = writeJSON(filepath.Join(dir, "manifest.json"), manifest)
		_ = writeJSON(filepath.Join(dir, "summary.json"), Summary{SchemaVersion: schemaVersion, SessionID: manifest.SessionID, StartedAtUTC: manifest.StartedAtUTC, EndedAtUTC: now, DurationMS: now.Sub(manifest.StartedAtUTC).Milliseconds()})
	}
}

func createPrivate(path string) (*os.File, error) {
	return os.OpenFile(path, os.O_CREATE|os.O_WRONLY|os.O_TRUNC, 0600)
}
func writeJSON(path string, value any) error {
	raw, err := json.MarshalIndent(value, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(path, raw, 0600)
}
func appendJSONL(file *os.File, value any) error {
	raw, err := json.Marshal(value)
	if err != nil {
		return err
	}
	raw = append(raw, '\n')
	_, err = file.Write(raw)
	return err
}
func newSessionID(now time.Time) (string, error) {
	b := make([]byte, 5)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	return "session-" + now.UTC().Format("20060102T150405Z") + "-" + hex.EncodeToString(b), nil
}
func validSessionID(value string) bool {
	return strings.HasPrefix(value, "session-") && len(value) >= 25 && !strings.ContainsAny(value, `/\\`)
}
func directorySize(root string) int64 {
	var n int64
	_ = filepath.Walk(root, func(_ string, info os.FileInfo, err error) error {
		if err == nil && !info.IsDir() {
			n += info.Size()
		}
		return nil
	})
	return n
}
func allowedResult(value string) bool {
	return value == "success" || value == "error" || value == "cancelled"
}
func safeDimensions(value map[string]int64) bool {
	if len(value) > 12 {
		return false
	}
	for key, v := range value {
		if len(key) == 0 || len(key) > 32 || v < 0 {
			return false
		}
	}
	return true
}
func cloneDimensions(value map[string]int64) map[string]int64 {
	if len(value) == 0 {
		return nil
	}
	copy := make(map[string]int64, len(value))
	for k, v := range value {
		copy[k] = v
	}
	return copy
}

// namedHeapMetrics asks only the stable metrics we need and falls back to
// MemStats if a future Go release omits one. It never serializes the entire
// evolving runtime metric catalogue.
func namedHeapMetrics(fallbackLive, fallbackGoal uint64) (uint64, uint64) {
	samples := []runtimemetrics.Sample{{Name: "/gc/heap/live:bytes"}, {Name: "/gc/heap/goal:bytes"}}
	runtimemetrics.Read(samples)
	live, goal := fallbackLive, fallbackGoal
	if samples[0].Value.Kind() == runtimemetrics.KindUint64 {
		live = samples[0].Value.Uint64()
	}
	if samples[1].Value.Kind() == runtimemetrics.KindUint64 {
		goal = samples[1].Value.Uint64()
	}
	return live, goal
}

var _ appdiagnostics.Recorder = (*Manager)(nil)
