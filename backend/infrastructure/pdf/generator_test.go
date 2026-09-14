package pdf_test

import (
	"context"
	"testing"

	"quotierlabs/backend/application/document"
	"quotierlabs/backend/domain"
	"quotierlabs/backend/infrastructure/pdf"
)

func TestPDFGeneratorRejectsRetiredDocument(t *testing.T) {
	generator := pdf.NewGenerator()
	q := &domain.Quotation{
		ID:       "q-retired",
		Document: `{"schema_version":5}`,
	}
	if _, err := generator.Generate(context.Background(), document.GeneratorInput{Quotation: q}); err == nil {
		t.Fatal("retired document was rendered")
	}
}
