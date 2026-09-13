package quotation

import (
	"context"
	"encoding/json"

	"quotierlabs/backend/domain"
	"quotierlabs/backend/domain/calculation"
	"quotierlabs/backend/domain/documentformat"
	"quotierlabs/backend/domain/documentmodel"
	"quotierlabs/backend/domain/documentv6"
	domain_quotation "quotierlabs/backend/domain/quotation"
)

type CalculationResultDTO struct {
	Subtotal      int64               `json:"subtotal"`
	DiscountTotal int64               `json:"discount_total"`
	TaxableTotal  int64               `json:"taxable_total"`
	CGSTTotal     int64               `json:"cgst_total"`
	SGSTTotal     int64               `json:"sgst_total"`
	IGSTTotal     int64               `json:"igst_total"`
	GrandTotal    int64               `json:"grand_total"`
	TaxMode       string              `json:"tax_mode"`
	LineItems     []LineItemResultDTO `json:"line_items"`
}

type LineItemResultDTO struct {
	ID         string `json:"id"`
	Taxable    int64  `json:"taxable"`
	CGST       int64  `json:"cgst"`
	SGST       int64  `json:"sgst"`
	IGST       int64  `json:"igst"`
	GrandTotal int64  `json:"grand_total"`
}

func (s *Service) RecalculateQuotation(ctx context.Context, companyID, quotationID string) (*CalculationResultDTO, error) {
	txCtx, err := s.txManager.BeginTx(ctx)
	if err != nil {
		return nil, err
	}
	defer func() { _ = s.txManager.Rollback(txCtx) }()

	q, err := s.repo.GetByID(txCtx, quotationID, companyID)
	if err != nil {
		return nil, err
	}

	version, err := documentformat.Validate([]byte(q.Document))
	if err != nil {
		return nil, err
	}
	var lines []calculation.LineItemInput
	if version == documentmodel.SchemaVersion {
		doc, parseErr := documentmodel.Parse([]byte(q.Document))
		if parseErr != nil {
			return nil, parseErr
		}
		lines = domain_quotation.ExtractV5LineItems(doc)
	} else {
		doc, parseErr := documentv6.Parse([]byte(q.Document))
		if parseErr != nil {
			return nil, parseErr
		}
		lines = domain_quotation.ExtractV6LineItems(doc)
	}

	var comp *domain.Company
	if q.CompanySnapshot != nil {
		comp = &domain.Company{}
		_ = json.Unmarshal([]byte(*q.CompanySnapshot), comp)
	} else {
		comp, _ = s.companyRepo.GetByID(txCtx, companyID)
	}

	var cust *domain.Customer
	if q.CustomerSnapshot != nil {
		cust = &domain.Customer{}
		_ = json.Unmarshal([]byte(*q.CustomerSnapshot), cust)
	} else {
		cust, _ = s.customerRepo.GetByID(txCtx, q.CustomerID, companyID)
	}

	taxMode := calculation.TaxModeIntraState
	if comp != nil && cust != nil {
		if comp.State != nil && cust.State != nil && *comp.State != *cust.State {
			taxMode = calculation.TaxModeInterState
		}
	}

	engine := calculation.NewEngine()
	res := engine.Calculate(lines, taxMode)

	q.Subtotal = res.Subtotal
	q.DiscountTotal = res.DiscountTotal
	q.TaxableTotal = res.TaxableTotal
	q.CGSTTotal = res.CGSTTotal
	q.SGSTTotal = res.SGSTTotal
	q.IGSTTotal = res.IGSTTotal
	q.GrandTotal = res.GrandTotal

	if err := s.repo.Update(txCtx, q); err != nil {
		return nil, err
	}

	if err := s.txManager.Commit(txCtx); err != nil {
		return nil, err
	}

	return &CalculationResultDTO{
		Subtotal:      res.Subtotal,
		DiscountTotal: res.DiscountTotal,
		TaxableTotal:  res.TaxableTotal,
		CGSTTotal:     res.CGSTTotal,
		SGSTTotal:     res.SGSTTotal,
		IGSTTotal:     res.IGSTTotal,
		GrandTotal:    res.GrandTotal,
		TaxMode:       string(taxMode),
		LineItems:     mapLineItemResults(res.LineItems),
	}, nil
}

func (s *Service) CalculatePreview(ctx context.Context, companyID string, lines []calculation.LineItemInput, customerState *string) (*CalculationResultDTO, error) {
	comp, err := s.companyRepo.GetByID(ctx, companyID)
	if err != nil {
		return nil, err
	}

	taxMode := calculation.TaxModeIntraState
	if customerState != nil && comp.State != nil && *comp.State != *customerState {
		taxMode = calculation.TaxModeInterState
	}

	engine := calculation.NewEngine()
	res := engine.Calculate(lines, taxMode)

	return &CalculationResultDTO{
		Subtotal:      res.Subtotal,
		DiscountTotal: res.DiscountTotal,
		TaxableTotal:  res.TaxableTotal,
		CGSTTotal:     res.CGSTTotal,
		SGSTTotal:     res.SGSTTotal,
		IGSTTotal:     res.IGSTTotal,
		GrandTotal:    res.GrandTotal,
		TaxMode:       string(taxMode),
		LineItems:     mapLineItemResults(res.LineItems),
	}, nil
}

func mapLineItemResults(lines []calculation.LineItemResult) []LineItemResultDTO {
	result := make([]LineItemResultDTO, len(lines))
	for index, line := range lines {
		result[index] = LineItemResultDTO{ID: line.ID, Taxable: line.Taxable, CGST: line.CGST, SGST: line.SGST, IGST: line.IGST, GrandTotal: line.GrandTotal}
	}
	return result
}

func applyV6Totals(q *domain.Quotation, doc *documentv6.Document, company *domain.Company, customer *domain.Customer) {
	taxMode := calculation.TaxModeIntraState
	if customer != nil && company != nil && company.State != nil && customer.State != nil && *company.State != *customer.State {
		taxMode = calculation.TaxModeInterState
	}
	result := calculation.NewEngine().Calculate(domain_quotation.ExtractV6LineItems(doc), taxMode)
	q.Subtotal, q.DiscountTotal, q.TaxableTotal = result.Subtotal, result.DiscountTotal, result.TaxableTotal
	q.CGSTTotal, q.SGSTTotal, q.IGSTTotal, q.GrandTotal = result.CGSTTotal, result.SGSTTotal, result.IGSTTotal, result.GrandTotal
}
