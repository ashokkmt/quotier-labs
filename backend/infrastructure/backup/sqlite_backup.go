package backup

import (
	"archive/zip"
	"context"
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"
	"time"

	_ "github.com/mattn/go-sqlite3"
	"gorm.io/gorm"
	backupdomain "quotierlabs/backend/domain/backup"
	"quotierlabs/backend/domain/documentformat"
	"quotierlabs/backend/infrastructure/apppaths"
	"quotierlabs/backend/infrastructure/fileutil"
)

const (
	maxBackupMembers = 4096
	maxBackupBytes   = int64(2 << 30)
)

type archiveManifest struct {
	FormatVersion int               `json:"format_version"`
	Files         map[string]string `json:"files"`
}

type SQLiteBackupService struct {
	db       *gorm.DB
	tempRoot string
}

func NewSQLiteBackupService(db *gorm.DB, paths apppaths.Paths) *SQLiteBackupService {
	return &SQLiteBackupService{db: db, tempRoot: paths.TempRoot}
}

func (s *SQLiteBackupService) CreateBackup(ctx context.Context, destPath string, metadata backupdomain.BackupMetadata, assetsRoot string) (*backupdomain.BackupInfo, error) {
	work, err := os.MkdirTemp(s.tempRoot, "backup-work-*")
	if err != nil {
		return nil, fmt.Errorf("create backup workspace: %w", err)
	}
	defer os.RemoveAll(work)
	dbSnapshot := filepath.Join(work, "quotierlabs.sqlite3")
	escaped := strings.ReplaceAll(dbSnapshot, "'", "''")
	if err := s.db.WithContext(ctx).Exec("VACUUM INTO '" + escaped + "'").Error; err != nil {
		return nil, fmt.Errorf("snapshot database: %w", err)
	}
	metaRaw, err := json.MarshalIndent(metadata, "", "  ")
	if err != nil {
		return nil, err
	}
	entries := map[string]string{"database/quotierlabs.sqlite3": dbSnapshot}
	if info, err := os.Stat(assetsRoot); err == nil && info.IsDir() {
		err = filepath.WalkDir(assetsRoot, func(path string, entry os.DirEntry, walkErr error) error {
			if walkErr != nil {
				return walkErr
			}
			if entry.IsDir() {
				return nil
			}
			rel, err := filepath.Rel(assetsRoot, path)
			if err != nil || strings.HasPrefix(rel, "..") {
				return errors.New("asset escaped managed root")
			}
			entries[filepath.ToSlash(filepath.Join("assets", rel))] = path
			if len(entries) > maxBackupMembers {
				return errors.New("too many managed assets")
			}
			return nil
		})
		if err != nil {
			return nil, fmt.Errorf("enumerate assets: %w", err)
		}
	}
	hashes := make(map[string]string, len(entries)+1)
	for name, path := range entries {
		digest, err := fileHash(path)
		if err != nil {
			return nil, err
		}
		hashes[name] = digest
	}
	hashes["metadata.json"] = hashBytes(metaRaw)
	manifestRaw, _ := json.MarshalIndent(archiveManifest{FormatVersion: 1, Files: hashes}, "", "  ")
	if err := os.MkdirAll(filepath.Dir(destPath), 0700); err != nil {
		return nil, err
	}
	partial, err := os.CreateTemp(filepath.Dir(destPath), ".quotier-backup-*.partial")
	if err != nil {
		return nil, fmt.Errorf("create partial backup: %w", err)
	}
	partialPath := partial.Name()
	defer os.Remove(partialPath)
	_ = partial.Chmod(0600)
	zw := zip.NewWriter(partial)
	if err := addBytes(zw, "metadata.json", metaRaw); err != nil {
		partial.Close()
		return nil, err
	}
	if err := addBytes(zw, "manifest.json", manifestRaw); err != nil {
		partial.Close()
		return nil, err
	}
	for name, path := range entries {
		if err := addFile(zw, name, path); err != nil {
			partial.Close()
			return nil, err
		}
	}
	if err := zw.Close(); err != nil {
		partial.Close()
		return nil, fmt.Errorf("finalize backup archive: %w", err)
	}
	if err := partial.Sync(); err != nil {
		partial.Close()
		return nil, err
	}
	if err := partial.Close(); err != nil {
		return nil, err
	}
	validation, err := validateArchive(partialPath)
	if err != nil || !validation.IsValid {
		if err == nil {
			err = errors.New(validation.Error)
		}
		return nil, fmt.Errorf("verify created backup: %w", err)
	}
	if err := fileutil.Replace(partialPath, destPath); err != nil {
		return nil, fmt.Errorf("publish backup: %w", err)
	}
	info, err := os.Stat(destPath)
	if err != nil {
		return nil, err
	}
	return &backupdomain.BackupInfo{Path: destPath, Size: info.Size(), Metadata: metadata}, nil
}

