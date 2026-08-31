package legacydata

import (
	"context"
	"crypto/sha256"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"time"

	_ "github.com/mattn/go-sqlite3"
	"gorm.io/gorm"
	"quotierlabs/backend/infrastructure/appidentity"
	"quotierlabs/backend/infrastructure/apppaths"
	"quotierlabs/backend/infrastructure/assets"
	"quotierlabs/backend/infrastructure/fileutil"
)

type Candidate struct {
	Path           string `json:"path"`
	DisplayPath    string `json:"display_path"`
	ModifiedAt     string `json:"modified_at"`
	Size           int64  `json:"size"`
	CompanyCount   int    `json:"company_count"`
	QuotationCount int    `json:"quotation_count"`
}

type Service struct {
	db    *gorm.DB
	paths apppaths.Paths
	build appidentity.BuildInfo
}

func NewService(db *gorm.DB, paths apppaths.Paths, build appidentity.BuildInfo) *Service {
	return &Service{db: db, paths: paths, build: build}
}

func (s *Service) Discover(ctx context.Context) ([]Candidate, error) {
	if _, err := os.Stat(filepath.Join(s.paths.StateRoot, "legacy-import-v1.json")); err == nil {
		return []Candidate{}, nil
	}
	var targetCompanies int64
	if err := s.db.WithContext(ctx).Table("companies").Count(&targetCompanies).Error; err != nil || targetCompanies != 0 {
		return []Candidate{}, err
	}
	seen := map[string]bool{}
	var candidates []string
	if s.build.Channel == "development" {
		repository := filepath.Dir(filepath.Dir(filepath.Dir(s.paths.DataRoot)))
		candidates = append(candidates, filepath.Join(repository, "quotierlabs.db"), filepath.Join(repository, "apps", "desktop", "quotierlabs.db"))
	} else {
		candidates = append(candidates, filepath.Join(s.paths.InstallRoot, "quotierlabs.db"))
		if cwd, err := os.Getwd(); err == nil {
			candidates = append(candidates, filepath.Join(cwd, "quotierlabs.db"))
		}
	}
	result := make([]Candidate, 0, len(candidates))
	for _, candidatePath := range candidates {
		candidatePath = filepath.Clean(candidatePath)
		if candidatePath == s.paths.DBPath() || seen[candidatePath] {
			continue
		}
		seen[candidatePath] = true
		candidate, err := inspect(candidatePath)
		if err == nil {
			result = append(result, candidate)
		}
	}
	return result, nil
}

func inspect(path string) (Candidate, error) {
	info, err := os.Stat(path)
	if err != nil || info.IsDir() || info.Size() < 100 {
		return Candidate{}, errors.New("not a legacy database")
	}
	db, err := sql.Open("sqlite3", "file:"+filepath.ToSlash(path)+"?mode=ro")
	if err != nil {
		return Candidate{}, err
	}
	defer db.Close()
	var integrity string
	if err := db.QueryRow(`PRAGMA integrity_check`).Scan(&integrity); err != nil || integrity != "ok" {
		return Candidate{}, errors.New("legacy database failed integrity check")
	}
	var companies, quotations int
	if err := db.QueryRow(`SELECT COUNT(*) FROM companies`).Scan(&companies); err != nil || companies == 0 {
		return Candidate{}, errors.New("legacy database has no company data")
	}
	_ = db.QueryRow(`SELECT COUNT(*) FROM quotations`).Scan(&quotations)
	home, _ := os.UserHomeDir()
	display := path
	if home != "" && strings.HasPrefix(path, home+string(filepath.Separator)) {
		display = "~" + strings.TrimPrefix(path, home)
	}
	return Candidate{Path: path, DisplayPath: display, ModifiedAt: info.ModTime().UTC().Format(time.RFC3339), Size: info.Size(), CompanyCount: companies, QuotationCount: quotations}, nil
}

