//go:build windows

package diagnostics

import (
	"runtime"
	"sync"
	"time"
	"unsafe"

	"golang.org/x/sys/windows"
)

// Windows reports audited host-process counters through documented process
// APIs. WebView2 child ownership varies by Windows/WebView2 release, so tree
// aggregation remains deliberately unavailable until a Toolhelp collector is
// separately tested against supported WebView2 versions.
type windowsCollector struct {
	mu          sync.Mutex
	previousCPU time.Duration
	previousAt  time.Time
}

type processMemoryCountersEx struct {
	cb, pageFaultCount                                                                                 uint32
	peakWorkingSetSize, workingSetSize, quotaPeakPagedPoolUsage, quotaPagedPoolUsage                   uintptr
	quotaPeakNonPagedPoolUsage, quotaNonPagedPoolUsage, pagefileUsage, peakPagefileUsage, privateUsage uintptr
}

var (
	psapi                 = windows.NewLazySystemDLL("psapi.dll")
	getProcessMemoryInfo  = psapi.NewProc("GetProcessMemoryInfo")
	kernel32              = windows.NewLazySystemDLL("kernel32.dll")
	getProcessHandleCount = kernel32.NewProc("GetProcessHandleCount")
)

func newProcessCollector() collector { return &windowsCollector{} }
func (*windowsCollector) Capabilities() Capabilities {
	return Capabilities{CPU: true, RSS: true, OpenFiles: true}
}
func (c *windowsCollector) Collect() (ProcessStats, ProcessStats, error) {
	process := windows.CurrentProcess()
	now := time.Now()
	var creation, exit, kernel, user windows.Filetime
	if err := windows.GetProcessTimes(process, &creation, &exit, &kernel, &user); err != nil {
		return ProcessStats{}, ProcessStats{}, err
	}
	cpuDuration := time.Duration(kernel.Nanoseconds() + user.Nanoseconds())
	var memory processMemoryCountersEx
	memory.cb = uint32(unsafe.Sizeof(memory))
	if result, _, callErr := getProcessMemoryInfo.Call(uintptr(process), uintptr(unsafe.Pointer(&memory)), uintptr(memory.cb)); result == 0 {
		return ProcessStats{}, ProcessStats{}, callErr
	}
	var handles uint32
	if result, _, callErr := getProcessHandleCount.Call(uintptr(process), uintptr(unsafe.Pointer(&handles))); result == 0 {
		return ProcessStats{}, ProcessStats{}, callErr
	}
	c.mu.Lock()
	cpu := 0.0
	if !c.previousAt.IsZero() {
		elapsed := now.Sub(c.previousAt)
		if elapsed > 0 {
			cpu = 100 * float64(cpuDuration-c.previousCPU) / float64(elapsed) / float64(runtime.NumCPU())
		}
	}
	c.previousCPU, c.previousAt = cpuDuration, now
	c.mu.Unlock()
	rss, handleCount := int64(memory.workingSetSize), int64(handles)
	host := ProcessStats{CPUPercent: &cpu, RSSBytes: &rss, OpenFiles: &handleCount}
	return host, host, nil
}