func (s *SQLiteBackupService) ValidateBackup(_ context.Context, path string) (*backupdomain.ValidationResult, error) {
	return validateArchive(path)
}

func validateArchive(path string) (*backupdomain.ValidationResult, error) {
	reader, err := zip.OpenReader(path)
	if err != nil {
		return &backupdomain.ValidationResult{IsValid: false, Error: "invalid backup archive"}, nil
	}
	defer reader.Close()
	if len(reader.File) < 3 || len(reader.File) > maxBackupMembers {
		return &backupdomain.ValidationResult{IsValid: false, Error: "backup member count is invalid"}, nil
	}
	files := map[string]*zip.File{}
	var total int64
	for _, f := range reader.File {
		if !safeMember(f.Name) || f.FileInfo().Mode()&os.ModeSymlink != 0 {
			return &backupdomain.ValidationResult{IsValid: false, Error: "backup contains an unsafe path"}, nil
		}
		if _, exists := files[f.Name]; exists {
			return &backupdomain.ValidationResult{IsValid: false, Error: "backup contains duplicate files"}, nil
		}
		if f.UncompressedSize64 > uint64(maxBackupBytes) || total > maxBackupBytes-int64(f.UncompressedSize64) {
			return &backupdomain.ValidationResult{IsValid: false, Error: "backup is too large"}, nil
		}
		total += int64(f.UncompressedSize64)
		files[f.Name] = f
	}
	metaFile, metaOK := files["metadata.json"]
	manifestFile, manifestOK := files["manifest.json"]
	dbFile, dbOK := files["database/quotierlabs.sqlite3"]
	if !metaOK || !manifestOK || !dbOK {
		return &backupdomain.ValidationResult{IsValid: false, Error: "backup is missing required files"}, nil
	}
	metaRaw, err := readZip(metaFile, 2<<20)
	if err != nil {
		return &backupdomain.ValidationResult{IsValid: false, Error: "cannot read backup metadata"}, nil
	}
	var metadata backupdomain.BackupMetadata
	if json.Unmarshal(metaRaw, &metadata) != nil || metadata.FormatVersion != 1 {
		return &backupdomain.ValidationResult{IsValid: false, Error: "backup metadata is incompatible"}, nil
	}
	manifestRaw, err := readZip(manifestFile, 4<<20)
	if err != nil {
		return &backupdomain.ValidationResult{IsValid: false, Error: "cannot read backup manifest"}, nil
	}
	var manifest archiveManifest
	if json.Unmarshal(manifestRaw, &manifest) != nil || manifest.FormatVersion != 1 {
		return &backupdomain.ValidationResult{IsValid: false, Error: "backup manifest is incompatible"}, nil
	}
	for name := range files {
		if name != "manifest.json" {
			if _, ok := manifest.Files[name]; !ok {
				return &backupdomain.ValidationResult{IsValid: false, Error: "backup contains an unverified file"}, nil
			}
		}
	}
	for name, want := range manifest.Files {
		file := files[name]
		if file == nil {
			return &backupdomain.ValidationResult{IsValid: false, Error: "backup manifest references a missing file"}, nil
		}
		raw, err := readZip(file, maxBackupBytes)
		if err != nil || hashBytes(raw) != want {
			return &backupdomain.ValidationResult{IsValid: false, Error: "backup integrity check failed"}, nil
		}
	}
	if err := validateArchivedDocuments(dbFile); err != nil {
		return &backupdomain.ValidationResult{IsValid: false, Error: "backup contains unsupported document data"}, nil
	}
	return &backupdomain.ValidationResult{IsValid: true, Info: &backupdomain.BackupInfo{Path: path, Size: int64(dbFile.UncompressedSize64), Metadata: metadata}}, nil
}

