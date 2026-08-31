package application_test

import (
	"context"
	"testing"
	"time"

	"encoding/json"
	sqlite_driver "gorm.io/driver/sqlite"
	"gorm.io/gorm"
	app_cust "quotierlabs/backend/application/customer"
	app_quot "quotierlabs/backend/application/quotation"
	app_tmpl "quotierlabs/backend/application/template"
	"quotierlabs/backend/domain/documentmodel"
	"quotierlabs/backend/infrastructure/id"
	"quotierlabs/backend/infrastructure/sqlite"
)

func setupDB(t *testing.T) *gorm.DB {
	db, err := gorm.Open(sqlite_driver.Open("file::memory:?cache=shared"), &gorm.Config{})
	if err != nil {
		t.Fatalf("failed to open memory db: %v", err)
	}
	db.Exec("PRAGMA foreign_keys = ON")
	return db
}

func TestE2ECriticalPath(t *testing.T) {
	db := setupDB(t)
	sqlDB, _ := db.DB()
	_ = sqlite.RunMigrations(sqlDB)

	txManager := sqlite.NewGormTxManager(db)
	compRepo := sqlite.NewCompanyRepository(db)
	custRepo := sqlite.NewCustomerRepository(db)
	tmplRepo := sqlite.NewTemplateRepository(db)
	quotRepo := sqlite.NewQuotationRepository(db)
	seqRepo := sqlite.NewNumberSequenceRepository(db)
	idGen := id.NewULIDGenerator()

	custSvc := app_cust.NewService(custRepo, idGen)
	tmplSvc := app_tmpl.NewService(tmplRepo, txManager, idGen)
	quotSvc := app_quot.NewService(quotRepo, tmplRepo, custRepo, compRepo, seqRepo, txManager, idGen, nil)

	ctx := context.Background()

	// 2. Create Company
	compID := "comp-1"
	db.Exec("INSERT INTO companies (id, name, currency, is_active, created_at, updated_at, version) VALUES (?, 'My Company', 'INR', 1, ?, ?, 1)", compID, time.Now(), time.Now())
	db.Exec("INSERT INTO number_sequences (id, company_id, document_type, prefix, pattern, current_value, year, created_at, updated_at, version) VALUES ('seq-1', 'comp-1', 'QUOTATION', 'QT-', '%04d', 0, ?, ?, ?, 1)", time.Now().Year(), time.Now(), time.Now())

	// 3. Create Customer
	custDTO := app_cust.CustomerCreateDTO{Name: "Client A"}
	cust, err := custSvc.CreateCustomer(ctx, compID, custDTO)
	if err != nil {
		t.Fatalf("CreateCustomer failed: %v", err)
	}

	// 4. Create Template
	blank, _ := json.Marshal(documentmodel.NewBlank("template-page"))
	tmplDTO := app_tmpl.TemplateCreateDTO{Name: "Standard Template", Layout: string(blank)}
	tmpl, err := tmplSvc.CreateTemplate(ctx, compID, tmplDTO)
	if err != nil {
		t.Fatalf("CreateTemplate failed: %v", err)
	}

	// 5. Create Quotation Draft
	qDTOInput := app_quot.QuotationCreateDTO{TemplateID: tmpl.ID, CustomerID: cust.ID}
	qDTO, err := quotSvc.CreateQuotationDraft(ctx, compID, qDTOInput)
	if err != nil {
		t.Fatalf("CreateQuotationDraft failed: %v", err)
	}
	if qDTO.Status != "DRAFT" {
		t.Fatalf("Expected DRAFT, got %v", qDTO.Status)
	}
	if qDTO.Number == "" {
		t.Fatalf("Expected number for DRAFT, got empty")
	}

	// 6. Update Quotation
	updated, _ := json.Marshal(documentmodel.NewBlank("quotation-page"))
	upDTO := app_quot.QuotationUpdateDocumentDTO{ID: qDTO.ID, Document: string(updated)}
	qDTO, err = quotSvc.UpdateQuotationDocument(ctx, compID, upDTO)
	if err != nil {
		t.Fatalf("UpdateQuotationDocument failed: %v", err)
	}

	// 7. Calculate Totals
	calcRes, err := quotSvc.RecalculateQuotation(ctx, compID, qDTO.ID)
	if err != nil {
		t.Fatalf("RecalculateQuotation failed: %v", err)
	}
	if calcRes.GrandTotal != 0 {
		t.Fatalf("Expected 0 total, got %v", calcRes.GrandTotal)
	}

	// 8. Finalize Quotation
	finalized, err := quotSvc.FinalizeQuotation(ctx, compID, qDTO.ID)
	if err != nil {
		t.Fatalf("FinalizeQuotation failed: %v", err)
	}
	if finalized.Status != "FINALIZED" {
		t.Fatalf("Expected FINALIZED, got %v", finalized.Status)
	}
	if finalized.Number == "" {
		t.Fatalf("Expected number to be present, got empty")
	}

	// 9. Verify in List
	list, err := quotSvc.ListQuotations(ctx, compID, app_quot.QuotationListFilterDTO{Limit: 10})
	if err != nil {
		t.Fatalf("ListQuotations failed: %v", err)
	}
	if list.Total != 1 {
		t.Fatalf("Expected 1 quote in list, got %v", list.Total)
	}
}
