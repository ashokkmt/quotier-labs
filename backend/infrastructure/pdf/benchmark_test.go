package pdf_test

import (
	"context"
	"testing"
	"time"

	"quotierlabs/backend/application/document"
	"quotierlabs/backend/domain"
	"quotierlabs/backend/infrastructure/pdf"
)

func BenchmarkGenerateSimpleV5PDF(b *testing.B) {
	generator := pdf.NewGenerator()
	input := document.GeneratorInput{Quotation: &domain.Quotation{ID: "bench", AuditMetadata: domain.AuditMetadata{CreatedAt: time.Unix(0, 0)}, Document: `{"schema_version":5,"root":{"pages":[{"id":"page","width":59528,"height":84189,"margin":{"top":0,"right":0,"bottom":0,"left":0},"child_ids":["text"],"children":[{"id":"text","kind":"text","role":"element","geometry":{"x":1000,"y":1000,"width":16000,"height":3600,"rotation":0},"layout_mode":"fixed","visibility":"shown","props":{"text":"Benchmark"}}]}]},"settings":{"page_size":"A4","orientation":"portrait"}}`}}
	b.ReportAllocs()
	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		if _, err := generator.Generate(context.Background(), input); err != nil {
			b.Fatal(err)
		}
	}
}
