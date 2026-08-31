package wails

import (
	"context"
	"encoding/base64"

	"quotierlabs/backend/application/document"
)

type DocumentHandler struct {
	docService *document.Service
	ctx        context.Context
}

func NewDocumentHandler(docService *document.Service) *DocumentHandler {
	return &DocumentHandler{
		docService: docService,
	}
}

func (h *DocumentHandler) Startup(ctx context.Context) {
	h.ctx = ctx
}

// GetQuotationPreviewPDF generates the PDF and returns it as a base64 encoded string
// to be easily displayed in an <object> tag using data URI.
func (h *DocumentHandler) GetQuotationPreviewPDF(companyID, quotationID string) (string, error) {
	bytes, err := h.docService.GeneratePreviewPDF(h.ctx, companyID, quotationID)
	if err != nil {
		return "", err
	}

	// Convert to base64 for easy transport to JS
	return base64.StdEncoding.EncodeToString(bytes), nil
}

func (h *DocumentHandler) GeneratePDF(companyID, quotationID string) (string, error) {
	return h.docService.GenerateFinalPDF(h.ctx, companyID, quotationID)
}

func (h *DocumentHandler) GetQuotationLayoutDiagnostics(companyID, quotationID string) (interface{}, error) {
	return h.docService.ResolveQuotationLayoutDiagnostics(h.ctx, companyID, quotationID)
}

// GetDocumentLayoutDiagnostics resolves layout diagnostics for an unsaved in-editor document.
// It performs the same ownership and validation checks as persistence and returns only typed,
// user-safe diagnostic values.
func (h *DocumentHandler) GetDocumentLayoutDiagnostics(companyID, quotationID, document string) (interface{}, error) {
	return h.docService.ResolveDocumentLayoutDiagnostics(h.ctx, companyID, quotationID, document)
}