func validateArchivedDocuments(file *zip.File) error {
	tmp, err := os.CreateTemp("", "quotier-backup-validate-*.sqlite3")
	if err != nil {
		return err
	}
	path := tmp.Name()
	defer os.Remove(path)
	reader, err := file.Open()
	if err != nil {
		tmp.Close()
		return err
	}
	_, copyErr := io.Copy(tmp, io.LimitReader(reader, maxBackupBytes+1))
	closeErr := tmp.Close()
	_ = reader.Close()
	if copyErr != nil {
		return copyErr
	}
	if closeErr != nil {
		return closeErr
	}
	return validateStoredDocuments(path)
}

func validateStoredDocuments(path string) error {
	db, err := sql.Open("sqlite3", "file:"+path+"?mode=ro")
	if err != nil {
		return err
	}
	defer db.Close()
	for _, source := range []struct{ table, column string }{{"templates", "layout"}, {"quotations", "document"}} {
		var exists int
		if err := db.QueryRow("SELECT count(*) FROM sqlite_master WHERE type = 'table' AND name = ?", source.table).Scan(&exists); err != nil {
			return err
		}
		if exists == 0 {
			continue
		}
		rows, err := db.Query("SELECT " + source.column + " FROM " + source.table)
		if err != nil {
			return err
		}
		for rows.Next() {
			var raw string
			if err := rows.Scan(&raw); err != nil {
				rows.Close()
				return err
			}
			if _, err := documentformat.Validate([]byte(raw)); err != nil {
				rows.Close()
				return err
			}
		}
		if err := rows.Close(); err != nil {
			return err
		}
	}
	return nil
}

func (s *SQLiteBackupService) RestoreBackup(ctx context.Context, path, currentDBPath, assetsRoot string) error {
	result, err := validateArchive(path)
	if err != nil {
		return err
	}
	if !result.IsValid {
		return errors.New(result.Error)
	}
	reader, err := zip.OpenReader(path)
	if err != nil {
		return err
	}
	defer reader.Close()
	stage, err := os.MkdirTemp(filepath.Dir(currentDBPath), ".restore-*")
	if err != nil {
		return err
	}
	defer os.RemoveAll(stage)
	stageDB := filepath.Join(stage, "quotierlabs.sqlite3")
	stageAssets := filepath.Join(stage, "assets")
	if err := os.MkdirAll(stageAssets, 0700); err != nil {
		return err
	}
	for _, f := range reader.File {
		var target string
		switch {
		case f.Name == "database/quotierlabs.sqlite3":
			target = stageDB
		case strings.HasPrefix(f.Name, "assets/"):
			target = filepath.Join(stageAssets, filepath.FromSlash(strings.TrimPrefix(f.Name, "assets/")))
		default:
			continue
		}
		if err := extractFile(f, target); err != nil {
			return err
		}
	}
	if err := sqliteIntegrity(stageDB); err != nil {
		return fmt.Errorf("restored database failed integrity check: %w", err)
	}
	if err := validateStoredDocuments(stageDB); err != nil {
		return errors.New("backup contains unsupported document data")
	}
	sqlDB, err := s.db.DB()
	if err != nil {
		return err
	}
	if err := sqlDB.Close(); err != nil {
		return err
	}
	stamp := time.Now().UTC().Format("20060102T150405Z")
	rollbackDB := currentDBPath + ".before-restore-" + stamp
	_ = os.Remove(currentDBPath + "-wal")
	_ = os.Remove(currentDBPath + "-shm")
	if err := os.Rename(currentDBPath, rollbackDB); err != nil && !errors.Is(err, os.ErrNotExist) {
		return err
	}
	if err := os.Rename(stageDB, currentDBPath); err != nil {
		_ = os.Rename(rollbackDB, currentDBPath)
		return err
	}
	rollbackAssets := assetsRoot + ".before-restore-" + stamp
	assetsExisted := true
	if err := os.Rename(assetsRoot, rollbackAssets); err != nil {
		if !errors.Is(err, os.ErrNotExist) {
			rollbackPromotedDB(currentDBPath, rollbackDB)
			return err
		}
		assetsExisted = false
	}
	if err := os.Rename(stageAssets, assetsRoot); err != nil {
		if assetsExisted {
			_ = os.Rename(rollbackAssets, assetsRoot)
		}
		rollbackPromotedDB(currentDBPath, rollbackDB)
		return err
	}
	_ = os.Chmod(currentDBPath, 0600)
	_ = ctx
	return nil
}

