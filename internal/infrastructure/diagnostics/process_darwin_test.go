//go:build darwin

package diagnostics

import "testing"

func TestDarwinCollectorDoesNotAdvertiseUnsupportedProcessMetrics(t *testing.T) {
	capabilities := newProcessCollector().Capabilities()
	if capabilities.ProcessTree || capabilities.CPU || capabilities.RSS || capabilities.Threads || capabilities.OpenFiles || capabilities.IO {
		t.Fatalf("darwin capabilities = %#v; native process metrics must remain unavailable without a safe collector", capabilities)
	}

	host, tree, err := newProcessCollector().Collect()
	if err != nil {
		t.Fatalf("Collect() error = %v", err)
	}
	if host != (ProcessStats{}) || tree != (ProcessStats{}) {
		t.Fatalf("Collect() = %#v, %#v; want empty unavailable metrics", host, tree)
	}
}
