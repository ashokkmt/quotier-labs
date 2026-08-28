package csvimport_test

import (
	"context"
	"os"
	"path/filepath"
	"testing"

	"quotierlabs/backend/domain"
	backup_domain "quotierlabs/backend/domain/backup"
	csvimport "quotierlabs/backend/infrastructure/import"
)

type MockCustomerRepo struct {
	domain.CustomerRepository
	Created int
}

func (m *MockCustomerRepo) Create(ctx context.Context, customer *domain.Customer) error {
	m.Created++
	return nil
}

func TestCSVImport(t *testing.T) {
	tempDir, _ := os.MkdirTemp("", "import_test_*")
	defer os.RemoveAll(tempDir)

	path := filepath.Join(tempDir, "customers.csv")
	_ = os.WriteFile(path, []byte("Client,Contact,Phone\nJohn Doe,john@test.com,123\n,Invalid,456"), 0644)

	repo := &MockCustomerRepo{}
	svc := csvimport.NewCSVImportService(repo)

	// Preview
	preview, err := svc.PreviewCustomers(path)
	if err != nil {
		t.Fatalf("preview failed: %v", err)
	}
	if preview.Total != 2 {
		t.Fatalf("expected 2 total rows, got %v", preview.Total)
	}
	if preview.Valid != 2 {
		t.Fatalf("expected 2 valid row, got %v", preview.Valid)
	}

	// Import
	mapping := backup_domain.ImportMapping{
		Name:  "Client",
		Email: "Contact",
		Phone: "Phone",
	}
	imported, err := svc.ImportCustomers(context.Background(), "comp-1", path, mapping)
	if err != nil {
		t.Fatalf("import failed: %v", err)
	}
	if imported != 1 {
		t.Fatalf("expected 1 imported, got %v", imported)
	}
	if repo.Created != 1 {
		t.Fatalf("expected 1 created in repo")
	}
}