func rollbackPromotedDB(current, rollback string) {
	failed := current + ".failed-restore-" + time.Now().UTC().Format("20060102T150405.000000000Z")
	if err := os.Rename(current, failed); err != nil {
		return
	}
	_ = os.Rename(rollback, current)
}

func safeMember(name string) bool {
	clean := filepath.Clean(filepath.FromSlash(name))
	return name != "" && !filepath.IsAbs(clean) && clean != "." && clean != ".." && !strings.HasPrefix(clean, ".."+string(os.PathSeparator))
}
func readZip(file *zip.File, limit int64) ([]byte, error) {
	r, err := file.Open()
	if err != nil {
		return nil, err
	}
	defer r.Close()
	raw, err := io.ReadAll(io.LimitReader(r, limit+1))
	if int64(len(raw)) > limit {
		return nil, errors.New("archive member exceeded limit")
	}
	return raw, err
}
func hashBytes(raw []byte) string { sum := sha256.Sum256(raw); return hex.EncodeToString(sum[:]) }
func fileHash(path string) (string, error) {
	f, err := os.Open(path)
	if err != nil {
		return "", err
	}
	defer f.Close()
	h := sha256.New()
	if _, err = io.Copy(h, f); err != nil {
		return "", err
	}
	return hex.EncodeToString(h.Sum(nil)), nil
}
func addBytes(zw *zip.Writer, name string, raw []byte) error {
	w, err := zw.CreateHeader(&zip.FileHeader{Name: name, Method: zip.Deflate})
	if err != nil {
		return err
	}
	_, err = w.Write(raw)
	return err
}
func addFile(zw *zip.Writer, name, path string) error {
	f, err := os.Open(path)
	if err != nil {
		return err
	}
	defer f.Close()
	h := &zip.FileHeader{Name: name, Method: zip.Deflate}
	h.SetMode(0600)
	w, err := zw.CreateHeader(h)
	if err != nil {
		return err
	}
	_, err = io.Copy(w, f)
	return err
}
func extractFile(file *zip.File, target string) error {
	if err := os.MkdirAll(filepath.Dir(target), 0700); err != nil {
		return err
	}
	src, err := file.Open()
	if err != nil {
		return err
	}
	defer src.Close()
	dst, err := os.OpenFile(target, os.O_CREATE|os.O_EXCL|os.O_WRONLY, 0600)
	if err != nil {
		return err
	}
	defer dst.Close()
	_, err = io.Copy(dst, io.LimitReader(src, maxBackupBytes+1))
	return err
}
func sqliteIntegrity(path string) error {
	db, err := sql.Open("sqlite3", "file:"+path+"?mode=ro")
	if err != nil {
		return err
	}
	defer db.Close()
	var result string
	if err = db.QueryRow("PRAGMA integrity_check").Scan(&result); err != nil {
		return err
	}
	if result != "ok" {
		return errors.New(result)
	}
	return nil
}
