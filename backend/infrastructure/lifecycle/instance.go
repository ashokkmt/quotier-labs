package lifecycle

import (
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"runtime"
	"runtime/debug"
	"strings"
	"time"

	"quotierlabs/backend/domain/documentformat"
	"quotierlabs/backend/infrastructure/appidentity"
	"quotierlabs/backend/infrastructure/apppaths"
	"quotierlabs/backend/infrastructure/fileutil"
	"quotierlabs/backend/infrastructure/sqlite"
)

type InstanceLock struct {
	file *os.File
}

func AcquireInstanceLock(paths apppaths.Paths) (*InstanceLock, error) {
	path := filepath.Join(paths.RuntimeRoot, "instance.lock")
	f, err := os.OpenFile(path, os.O_CREATE|os.O_RDWR, 0600)
	if err != nil {
		return nil, fmt.Errorf("open instance lock: %w", err)
	}
	if err := lockFile(f); err != nil {
		_ = f.Close()
		return nil, fmt.Errorf("Quotier Labs is already running")
	}
	_ = f.Truncate(0)
	_, _ = fmt.Fprintf(f, "%d\n", os.Getpid())
	_ = f.Sync()
	return &InstanceLock{file: f}, nil
}

func (l *InstanceLock) Close() error {
	if l == nil || l.file == nil {
		return nil
	}
	_ = unlockFile(l.file)
	name := l.file.Name()
	err := l.file.Close()
	_ = os.Remove(name)
	return err
}

type crashRecord struct {
	Timestamp string `json:"timestamp"`
	Version   string `json:"version"`
	Channel   string `json:"channel"`
	OS        string `json:"os"`
	Arch      string `json:"arch"`
	Stage     string `json:"stage"`
	Panic     string `json:"panic"`
	Stack     string `json:"stack"`
}

// RecordPanic creates a bounded local diagnostic. It never sends data.
func RecordPanic(paths apppaths.Paths, build appidentity.BuildInfo, stage string, recovered any) {
	message := redactLocalPaths(fmt.Sprint(recovered), paths)
	stack := redactLocalPaths(string(debug.Stack()), paths)
	message = bounded(message, 8<<10)
	stack = bounded(stack, 220<<10)
	record := crashRecord{
		Timestamp: time.Now().UTC().Format(time.RFC3339Nano), Version: build.Version,
		Channel: build.Channel, OS: runtime.GOOS, Arch: runtime.GOARCH,
		Stage: stage, Panic: message, Stack: stack,
	}
	data, err := json.MarshalIndent(record, "", "  ")
	if err != nil {
		return
	}
	name := fmt.Sprintf("%s-%d.json", time.Now().UTC().Format("20060102T150405.000000000Z"), os.Getpid())
	_ = fileutil.AtomicWrite(filepath.Join(paths.CrashRoot, name), data, 0600)
}

func bounded(value string, limit int) string {
	if len(value) <= limit {
		return value
	}
	return value[:limit] + "…"
}

func redactLocalPaths(value string, paths apppaths.Paths) string {
	for _, root := range []string{paths.DataRoot, paths.ConfigRoot, paths.StateRoot, paths.LogRoot, paths.CrashRoot, paths.CacheRoot, paths.InstallRoot} {
		if root != "" {
			value = strings.ReplaceAll(value, root, "<app-path>")
		}
	}
	if home, err := os.UserHomeDir(); err == nil && home != "" {
		value = strings.ReplaceAll(value, home, "~")
	}
	return value
}

// CleanupTemp removes only marker-owned stale development/session directories.
func CleanupTemp(paths apppaths.Paths) {
	base := filepath.Dir(paths.TempRoot)
	entries, err := os.ReadDir(base)
	if err != nil {
		return
	}
	cutoff := time.Now().Add(-48 * time.Hour)
	for _, entry := range entries {
		if !entry.IsDir() || len(entry.Name()) < 8 || entry.Name()[:8] != "session-" {
			continue
		}
		info, err := entry.Info()
		if err == nil && info.ModTime().Before(cutoff) {
			_ = os.RemoveAll(filepath.Join(base, entry.Name()))
		}
	}
}

// MarkHealthy completes a pending update transaction only after dependencies,
// repositories, and the UI runtime have started successfully.
func MarkHealthy(paths apppaths.Paths, build appidentity.BuildInfo) {
	pending := filepath.Join(paths.StateRoot, "update-pending.json")
	rawPending, err := os.ReadFile(pending)
	if err != nil {
		return
	}
	var transaction struct {
		To string `json:"to"`
	}
	if json.Unmarshal(rawPending, &transaction) != nil || transaction.To != build.Version {
		return
	}
	record := map[string]any{"schema_version": 1, "version": build.Version, "healthy_at": time.Now().UTC()}
	raw, err := json.MarshalIndent(record, "", "  ")
	if err == nil {
		_ = fileutil.AtomicWrite(filepath.Join(paths.StateRoot, "last-update-healthy.json"), raw, 0600)
		_ = os.Remove(pending)
	}
}

func ValidatePendingUpdate(paths apppaths.Paths, build appidentity.BuildInfo) error {
	raw, err := os.ReadFile(filepath.Join(paths.StateRoot, "update-pending.json"))
	if errors.Is(err, os.ErrNotExist) {
		return nil
	}
	if err != nil {
		return err
	}
	var transaction struct {
		SchemaVersion       int    `json:"schema_version"`
		From                string `json:"from"`
		To                  string `json:"to"`
		DBSchemaAfter       int    `json:"db_schema_after"`
		DocumentSchemaAfter int    `json:"document_schema_after"`
	}
	if json.Unmarshal(raw, &transaction) != nil || transaction.SchemaVersion != 1 || transaction.From == "" || transaction.To == "" {
		return errors.New("pending update transaction is invalid")
	}
	// Cancellation may reopen the old binary. It keeps the transaction for the
	// native installer/new binary rather than treating cancellation as migration.
	if build.Version != transaction.To {
		return nil
	}
	target, err := sqlite.TargetSchemaVersion()
	if err != nil {
		return err
	}
	if int64(transaction.DBSchemaAfter) != target || transaction.DocumentSchemaAfter != documentformat.CurrentVersion {
		return errors.New("installed update schemas do not match its signed transaction")
	}
	return nil
}

func CleanupDiagnostics(paths apppaths.Paths) {
	cutoff := time.Now().Add(-14 * 24 * time.Hour)
	for _, root := range []string{paths.LogRoot, paths.CrashRoot} {
		entries, _ := os.ReadDir(root)
		for _, entry := range entries {
			info, err := entry.Info()
			if err == nil && !entry.IsDir() && info.ModTime().Before(cutoff) {
				_ = os.Remove(filepath.Join(root, entry.Name()))
			}
		}
	}
}