func (s *Service) Import(ctx context.Context, sourcePath string) error {
	candidates, err := s.Discover(ctx)
	if err != nil {
		return err
	}
	allowed := false
	for _, candidate := range candidates {
		if candidate.Path == filepath.Clean(sourcePath) {
			allowed = true
			break
		}
	}
	if !allowed {
		return errors.New("legacy database is not an approved migration candidate")
	}
	stage, err := os.CreateTemp(filepath.Dir(s.paths.DBPath()), ".legacy-import-*.sqlite3")
	if err != nil {
		return err
	}
	stagePath := stage.Name()
	_ = stage.Close()
	_ = os.Remove(stagePath)
	defer os.Remove(stagePath)
	source, err := sql.Open("sqlite3", "file:"+filepath.ToSlash(sourcePath)+"?mode=ro")
	if err != nil {
		return err
	}
	escaped := strings.ReplaceAll(stagePath, "'", "''")
	if _, err := source.Exec("VACUUM INTO '" + escaped + "'"); err != nil {
		_ = source.Close()
		return fmt.Errorf("snapshot legacy database: %w", err)
	}
	_ = source.Close()
	staged, err := sql.Open("sqlite3", stagePath)
	if err != nil {
		return err
	}
	var integrity string
	if err := migrateManagedAssets(staged, s.paths.AssetsRoot()); err != nil {
		_ = staged.Close()
		return fmt.Errorf("migrate managed assets: %w", err)
	}
	if err := staged.QueryRow(`PRAGMA integrity_check`).Scan(&integrity); err != nil || integrity != "ok" {
		_ = staged.Close()
		return errors.New("legacy snapshot failed integrity validation")
	}
	_ = staged.Close()
	current, err := s.db.DB()
	if err != nil {
		return err
	}
	if err := current.Close(); err != nil {
		return err
	}
	target := s.paths.DBPath()
	rollback := fmt.Sprintf("%s.before-legacy-import-%s", target, time.Now().UTC().Format("20060102T150405.000000000Z"))
	_ = os.Remove(target + "-wal")
	_ = os.Remove(target + "-shm")
	if err := os.Rename(target, rollback); err != nil && !os.IsNotExist(err) {
		return err
	}
	if err := os.Rename(stagePath, target); err != nil {
		_ = os.Rename(rollback, target)
		return err
	}
	_ = os.Chmod(target, 0600)
	receipt, _ := json.MarshalIndent(map[string]any{"schema_version": 1, "source": sourcePath, "source_size": fileSize(sourcePath), "imported_at": time.Now().UTC()}, "", "  ")
	return fileutil.AtomicWrite(filepath.Join(s.paths.StateRoot, "legacy-import-v1.json"), receipt, 0600)
}

func migrateManagedAssets(db *sql.DB, assetsRoot string) error {
	legacyConfig, err := os.UserConfigDir()
	if err != nil {
		return nil
	}
	legacyRoot := filepath.Join(legacyConfig, "QuotierLabs", "images")
	if info, err := os.Stat(legacyRoot); err != nil || !info.IsDir() {
		return nil
	}
	if err := os.MkdirAll(assetsRoot, 0700); err != nil {
		return err
	}
	for _, column := range []string{"logo_url", "signature_url", "stamp_url"} {
		if !columnExists(db, "companies", column) {
			continue
		}
		rows, err := db.Query("SELECT id, " + column + " FROM companies WHERE " + column + " IS NOT NULL AND " + column + " <> ''")
		if err != nil {
			return err
		}
		var updates [][2]string
		for rows.Next() {
			var id, value string
			if rows.Scan(&id, &value) == nil {
				if assetID, ok, importErr := importLegacyAsset(value, legacyRoot, assetsRoot); importErr != nil {
					rows.Close()
					return importErr
				} else if ok {
					updates = append(updates, [2]string{assetID, id})
				}
			}
		}
		_ = rows.Close()
		for _, update := range updates {
			if _, err := db.Exec("UPDATE companies SET "+column+" = ? WHERE id = ?", update[0], update[1]); err != nil {
				return err
			}
		}
	}
	for _, target := range []struct{ table, column string }{{"templates", "layout"}, {"template_versions", "layout"}, {"quotations", "document"}} {
		if err := migrateJSONColumn(db, target.table, target.column, legacyRoot, assetsRoot); err != nil {
			return err
		}
	}
	return nil
}

