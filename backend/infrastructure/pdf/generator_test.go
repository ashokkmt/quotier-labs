package pdf_test

import (
	"context"
	"testing"
	"time"

	"quotierlabs/backend/application/document"
	"quotierlabs/backend/domain"
	"quotierlabs/backend/infrastructure/pdf"
)

func TestPDFGeneratorGeneratesV5DocumentThroughLayoutIR(t *testing.T) {
	generator := pdf.NewGenerator()
	q := &domain.Quotation{
		ID:            "q-v5",
		AuditMetadata: domain.AuditMetadata{CreatedAt: time.Now()},
		Document:      `{"schema_version":5,"root":{"pages":[{"id":"page-1","width":59528,"height":84189,"margin":{"top":0,"right":0,"bottom":0,"left":0},"child_ids":["title"],"children":[{"id":"title","kind":"text","role":"element","geometry":{"x":7200,"y":7200,"width":14400,"height":3600,"rotation":0},"layout_mode":"fixed","visibility":"shown","props":{"text":"V5 PDF"}}]}]},"settings":{"page_size":"A4","orientation":"portrait"}}`,
	}
	bytes, err := generator.Generate(context.Background(), document.GeneratorInput{Quotation: q})
	if err != nil {
		t.Fatalf("Generate V5 failed: %v", err)
	}
	if len(bytes) < 5 || string(bytes[:5]) != "%PDF-" {
		t.Fatalf("output does not appear to be a PDF")
	}
}
