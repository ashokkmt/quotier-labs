// Package diagnostics defines the small application-facing boundary used to
// correlate expensive work with a local diagnostic recording. It deliberately
// contains no process inspection, file I/O, or Wails dependency.
package diagnostics

import (
	"context"
	"time"
)

// Recorder receives low-cardinality, non-sensitive operation and frontend
// summaries. Callers must only use reviewed names and numeric dimensions.
type Recorder interface {
	RecordOperation(context.Context, string, time.Duration, string, map[string]int64)
	RecordFrontend(context.Context, string, time.Duration, map[string]int64)
}

// NopRecorder is safe for tests and for code paths where diagnostics are not
// configured. It intentionally allocates nothing and performs no I/O.
type NopRecorder struct{}

func (NopRecorder) RecordOperation(context.Context, string, time.Duration, string, map[string]int64) {
}
func (NopRecorder) RecordFrontend(context.Context, string, time.Duration, map[string]int64) {}

// TimedOperation returns a closure for the common deferred instrumentation
// pattern. Error details are not recorded; callers provide only a result class.
func TimedOperation(r Recorder, ctx context.Context, name string, dimensions map[string]int64) func(string) {
	if r == nil {
		return func(string) {}
	}
	started := time.Now()
	return func(result string) { r.RecordOperation(ctx, name, time.Since(started), result, dimensions) }
}