func migrateJSONColumn(db *sql.DB, table, column, legacyRoot, assetsRoot string) error {
	if !columnExists(db, table, column) {
		return nil
	}
	rows, err := db.Query("SELECT id, " + column + " FROM " + table)
	if err != nil {
		return err
	}
	type update struct{ id, raw string }
	updates := []update{}
	for rows.Next() {
		var id, raw string
		if rows.Scan(&id, &raw) != nil {
			continue
		}
		var value any
		if json.Unmarshal([]byte(raw), &value) != nil {
			continue
		}
		changed, err := rewriteAssetStrings(&value, legacyRoot, assetsRoot)
		if err != nil {
			rows.Close()
			return err
		}
		if changed {
			encoded, _ := json.Marshal(value)
			updates = append(updates, update{id: id, raw: string(encoded)})
		}
	}
	_ = rows.Close()
	for _, item := range updates {
		if _, err := db.Exec("UPDATE "+table+" SET "+column+" = ? WHERE id = ?", item.raw, item.id); err != nil {
			return err
		}
	}
	return nil
}

func rewriteAssetStrings(value *any, legacyRoot, assetsRoot string) (bool, error) {
	switch typed := (*value).(type) {
	case string:
		assetID, ok, err := importLegacyAsset(typed, legacyRoot, assetsRoot)
		if ok {
			*value = assetID
		}
		return ok, err
	case []any:
		changed := false
		for i := range typed {
			itemChanged, err := rewriteAssetStrings(&typed[i], legacyRoot, assetsRoot)
			if err != nil {
				return false, err
			}
			changed = changed || itemChanged
		}
		return changed, nil
	case map[string]any:
		changed := false
		for key, item := range typed {
			itemChanged, err := rewriteAssetStrings(&item, legacyRoot, assetsRoot)
			if err != nil {
				return false, err
			}
			if itemChanged {
				typed[key] = item
				changed = true
			}
		}
		return changed, nil
	default:
		return false, nil
	}
}

func importLegacyAsset(value, legacyRoot, assetsRoot string) (string, bool, error) {
	clean := filepath.Clean(value)
	rel, err := filepath.Rel(legacyRoot, clean)
	if err != nil || rel == "." || strings.HasPrefix(rel, "..") || filepath.IsAbs(rel) {
		return "", false, nil
	}
	ext := strings.ToLower(filepath.Ext(clean))
	if assets.MIMEForExtension(ext) == "" {
		return "", false, nil
	}
	info, err := os.Stat(clean)
	if err != nil || info.IsDir() || info.Size() > assets.MaxImageBytes {
		return "", false, nil
	}
	raw, err := os.ReadFile(clean)
	if err != nil {
		return "", false, err
	}
	if err := assets.ValidateImage(raw, ext); err != nil {
		return "", false, fmt.Errorf("legacy image validation failed: %w", err)
	}
	digest := sha256.Sum256(raw)
	name := fmt.Sprintf("%x%s", digest[:], ext)
	destination := filepath.Join(assetsRoot, name)
	if _, err := os.Stat(destination); errors.Is(err, os.ErrNotExist) {
		tmp, err := os.CreateTemp(assetsRoot, ".legacy-asset-*.tmp")
		if err != nil {
			return "", false, err
		}
		tmpName := tmp.Name()
		defer os.Remove(tmpName)
		_ = tmp.Chmod(0600)
		if _, err := tmp.Write(raw); err != nil {
			tmp.Close()
			return "", false, err
		}
		if err := tmp.Sync(); err != nil {
			tmp.Close()
			return "", false, err
		}
		if err := tmp.Close(); err != nil {
			return "", false, err
		}
		if err := os.Rename(tmpName, destination); err != nil {
			return "", false, err
		}
	}
	return "asset:" + name, true, nil
}

func columnExists(db *sql.DB, table, column string) bool {
	rows, err := db.Query("PRAGMA table_info(" + table + ")")
	if err != nil {
		return false
	}
	defer rows.Close()
	for rows.Next() {
		var cid, notNull, primaryKey int
		var name, dataType string
		var defaultValue any
		if rows.Scan(&cid, &name, &dataType, &notNull, &defaultValue, &primaryKey) == nil && name == column {
			return true
		}
	}
	return false
}

func (s *Service) Skip() error {
	receipt, _ := json.MarshalIndent(map[string]any{"schema_version": 1, "skipped": true, "recorded_at": time.Now().UTC()}, "", "  ")
	return fileutil.AtomicWrite(filepath.Join(s.paths.StateRoot, "legacy-import-v1.json"), receipt, 0600)
}

func fileSize(path string) int64 {
	if info, err := os.Stat(path); err == nil {
		return info.Size()
	}
	return 0
}
