package sqlite

import (
	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"
)

func NewDB(dsn string) (*gorm.DB, error) {
	db, err := gorm.Open(sqlite.Open(dsn), &gorm.Config{
		Logger: logger.Default.LogMode(logger.Info),
	})
	if err != nil {
		return nil, err
	}

	sqlDB, err := db.DB()
	if err != nil {
		return nil, err
	}

	// PRAGMA config for SQLite
	if _, err := sqlDB.Exec("PRAGMA foreign_keys = ON"); err != nil {
		return nil, err
	}
	if _, err := sqlDB.Exec("PRAGMA journal_mode = WAL"); err != nil {
		return nil, err
	}
	if _, err := sqlDB.Exec("PRAGMA synchronous = NORMAL"); err != nil {
		return nil, err
	}
	if _, err := sqlDB.Exec("PRAGMA busy_timeout = 5000"); err != nil {
		return nil, err
	}

	return db, nil
}
