package wails

import (
	"context"
	"encoding/base64"

	"quotierlabs/backend/application/document"
	"quotierlabs/backend/application/documentfonts"
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

type DocumentFontDTO struct {
	Family string `json:"family"`
	Weight int    `json:"weight"`
	Style  string `json:"style"`
	Data   string `json:"data"`
}

// GetDocumentFonts gives the WebView the exact immutable TTF resources embedded into PDFs. It is
// intentionally independent of the host OS font registry, current directory, and app theme.
func (h *DocumentHandler) GetDocumentFonts() []DocumentFontDTO {
	assets := documentfonts.Assets()
	result := make([]DocumentFontDTO, 0, len(assets))
	for _, asset := range assets {
		style := "normal"
		if asset.Italic {
			style = "italic"
		}
		result = append(result, DocumentFontDTO{
			Family: asset.CSSFamily,
			Weight: asset.Weight,
			Style:  style,
			Data:   base64.StdEncoding.EncodeToString(asset.TTF),
		})
	}
	return result
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
