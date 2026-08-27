package sqlite

import (
	"context"
	"gorm.io/gorm"
	"quotierlabs/backend/domain"
)

type txKey struct{}

type GormTxManager struct {
	db *gorm.DB
}

func NewGormTxManager(db *gorm.DB) domain.TxManager {
	return &GormTxManager{db: db}
}

func (tm *GormTxManager) BeginTx(ctx context.Context) (context.Context, error) {
	tx := tm.db.WithContext(ctx).Begin()
	if tx.Error != nil {
		return nil, tx.Error
	}
	return context.WithValue(ctx, txKey{}, tx), nil
}

func (tm *GormTxManager) Commit(ctx context.Context) error {
	tx, ok := ctx.Value(txKey{}).(*gorm.DB)
	if !ok {
		return nil // Not in a transaction
	}
	return tx.Commit().Error
}

func (tm *GormTxManager) Rollback(ctx context.Context) error {
	tx, ok := ctx.Value(txKey{}).(*gorm.DB)
	if !ok {
		return nil
	}
	return tx.Rollback().Error
}

// GetDB retrieves the transaction DB from context, or returns the default DB
func GetDB(ctx context.Context, defaultDB *gorm.DB) *gorm.DB {
	if tx, ok := ctx.Value(txKey{}).(*gorm.DB); ok {
		return tx
	}
	return defaultDB.WithContext(ctx)
}
