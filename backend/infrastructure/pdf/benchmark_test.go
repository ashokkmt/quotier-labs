package pdf_test

import (
	"context"
	"encoding/json"
	"testing"
	"time"

	"quotierlabs/backend/application/document"
	"quotierlabs/backend/domain"
	"quotierlabs/backend/domain/documentv6"
	"quotierlabs/backend/infrastructure/pdf"
)

func BenchmarkGenerateSimpleDocumentPDF(b *testing.B) {
	generator := pdf.NewGenerator()
	raw, err := json.Marshal(documentv6.NewBlank("benchmark-paragraph"))
	if err != nil {
		b.Fatal(err)
	}
	input := document.GeneratorInput{Quotation: &domain.Quotation{ID: "bench", AuditMetadata: domain.AuditMetadata{CreatedAt: time.Unix(0, 0)}, Document: string(raw)}}
	b.ReportAllocs()
	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		if _, err := generator.Generate(context.Background(), input); err != nil {
			b.Fatal(err)
		}
	}
}
