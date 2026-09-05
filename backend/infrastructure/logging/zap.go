package logging

import (
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"sync"

	"go.uber.org/zap"
	"go.uber.org/zap/zapcore"
	"quotierlabs/backend/infrastructure/appidentity"
	"quotierlabs/backend/infrastructure/apppaths"
)

const (
	maxLogBytes = 10 << 20
	maxLogFiles = 5
)

// Sink is the bounded, private, self-rotating log file writer backing the
// production logger. It implements io.Writer and zapcore.WriteSyncer; Close
// releases the file handle and must be called once at application shutdown.
type Sink struct {
	mu   sync.Mutex
	path string
	file *os.File
	size int64
}

var errSinkClosed = errors.New("log sink is closed")

// openPrivateLogFile opens (or reopens) a log file enforcing private access:
// POSIX mode 0600 at creation, plus an explicit owner-only ACL on Windows,
// where mode bits are not honored. Pre-existing files are tightened too, so
// files created by older versions with looser modes are restricted on open.
func openPrivateLogFile(path string, flags int) (*os.File, error) {
	f, err := os.OpenFile(path, flags, 0600)
	if err != nil {
		return nil, err
	}
	if err := f.Chmod(0600); err != nil {
		_ = f.Close()
		return nil, err
	}
	if err := protectPrivateFile(path); err != nil {
		_ = f.Close()
		return nil, err
	}
	return f, nil
}

func openSink(path string) (*Sink, error) {
	if err := os.MkdirAll(filepath.Dir(path), 0700); err != nil {
		return nil, err
	}
	f, err := openPrivateLogFile(path, os.O_CREATE|os.O_APPEND|os.O_WRONLY)
	if err != nil {
		return nil, err
	}
	info, err := f.Stat()
	if err != nil {
		_ = f.Close()
		return nil, err
	}
	return &Sink{path: path, file: f, size: info.Size()}, nil
}

func (s *Sink) Write(p []byte) (int, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.file == nil {
		return 0, errSinkClosed
	}
	if s.size+int64(len(p)) > maxLogBytes {
		if err := s.rotate(); err != nil {
			return 0, err
		}
	}
	n, err := s.file.Write(p)
	s.size += int64(n)
	return n, err
}

func (s *Sink) Sync() error {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.file == nil {
		return nil
	}
	return s.file.Sync()
}

// Close releases the log file handle. It is safe to call more than once and
// after Close, Sync keeps succeeding (a no-op) so deferred shutdown paths do
// not report spurious errors.
func (s *Sink) Close() error {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.file == nil {
		return nil
	}
	err := s.file.Close()
	s.file = nil
	return err
}

func (s *Sink) rotate() error {
	if err := s.file.Close(); err != nil {
		return err
	}
	_ = os.Remove(fmt.Sprintf("%s.%d", s.path, maxLogFiles))
	for i := maxLogFiles - 1; i >= 1; i-- {
		_ = os.Rename(fmt.Sprintf("%s.%d", s.path, i), fmt.Sprintf("%s.%d", s.path, i+1))
	}
	_ = os.Rename(s.path, s.path+".1")
	f, err := openPrivateLogFile(s.path, os.O_CREATE|os.O_TRUNC|os.O_WRONLY)
	if err != nil {
		s.file = nil
		return err
	}
	s.file, s.size = f, 0
	return nil
}

// NewSink opens the bounded, private, rotating log file at the resolved log
// root. The returned Sink owns the log file handle; call Close on it once at
// application shutdown after the final Sync.
func NewSink(paths apppaths.Paths) (*Sink, error) {
	return openSink(paths.LogPath())
}

// NewLogger writes bounded production JSON logs to the given sink.
// Development builds additionally emit readable DEBUG output to the terminal.
func NewLogger(sink *Sink, build appidentity.BuildInfo) (*zap.Logger, error) {
	encoderConfig := zapcore.EncoderConfig{
		TimeKey: "timestamp", LevelKey: "level", NameKey: "logger", CallerKey: "caller",
		MessageKey: "msg", StacktraceKey: "stacktrace", LineEnding: zapcore.DefaultLineEnding,
		EncodeLevel: zapcore.LowercaseLevelEncoder, EncodeTime: zapcore.ISO8601TimeEncoder,
		EncodeDuration: zapcore.StringDurationEncoder, EncodeCaller: zapcore.ShortCallerEncoder,
	}
	cores := []zapcore.Core{
		zapcore.NewCore(zapcore.NewJSONEncoder(encoderConfig), zapcore.AddSync(sink), zap.InfoLevel),
	}
	if build.Channel == "development" {
		cores = append(cores, zapcore.NewCore(zapcore.NewConsoleEncoder(encoderConfig), zapcore.AddSync(os.Stdout), zap.DebugLevel))
	}
	return zap.New(zapcore.NewTee(cores...), zap.AddCaller()).With(
		zap.String("version", build.Version), zap.String("channel", build.Channel),
		zap.String("os", build.OS), zap.String("arch", build.Arch),
	), nil
}
