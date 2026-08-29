package quotation

import (
	"context"
	"encoding/json"
	"time"

	"quotierlabs/backend/application/layoutir"
	"quotierlabs/backend/domain"
	"quotierlabs/backend/domain/calculation"
	"quotierlabs/backend/domain/documentmodel"
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

	// 1. Validate Document Structure
	version, err := domain_quotation.DocumentSchemaVersion(q.Document)
	if err != nil {
		return nil, err
	}
	var lines []calculation.LineItemInput
	var v5Doc *documentmodel.Document
	if version == documentmodel.SchemaVersion {
		v5Doc, err = documentmodel.Parse([]byte(q.Document))
		if err != nil {
			return nil, err
		}
		lines = domain_quotation.ExtractV5LineItems(v5Doc)
	} else {
		doc, parseErr := domain_quotation.ParseDocument(q.Document)
		if parseErr != nil {
			return nil, parseErr
		}
		if err := domain_quotation.ValidateDocument(doc); err != nil {
			return nil, err
		}
		lines = domain_quotation.ExtractLineItems(doc)
	}

	// 2. Authoritative Recalculation
	comp, err := s.companyRepo.GetByID(txCtx, companyID)
	if err != nil {
		return nil, err
	}
	cust, err := s.customerRepo.GetByID(txCtx, q.CustomerID, companyID)
	if err != nil {
		return nil, err
	}

	// V5 documents must resolve cleanly before they can become immutable: required overset
	// content, invalid assets, and unresolved required bindings all block finalization.
	if v5Doc != nil {
		if err := s.checkV5Finalization(txCtx, v5Doc, q, comp, cust); err != nil {
			return nil, err
		}
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

// checkV5Finalization runs the authoritative layout resolution and rejects required content that
// would print overset. Optional content may overset; it is a warning surfaced in diagnostics.
func (s *Service) checkV5Finalization(ctx context.Context, doc *documentmodel.Document, q *domain.Quotation, comp *domain.Company, cust *domain.Customer) error {
	layout, err := layoutir.ResolveWithMetrics(ctx, doc, layoutir.ResolveInput{Company: comp, Customer: cust, Quotation: q}, s.layoutMetrics)
	if err != nil {
		return &domain.ValidationError{Field: "document", Message: "quotation has unresolved required bindings or invalid assets and cannot be finalized"}
	}
	nodeOptional := map[string]bool{}
	storyFrames := map[string][]documentmodel.Node{}
	var visit func(nodes []documentmodel.Node)
	visit = func(nodes []documentmodel.Node) {
		for _, n := range nodes {
			nodeOptional[n.ID] = n.Optional
			if n.Role == "flow-frame" && n.StoryID != "" {
				storyFrames[n.StoryID] = append(storyFrames[n.StoryID], n)
			}
			visit(n.Children)
		}
	}
	for _, p := range doc.Root.Pages {
		visit(p.Children)
	}
	for _, m := range doc.Root.Masters {
		visit(m.Children)
	}
	for _, d := range layout.Diagnostics {
		switch d.Code {
		case "overset_text", "intrinsic_overflow":
			if !nodeOptional[d.NodeID] {
				return &domain.ValidationError{Field: "document", Message: "required content does not fit its box and cannot be finalized"}
			}
		case "overset_story", "overset_table":
			for _, frame := range storyFrames[d.NodeID] {
				if !frame.Optional {
					return &domain.ValidationError{Field: "document", Message: "required story content does not fit its flow frames and cannot be finalized"}
				}
			}
		}
	}
	return nil
}
