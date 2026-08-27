package backup

import (
	"archive/zip"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"time"

	"gorm.io/gorm"
	"quotierlabs/backend/domain/backup"
)

type SQLiteBackupService struct {
	db *gorm.DB
}

func NewSQLiteBackupService(db *gorm.DB) *SQLiteBackupService {
	return &SQLiteBackupService{db: db}
}

func (s *SQLiteBackupService) CreateBackup(ctx context.Context, destPath string, metadata backup.BackupMetadata) (*backup.BackupInfo, error) {
	// 1. Create a temp directory
	tempDir, err := os.MkdirTemp("", "quotierlabs_backup_*")
	if err != nil {
		return nil, fmt.Errorf("failed to create temp dir: %w", err)
	}
	defer os.RemoveAll(tempDir)

	// 2. Vacuum DB into temp file
	tempDBPath := filepath.Join(tempDir, "quotierlabs.db")
	
	// Ensure SQLite vacuum works
	if err := s.db.Exec(fmt.Sprintf("VACUUM INTO '%s'", tempDBPath)).Error; err != nil {
		return nil, fmt.Errorf("failed to vacuum database: %w", err)
	}

	// 3. Write metadata.json
	metaPath := filepath.Join(tempDir, "metadata.json")
	metaFile, err := os.Create(metaPath)
	if err != nil {
		return nil, fmt.Errorf("failed to create metadata file: %w", err)
	}
	
	if err := json.NewEncoder(metaFile).Encode(metadata); err != nil {
		metaFile.Close()
		return nil, fmt.Errorf("failed to encode metadata: %w", err)
	}
	metaFile.Close()

	// 4. Create ZIP archive
	zipFile, err := os.Create(destPath)
	if err != nil {
		return nil, fmt.Errorf("failed to create zip file: %w", err)
	}
	defer zipFile.Close()

	zipWriter := zip.NewWriter(zipFile)

	// Add files to ZIP
	files := []string{tempDBPath, metaPath}
	for _, file := range files {
		if err := addFileToZip(zipWriter, file); err != nil {
			zipWriter.Close()
			return nil, err
		}
	}
	
	if err := zipWriter.Close(); err != nil {
		return nil, fmt.Errorf("failed to finalize zip: %w", err)
	}

	// 5. Get file info
	info, err := zipFile.Stat()
	if err != nil {
		return nil, err
	}

	return &backup.BackupInfo{
		Path:     destPath,
		Size:     info.Size(),
		Metadata: metadata,
	}, nil
}

func (s *SQLiteBackupService) ValidateBackup(ctx context.Context, path string) (*backup.ValidationResult, error) {
	reader, err := zip.OpenReader(path)
	if err != nil {
		return &backup.ValidationResult{IsValid: false, Error: "invalid zip archive"}, nil
	}
	defer reader.Close()

	var metaFile *zip.File
	var dbFile *zip.File

	for _, f := range reader.File {
		if f.Name == "metadata.json" {
			metaFile = f
		} else if f.Name == "quotierlabs.db" {
			dbFile = f
		}
	}

	if metaFile == nil || dbFile == nil {
		return &backup.ValidationResult{IsValid: false, Error: "missing metadata or database file"}, nil
	}

	// Read metadata
	rc, err := metaFile.Open()
	if err != nil {
		return &backup.ValidationResult{IsValid: false, Error: "failed to read metadata"}, nil
	}
	defer rc.Close()

	var metadata backup.BackupMetadata
	if err := json.NewDecoder(rc).Decode(&metadata); err != nil {
		return &backup.ValidationResult{IsValid: false, Error: "invalid metadata format"}, nil
	}

	return &backup.ValidationResult{
		IsValid: true,
		Info: &backup.BackupInfo{
			Path:     path,
			Size:     dbFile.FileInfo().Size(),
			Metadata: metadata,
		},
	}, nil
}

func (s *SQLiteBackupService) RestoreBackup(ctx context.Context, path string, currentDBPath string) error {
	// First validate
	res, err := s.ValidateBackup(ctx, path)
	if err != nil {
		return err
	}
	if !res.IsValid {
		return fmt.Errorf("invalid backup: %s", res.Error)
	}

	// Unzip to temp
	reader, err := zip.OpenReader(path)
	if err != nil {
		return err
	}
	defer reader.Close()

	var dbFile *zip.File
	for _, f := range reader.File {
		if f.Name == "quotierlabs.db" {
			dbFile = f
			break
		}
	}

	tempDir, err := os.MkdirTemp("", "quotierlabs_restore_*")
	if err != nil {
		return err
	}
	defer os.RemoveAll(tempDir)

	tempDBPath := filepath.Join(tempDir, "quotierlabs.db")
	dst, err := os.Create(tempDBPath)
	if err != nil {
		return err
	}

	src, err := dbFile.Open()
	if err != nil {
		dst.Close()
		return err
	}
	
	if _, err := io.Copy(dst, src); err != nil {
		src.Close()
		dst.Close()
		return err
	}
	src.Close()
	dst.Close()

	// Before replacing, we should ideally close the current DB connection.
	// Since we can't easily instruct Gorm to close completely and reopen from here,
	// we get the underlying sql.DB and close it.
	sqlDB, err := s.db.DB()
	if err == nil {
		sqlDB.Close()
	}

	// Wait a moment for OS locks to release (especially on Windows)
	time.Sleep(500 * time.Millisecond)

	// Replace the current DB file
	if err := os.Rename(tempDBPath, currentDBPath); err != nil {
		// Try copy if rename fails across volumes
		if err := copyFile(tempDBPath, currentDBPath); err != nil {
			return fmt.Errorf("failed to replace database file: %w", err)
		}
	}

	return nil
}

func addFileToZip(zipWriter *zip.Writer, filename string) error {
	fileToZip, err := os.Open(filename)
	if err != nil {
		return err
	}
	defer fileToZip.Close()

	info, err := fileToZip.Stat()
	if err != nil {
		return err
	}

	header, err := zip.FileInfoHeader(info)
	if err != nil {
		return err
	}
	header.Name = filepath.Base(filename)
	header.Method = zip.Deflate

	writer, err := zipWriter.CreateHeader(header)
	if err != nil {
		return err
	}
	_, err = io.Copy(writer, fileToZip)
	return err
}

func copyFile(src, dst string) error {
	in, err := os.Open(src)
	if err != nil { return err }
	defer in.Close()

	out, err := os.Create(dst)
	if err != nil { return err }
	defer out.Close()

	_, err = io.Copy(out, in)
	return err
}
