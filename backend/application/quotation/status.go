package quotation

import (
	"context"
	"time"

	domain_quotation "quotierlabs/backend/domain/quotation"
)

func (s *Service) UpdateQuotationStatus(ctx context.Context, companyID, quotationID string, newStatus string) (*QuotationDTO, error) {
	txCtx, err := s.txManager.BeginTx(ctx)
	if err != nil {
		return nil, err
	}
	defer s.txManager.Rollback(txCtx)

	q, err := s.repo.GetByID(txCtx, quotationID, companyID)
	if err != nil {
		return nil, err
	}

	ns := domain_quotation.Status(newStatus)
	if err := domain_quotation.ValidateTransition(domain_quotation.Status(q.Status), ns); err != nil {
		return nil, err
	}

	q.Status = newStatus
	q.UpdatedAt = time.Now().UTC()

	if err := s.repo.Update(txCtx, q); err != nil {
		return nil, err
	}

	if err := s.txManager.Commit(txCtx); err != nil {
		return nil, err
	}

	dto := mapToDTO(q)
	return &dto, nil
}
