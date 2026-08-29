package quotation

import (
	"context"
	"fmt"
	"time"

	"quotierlabs/backend/domain"
	domain_quotation "quotierlabs/backend/domain/quotation"
)

func (s *Service) DuplicateQuotation(ctx context.Context, companyID, quotationID string) (*QuotationDTO, error) {
	txCtx, err := s.txManager.BeginTx(ctx)
	if err != nil {
		return nil, err
	}
	defer func() { _ = s.txManager.Rollback(txCtx) }()

	q, err := s.repo.GetByID(txCtx, quotationID, companyID)
	if err != nil {
		return nil, err
	}

	year := time.Now().UTC().Year()
	seq, err := s.seqRepo.ReserveNext(txCtx, companyID, "QUOTATION", year)
	if err != nil {
		return nil, err
	}
	formattedSeq := fmt.Sprintf("QT-%d-%04d", year, seq)

	newQ := &domain.Quotation{
		ID:            s.idGen.Generate(),
		CompanyID:     companyID,
		TemplateID:    q.TemplateID,
		CustomerID:    q.CustomerID,
		Number:        formattedSeq,
		Status:        string(domain_quotation.StatusDraft),
		Document:      q.Document, // Keep the document state, including its schema version.
		SchemaVersion: q.SchemaVersion,
		Subtotal:      q.Subtotal,
		DiscountTotal: q.DiscountTotal,
		TaxableTotal:  q.TaxableTotal,
		CGSTTotal:     q.CGSTTotal,
		SGSTTotal:     q.SGSTTotal,
		IGSTTotal:     q.IGSTTotal,
		GrandTotal:    q.GrandTotal,
		AuditMetadata: domain.AuditMetadata{
			CreatedAt: time.Now().UTC(),
			UpdatedAt: time.Now().UTC(),
			Version:   1,
		},
	}

	// The duplicate is an independent draft that must satisfy the same document contract.
	if err := domain_quotation.ValidateQuotation(newQ); err != nil {
		return nil, fmt.Errorf("duplicate document invalid: %w", err)
	}

	if err := s.repo.Create(txCtx, newQ); err != nil {
		return nil, err
	}

	if err := s.txManager.Commit(txCtx); err != nil {
		return nil, err
	}

	dto := mapToDTO(newQ)
	return &dto, nil
}
