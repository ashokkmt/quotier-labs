package quotation

import (
	"context"
	"fmt"
)

func (s *Service) DeleteQuotation(ctx context.Context, companyID, quotationID string) error {
	q, err := s.repo.GetByID(ctx, quotationID, companyID)
	if err != nil {
		return err
	}

	if q.Status != "DRAFT" {
		return fmt.Errorf("only DRAFT quotations can be deleted")
	}

	return s.repo.Delete(ctx, quotationID, companyID)
}
