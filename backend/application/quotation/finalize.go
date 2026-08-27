package quotation

import (
	"context"
	"encoding/json"
	"time"

		domain_quotation "quotierlabs/backend/domain/quotation"
)

func (s *Service) FinalizeQuotation(ctx context.Context, companyID, quotationID string) (*QuotationDTO, error) {
	txCtx, err := s.txManager.BeginTx(ctx)
	if err != nil {
		return nil, err
	}
	defer s.txManager.Rollback(txCtx)

	q, err := s.repo.GetByID(txCtx, quotationID, companyID)
	if err != nil {
		return nil, err
	}

	if err := domain_quotation.ValidateTransition(domain_quotation.Status(q.Status), domain_quotation.StatusFinalized); err != nil {
		return nil, err
	}

	// 1. Validate Document Structure
	doc, err := domain_quotation.ParseDocument(q.Document)
	if err != nil {
		return nil, err
	}
	if err := domain_quotation.ValidateDocument(doc); err != nil {
		return nil, err
	}

	// 2. Authoritative Recalculation
	// RecalculateQuotation uses its own transaction, but since we are within txCtx, we should extract the core recalculation logic
	// Actually, we can just call it on the struct directly without saving.
	// Wait, we need to do this carefully.
	
	comp, err := s.companyRepo.GetByID(txCtx, companyID)
	if err != nil {
		return nil, err
	}
	cust, err := s.customerRepo.GetByID(txCtx, q.CustomerID, companyID)
	if err != nil {
		return nil, err
	}

	// (We can use CalculatePreview internally to avoid nested transactions)
	lines := domain_quotation.ExtractLineItems(doc)
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
