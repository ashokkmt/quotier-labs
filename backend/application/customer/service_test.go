package customer_test

import (
	"context"
	"database/sql"
	"testing"
	"time"

	"github.com/pressly/goose/v3"
	"gorm.io/driver/sqlite"
	"gorm.io/gorm"

	"quotierlabs/backend/application/customer"
	infra_id "quotierlabs/backend/infrastructure/id"
	infra_sqlite "quotierlabs/backend/infrastructure/sqlite"
)

func setupTestDB(t *testing.T) *gorm.DB {
	dsn := "file:" + t.Name() + "?mode=memory&cache=shared"
	sqlDB, err := sql.Open("sqlite3", dsn)
	if err != nil {
		t.Fatalf("failed to open sql db: %v", err)
	}

	_ = goose.SetDialect("sqlite3")
	if err := goose.Up(sqlDB, "../../../migrations"); err != nil {
		t.Fatalf("goose up failed: %v", err)
	}

	db, err := gorm.Open(sqlite.Open(dsn), &gorm.Config{})
	if err != nil {
		t.Fatalf("failed to open gorm db: %v", err)
	}

	conn, _ := db.DB()
	conn.SetMaxOpenConns(1)
	_, _ = conn.Exec("PRAGMA foreign_keys = ON")

	return db
}

func TestCustomerService(t *testing.T) {
	db := setupTestDB(t)
	// Needs a company first
	db.Exec("INSERT INTO companies (id, name, currency, created_at, updated_at, version) VALUES ('comp-1', 'Test Comp', 'INR', ?, ?, 1)", time.Now(), time.Now())

	repo := infra_sqlite.NewCustomerRepository(db)
	idGen := infra_id.NewULIDGenerator()
	svc := customer.NewService(repo, idGen)
	ctx := context.Background()

	// Create
	email := "client@example.com"
	createDTO := customer.CustomerCreateDTO{
		Name:  "Test Client",
		Email: &email,
	}
	created, err := svc.CreateCustomer(ctx, "comp-1", createDTO)
	if err != nil {
		t.Fatalf("failed to create customer: %v", err)
	}

	// Update
	newName := "Updated Client"
	updateDTO := customer.CustomerUpdateDTO{
		ID:    created.ID,
		Name:  newName,
		Email: &email,
	}
	updated, err := svc.UpdateCustomer(ctx, "comp-1", updateDTO)
	if err != nil || updated.Name != newName {
		t.Fatalf("failed to update customer")
	}

	// List
	list, err := svc.ListCustomers(ctx, "comp-1", customer.CustomerListFilterDTO{Limit: 10, Offset: 0})
	if err != nil || len(list.Items) != 1 {
		t.Fatalf("failed to list customers")
	}

	// Search
	searchRes, err := svc.SearchCustomers(ctx, "comp-1", "Updated")
	if err != nil || len(searchRes) != 1 {
		t.Fatalf("failed to search customers")
	}

	// Isolation Check
	db.Exec("INSERT INTO companies (id, name, currency, created_at, updated_at, version) VALUES ('comp-2', 'Other Comp', 'INR', ?, ?, 1)", time.Now(), time.Now())
	_, err = svc.GetCustomer(ctx, "comp-2", created.ID)
	if err == nil {
		t.Fatalf("should not be able to get customer from another company")
	}

	// Delete
	err = svc.DeleteCustomer(ctx, "comp-1", created.ID)
	if err != nil {
		t.Fatalf("failed to delete customer: %v", err)
	}

	list2, _ := svc.ListCustomers(ctx, "comp-1", customer.CustomerListFilterDTO{Limit: 10, Offset: 0})
	if len(list2.Items) != 0 {
		t.Fatalf("expected 0 customers after deletion")
	}
}
