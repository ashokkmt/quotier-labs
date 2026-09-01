//go:build darwin

package diagnostics

// darwinCollector intentionally does not spawn a helper process.  A previous
// implementation executed /bin/ps once per sample. In the embedded
// Go/WebKit host that puts fork/exec on a path shared with JavaScriptCore's
// process-wide signal handling, which is not an acceptable trade-off for a
// diagnostic feature. Go-runtime and frontend metrics remain available; the
// unavailable native process counters are declared in the session manifest.
//
// A future native Mach implementation may add these counters without using
// fork/exec. It must preserve this no-child-process invariant.
type darwinCollector struct{}

func newProcessCollector() collector { return darwinCollector{} }

func (darwinCollector) Capabilities() Capabilities { return Capabilities{} }

func (darwinCollector) Collect() (ProcessStats, ProcessStats, error) {
	return ProcessStats{}, ProcessStats{}, nil
}
