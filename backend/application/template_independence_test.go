package application_test

import (
	"context"
	"testing"
	"time"

	"quotierlabs/backend/domain/quotation"
	app_cust "quotierlabs/backend/application/customer"
	app_quot "quotierlabs/backend/application/quotation"
	app_tmpl "quotierlabs/backend/application/template"
	"quotierlabs/backend/infrastructure/id"
	"quotierlabs/backend/infrastructure/sqlite"
)

func TestTemplateIndependence(t *testing.T) {
	db := setupDB(t)
	sqlDB, _ := db.DB()
	_ = sqlite.RunMigrations(sqlDB)

	txManager := sqlite.NewGormTxManager(db)
	compRepo := sqlite.NewCompanyRepository(db)
	custRepo := sqlite.NewCustomerRepository(db)
	tmplRepo := sqlite.NewTemplateRepository(db)
	quotRepo := sqlite.NewQuotationRepository(db)
	seqRepo := sqlite.NewNumberSequenceRepository(db)
	secRepo := sqlite.NewSectionDefinitionRepository(db)
	idGen := id.NewULIDGenerator()
	resolver := quotation.NewTemplateResolver(secRepo)

	custSvc := app_cust.NewService(custRepo, idGen)
	tmplSvc := app_tmpl.NewService(tmplRepo, txManager, idGen)
	quotSvc := app_quot.NewService(quotRepo, tmplRepo, custRepo, compRepo, seqRepo, resolver, txManager, idGen, nil)

	ctx := context.Background()

	// 1. Setup
	compID := "comp-1"
	db.Exec("INSERT INTO companies (id, name, currency, is_active, created_at, updated_at, version) VALUES (?, 'My Company', 'INR', 1, ?, ?, 1)", compID, time.Now(), time.Now())
	db.Exec("INSERT INTO number_sequences (id, company_id, document_type, prefix, pattern, current_value, year, created_at, updated_at, version) VALUES ('seq-1', 'comp-1', 'QUOTATION', 'QT-', '%04d', 0, ?, ?, ?, 1)", time.Now().Year(), time.Now(), time.Now())

	cust, _ := custSvc.CreateCustomer(ctx, compID, app_cust.CustomerCreateDTO{Name: "Client A"})
	
	originalLayout := `{"rows":[{"id":"row-1","columns":[]}]}`
	tmpl, _ := tmplSvc.CreateTemplate(ctx, compID, app_tmpl.TemplateCreateDTO{Name: "Standard", Layout: originalLayout})

	// 2. Create Quotation
	qDTO, _ := quotSvc.CreateQuotationDraft(ctx, compID, app_quot.QuotationCreateDTO{TemplateID: tmpl.ID, CustomerID: cust.ID})

	// 3. Edit Quotation Document
	newDoc := `{"sections":[{"id":"sec-1"}]}`
	_, err := quotSvc.UpdateQuotationDocument(ctx, compID, app_quot.QuotationUpdateDocumentDTO{ID: qDTO.ID, Document: newDoc})
	if err != nil { t.Fatalf("Update failed: %v", err) }

	// 4. Verify Template is unchanged
	fetchedTmpl, err := tmplSvc.GetTemplate(ctx, compID, tmpl.ID)
	if err != nil { t.Fatalf("GetTemplate failed: %v", err) }
	
	if fetchedTmpl.Layout != originalLayout {
		t.Fatalf("Template layout was modified! Expected %s, got %s", originalLayout, fetchedTmpl.Layout)
	}
}
