package quotation

import (
	"context"
	"quotierlabs/internal/domain"
)

func (s *Service) DeleteQuotation(ctx context.Context, companyID, quotationID string) error {
	q, err := s.repo.GetByID(ctx, quotationID, companyID)
	if err != nil {
		return err
	}

	if q.Status != "DRAFT" {
		return domain.ErrInvalidTransition
	}

	return s.repo.Delete(ctx, quotationID, companyID)
}
