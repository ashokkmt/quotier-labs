//go:build linux

package diagnostics

import (
	"bufio"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"
)

type unixCollector struct{}
type unixProcess struct {
	pid, ppid    int
	cpu          float64
	rss, threads int64
}

func newProcessCollector() collector { return unixCollector{} }
func (unixCollector) Capabilities() Capabilities {
	return Capabilities{ProcessTree: true, CPU: true, RSS: true, Threads: true, OpenFiles: true, IO: true}
}
func (unixCollector) Collect() (ProcessStats, ProcessStats, error) {
	output, err := exec.Command("/bin/ps", "-axo", "pid=,ppid=,%cpu=,rss=,nlwp=").Output()
	if err != nil {
		return ProcessStats{}, ProcessStats{}, err
	}
	processes, err := parsePS(string(output))
	if err != nil {
		return ProcessStats{}, ProcessStats{}, err
	}
	pid := os.Getpid()
	descendants := descendantsOf(processes, pid)
	hostProcess, ok := processes[pid]
	if !ok {
		return ProcessStats{}, ProcessStats{}, fmt.Errorf("host process not found")
	}
	host := toStats(hostProcess, 0)
	tree := host
	for child := range descendants {
		p := processes[child]
		tree.DescendantCount++
		addStats(&tree, p)
	}
	if files, err := countFiles(pid); err == nil {
		host.OpenFiles = &files
	}
	if read, write, err := linuxIO(pid); err == nil {
		host.ReadBytes, host.WriteBytes = &read, &write
	}
	var files, read, write int64
	for child := range descendants {
		if n, err := countFiles(child); err == nil {
			files += n
		}
		if r, w, err := linuxIO(child); err == nil {
			read += r
			write += w
		}
	}
	if host.OpenFiles != nil {
		files += *host.OpenFiles
		tree.OpenFiles = &files
	}
	if host.ReadBytes != nil {
		read += *host.ReadBytes
		tree.ReadBytes = &read
		tree.WriteBytes = &write
	}
	return host, tree, nil
}
func parsePS(raw string) (map[int]unixProcess, error) {
	result := map[int]unixProcess{}
	s := bufio.NewScanner(strings.NewReader(raw))
	for s.Scan() {
		fields := strings.Fields(s.Text())
		if len(fields) < 5 {
			continue
		}
		pid, e1 := strconv.Atoi(fields[0])
		ppid, e2 := strconv.Atoi(fields[1])
		cpu, e3 := strconv.ParseFloat(fields[2], 64)
		rss, e4 := strconv.ParseInt(fields[3], 10, 64)
		threads, e5 := strconv.ParseInt(fields[4], 10, 64)
		if e1 != nil || e2 != nil || e3 != nil || e4 != nil || e5 != nil {
			continue
		}
		result[pid] = unixProcess{pid, ppid, cpu, rss * 1024, threads}
	}
	if err := s.Err(); err != nil {
		return nil, err
	}
	return result, nil
}
func descendantsOf(values map[int]unixProcess, root int) map[int]bool {
	found := map[int]bool{}
	changed := true
	for changed {
		changed = false
		for pid, p := range values {
			if pid != root && !found[pid] && (p.ppid == root || found[p.ppid]) {
				found[pid] = true
				changed = true
			}
		}
	}
	return found
}
func toStats(p unixProcess, descendants int) ProcessStats {
	cpu, rss, threads := p.cpu, p.rss, p.threads
	return ProcessStats{CPUPercent: &cpu, RSSBytes: &rss, Threads: &threads, DescendantCount: descendants}
}
func addStats(target *ProcessStats, p unixProcess) {
	if target.CPUPercent != nil {
		*target.CPUPercent += p.cpu
	}
	if target.RSSBytes != nil {
		*target.RSSBytes += p.rss
	}
	if target.Threads != nil {
		*target.Threads += p.threads
	}
}
func countFiles(pid int) (int64, error) {
	entries, err := os.ReadDir(filepath.Join("/proc", strconv.Itoa(pid), "fd"))
	return int64(len(entries)), err
}
func linuxIO(pid int) (int64, int64, error) {
	raw, err := os.ReadFile(filepath.Join("/proc", strconv.Itoa(pid), "io"))
	if err != nil {
		return 0, 0, err
	}
	var read, write int64
	for _, line := range strings.Split(string(raw), "\n") {
		fields := strings.Fields(line)
		if len(fields) != 2 {
			continue
		}
		n, e := strconv.ParseInt(fields[1], 10, 64)
		if e != nil {
			continue
		}
		switch strings.TrimSuffix(fields[0], ":") {
		case "rchar":
			read = n
		case "wchar":
			write = n
		}
	}
	return read, write, nil
}
