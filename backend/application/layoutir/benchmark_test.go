package layoutir

import (
	"context"
	"testing"

	"quotierlabs/backend/domain/documentmodel"
)

// Report-only baseline for the V5 resolver. Fixture budgets are intentionally
// deferred until clean-machine measurements establish a stable baseline.
func BenchmarkResolveBlankA4(b *testing.B) {
	doc := documentmodel.NewBlank("benchmark-page")
	b.ReportAllocs()
	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		if _, err := ResolveWithMetrics(context.Background(), doc, ResolveInput{}, DefaultMetrics{}); err != nil {
			b.Fatal(err)
		}
	}
}
