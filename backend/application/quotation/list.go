package quotation

import (
	"context"
	"time"

	"quotierlabs/backend/domain"
)

func (s *Service) ListQuotations(ctx context.Context, companyID string, filterDTO QuotationListFilterDTO) (*QuotationListResponse, error) {
	filter := domain.QuotationListFilter{
		Limit:      filterDTO.Limit,
		Offset:     filterDTO.Offset,
		Status:     filterDTO.Status,
		CustomerID: filterDTO.CustomerID,
		TemplateID: filterDTO.TemplateID,
		Search:     filterDTO.Search,
		SortBy:     filterDTO.SortBy,
		SortDesc:   filterDTO.SortDesc,
	}

	if filterDTO.StartDate != nil {
		if t, err := time.Parse(time.RFC3339, *filterDTO.StartDate); err == nil {
			filter.StartDate = &t
		}
	}
	if filterDTO.EndDate != nil {
		if t, err := time.Parse(time.RFC3339, *filterDTO.EndDate); err == nil {
			filter.EndDate = &t
		}
	}

	quotations, err := s.repo.List(ctx, companyID, filter)
	if err != nil {
		return nil, err
	}

	total, err := s.repo.Count(ctx, companyID, filter)
	if err != nil {
		return nil, err
	}

	// Fetch customer names for the list
	// This could be optimized, but for MVP fetching one by one or caching via a map is fine
	customerMap := make(map[string]string)
	items := make([]QuotationSummaryDTO, len(quotations))
	for i, q := range quotations {
		custName := "Unknown Customer"
		if q.CustomerID != "" {
			if name, ok := customerMap[q.CustomerID]; ok {
				custName = name
			} else {
				cust, err := s.customerRepo.GetByID(ctx, q.CustomerID, companyID)
				if err == nil {
					customerMap[q.CustomerID] = cust.Name
					custName = cust.Name
				}
			}
		}

		items[i] = QuotationSummaryDTO{
			ID:           q.ID,
			Number:       q.Number,
			CustomerID:   q.CustomerID,
			CustomerName: custName,
			Status:       q.Status,
			GrandTotal:   q.GrandTotal,
			CreatedAt:    q.CreatedAt,
			UpdatedAt:    q.UpdatedAt,
		}
	}

	return &QuotationListResponse{
		Items: items,
		Total: total,
	}, nil
}
