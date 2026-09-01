package diagnostics

import (
	"context"
	"testing"
	"time"
)

type fakeRecorder struct{ calls int }

func (f *fakeRecorder) RecordOperation(context.Context, string, time.Duration, string, map[string]int64) {
	f.calls++
}
func (f *fakeRecorder) RecordFrontend(context.Context, string, time.Duration, map[string]int64) {
	f.calls++
}

func TestTimedOperationRecordsOnce(t *testing.T) {
	f := &fakeRecorder{}
	TimedOperation(f, context.Background(), "quotation.save", nil)("success")
	if f.calls != 1 {
		t.Fatalf("calls = %d, want 1", f.calls)
	}
}
