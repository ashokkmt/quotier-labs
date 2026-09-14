package quotation

import (
	"context"
	"encoding/json"
	"time"

	"quotierlabs/backend/application/flowlayout"
	"quotierlabs/backend/domain"
	"quotierlabs/backend/domain/documentformat"
	"quotierlabs/backend/domain/documentv6"
	domain_quotation "quotierlabs/backend/domain/quotation"
)

func (s *Service) FinalizeQuotation(ctx context.Context, companyID, quotationID string) (*QuotationDTO, error) {
	txCtx, err := s.txManager.BeginTx(ctx)
	if err != nil {
		return nil, err
	}
	defer func() { _ = s.txManager.Rollback(txCtx) }()

	q, err := s.repo.GetByID(txCtx, quotationID, companyID)
	if err != nil {
		return nil, err
	}

	if err := domain_quotation.ValidateTransition(domain_quotation.Status(q.Status), domain_quotation.StatusFinalized); err != nil {
		return nil, err
	}

	// 1. Validate Document Structure and extract only registered quotation nodes.
	_, err = documentformat.Validate([]byte(q.Document))
	if err != nil {
		return nil, err
	}
	v6Doc, err := documentv6.Parse([]byte(q.Document))
	if err != nil {
		return nil, err
	}
	lines := domain_quotation.ExtractV6LineItems(v6Doc)

	// 2. Authoritative Recalculation
	comp, err := s.companyRepo.GetByID(txCtx, companyID)
	if err != nil {
		return nil, err
	}
	cust, err := s.customerRepo.GetByID(txCtx, q.CustomerID, companyID)
	if err != nil {
		return nil, err
	}

	// Documents must resolve cleanly before they can become immutable.
	err = s.checkV6Finalization(txCtx, v6Doc, q, comp, cust)
	if err != nil {
		return nil, err
	}

	res, err := s.CalculatePreview(txCtx, companyID, lines, cust.State)
	if err != nil {
		return nil, err
	}

	q.Subtotal = res.Subtotal
	q.DiscountTotal = res.DiscountTotal
	q.TaxableTotal = res.TaxableTotal
	q.CGSTTotal = res.CGSTTotal
	q.SGSTTotal = res.SGSTTotal
	q.IGSTTotal = res.IGSTTotal
	q.GrandTotal = res.GrandTotal

	// 3. Snapshotting
	compSnap, _ := json.Marshal(comp)
	custSnap, _ := json.Marshal(cust)
	tmpl, _ := s.templateRepo.GetByID(txCtx, q.TemplateID)
	tmplSnap, _ := json.Marshal(tmpl)

	compSnapStr := string(compSnap)
	custSnapStr := string(custSnap)
	tmplSnapStr := string(tmplSnap)

	q.CompanySnapshot = &compSnapStr
	q.CustomerSnapshot = &custSnapStr
	q.TemplateSnapshot = &tmplSnapStr

	// 4. Transition Status
	q.Status = string(domain_quotation.StatusFinalized)
	q.UpdatedAt = time.Now().UTC()

	// 5. Update DB
	if err := s.repo.Update(txCtx, q); err != nil {
		return nil, err
	}

	if err := s.txManager.Commit(txCtx); err != nil {
		return nil, err
	}

	dto := mapToDTO(q)
	return &dto, nil
}

func (s *Service) checkV6Finalization(ctx context.Context, doc *documentv6.Document, q *domain.Quotation, comp *domain.Company, cust *domain.Customer) error {
	layout, err := flowlayout.Resolve(ctx, doc, flowlayout.ResolveInput{Company: comp, Customer: cust, Quotation: q}, s.layoutMetrics)
	if err != nil {
		return &domain.ValidationError{Field: "document", Message: "quotation layout is invalid and cannot be finalized"}
	}
	for _, diagnostic := range layout.Diagnostics {
		if diagnostic.Code == "missing_field" || diagnostic.Code == "oversized_table_row" {
			return &domain.ValidationError{Field: "document", Message: diagnostic.Message + "; resolve it before finalizing"}
		}
	}
	return nil
}
