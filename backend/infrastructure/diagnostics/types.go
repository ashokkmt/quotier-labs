package diagnostics

import "time"

const schemaVersion = 1

// Capabilities prevents an unavailable OS counter being misread as zero.
type Capabilities struct {
	ProcessTree bool `json:"process_tree"`
	CPU         bool `json:"cpu"`
	RSS         bool `json:"rss"`
	Threads     bool `json:"threads"`
	OpenFiles   bool `json:"open_files"`
	IO          bool `json:"io"`
}

type ProcessStats struct {
	CPUPercent      *float64 `json:"cpu_percent,omitempty"`
	RSSBytes        *int64   `json:"rss_bytes,omitempty"`
	Threads         *int64   `json:"threads,omitempty"`
	OpenFiles       *int64   `json:"open_files,omitempty"`
	ReadBytes       *int64   `json:"read_bytes,omitempty"`
	WriteBytes      *int64   `json:"write_bytes,omitempty"`
	DescendantCount int      `json:"descendant_count"`
}

type ResourceSample struct {
	SchemaVersion   int          `json:"schema_version"`
	Type            string       `json:"type"`
	ElapsedMS       int64        `json:"elapsed_ms"`
	RecordedAtUTC   time.Time    `json:"recorded_at_utc"`
	LogicalCPUs     int          `json:"logical_cpus"`
	Host            ProcessStats `json:"host"`
	Tree            ProcessStats `json:"tree"`
	GoLiveHeapBytes uint64       `json:"go_live_heap_bytes"`
	GoHeapGoalBytes uint64       `json:"go_heap_goal_bytes"`
	GoAllocBytes    uint64       `json:"go_alloc_bytes"`
	GoAllocRateBPS  float64      `json:"go_alloc_rate_bps"`
	GCCycles        uint32       `json:"gc_cycles"`
	GCPauseTotalNS  uint64       `json:"gc_pause_total_ns"`
	Goroutines      int          `json:"goroutines"`
}

type OperationEvent struct {
	SchemaVersion int              `json:"schema_version"`
	Type          string           `json:"type"`
	ElapsedMS     int64            `json:"elapsed_ms"`
	RecordedAtUTC time.Time        `json:"recorded_at_utc"`
	Name          string           `json:"name"`
	DurationMS    float64          `json:"duration_ms"`
	Result        string           `json:"result"`
	Dimensions    map[string]int64 `json:"dimensions,omitempty"`
}

type FrontendEvent struct {
	SchemaVersion int              `json:"schema_version"`
	Type          string           `json:"type"`
	ElapsedMS     int64            `json:"elapsed_ms"`
	RecordedAtUTC time.Time        `json:"recorded_at_utc"`
	Name          string           `json:"name"`
	DurationMS    float64          `json:"duration_ms"`
	Dimensions    map[string]int64 `json:"dimensions,omitempty"`
}

type Manifest struct {
	SchemaVersion int          `json:"schema_version"`
	SessionID     string       `json:"session_id"`
	Scenario      string       `json:"scenario"`
	Channel       string       `json:"channel"`
	Version       string       `json:"version"`
	OS            string       `json:"os"`
	Arch          string       `json:"arch"`
	StartedAtUTC  time.Time    `json:"started_at_utc"`
	EndedAtUTC    *time.Time   `json:"ended_at_utc,omitempty"`
	Interrupted   bool         `json:"interrupted,omitempty"`
	IntervalMS    int64        `json:"interval_ms"`
	Capabilities  Capabilities `json:"capabilities"`
}

type Summary struct {
	SchemaVersion    int       `json:"schema_version"`
	SessionID        string    `json:"session_id"`
	StartedAtUTC     time.Time `json:"started_at_utc"`
	EndedAtUTC       time.Time `json:"ended_at_utc"`
	DurationMS       int64     `json:"duration_ms"`
	SampleCount      int       `json:"sample_count"`
	OperationCount   int       `json:"operation_count"`
	FrontendCount    int       `json:"frontend_count"`
	PeakTreeRSSBytes *int64    `json:"peak_tree_rss_bytes,omitempty"`
	PeakTreeCPU      *float64  `json:"peak_tree_cpu_percent,omitempty"`
	PeakGoHeapBytes  uint64    `json:"peak_go_heap_bytes"`
	PeakGoroutines   int       `json:"peak_goroutines"`
}

// SupportOptions contains explicit, non-sensitive capability state selected at
// export time. It deliberately excludes document, customer, and filesystem data.
type SupportOptions struct {
	V6EditorEnabled bool `json:"v6_editor_enabled"`
}

type TimingSummary struct {
	Operation       string  `json:"operation"`
	ResultCode      string  `json:"result_code"`
	Count           int     `json:"count"`
	TotalDurationMS float64 `json:"total_duration_ms"`
}

// SupportBundle is a compact, PII-safe index included in every user-exported
// diagnostic recording. The detailed recording remains local unless the user
// chooses to share the archive.
type SupportBundle struct {
	SchemaVersion int             `json:"schema_version"`
	Version       string          `json:"version"`
	Channel       string          `json:"channel"`
	OS            string          `json:"os"`
	Arch          string          `json:"arch"`
	Capabilities  Capabilities    `json:"capabilities"`
	FeatureFlags  SupportOptions  `json:"feature_flags"`
	ErrorCodes    []string        `json:"error_codes"`
	Timings       []TimingSummary `json:"timings"`
}

type Status struct {
	Available       bool            `json:"available"`
	Recording       bool            `json:"recording"`
	Finalizing      bool            `json:"finalizing"`
	Channel         string          `json:"channel"`
	SessionID       string          `json:"session_id,omitempty"`
	ElapsedMS       int64           `json:"elapsed_ms"`
	Latest          *ResourceSample `json:"latest,omitempty"`
	LastOperation   string          `json:"last_operation,omitempty"`
	LastSessionID   string          `json:"last_session_id,omitempty"`
	DiagnosticsRoot string          `json:"diagnostics_root,omitempty"`
}
