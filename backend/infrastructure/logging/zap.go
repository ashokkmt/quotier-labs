package logging

import (
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

type rotatingSink struct {
	mu   sync.Mutex
	path string
	file *os.File
	size int64
}

func openRotatingSink(path string) (*rotatingSink, error) {
	if err := os.MkdirAll(filepath.Dir(path), 0700); err != nil {
		return nil, err
	}
	f, err := os.OpenFile(path, os.O_CREATE|os.O_APPEND|os.O_WRONLY, 0600)
	if err != nil {
		return nil, err
	}
	info, err := f.Stat()
	if err != nil {
		_ = f.Close()
		return nil, err
	}
	return &rotatingSink{path: path, file: f, size: info.Size()}, nil
}

func (s *rotatingSink) Write(p []byte) (int, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.size+int64(len(p)) > maxLogBytes {
		if err := s.rotate(); err != nil {
			return 0, err
		}
	}
	n, err := s.file.Write(p)
	s.size += int64(n)
	return n, err
}

func (s *rotatingSink) Sync() error {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.file.Sync()
}

func (s *rotatingSink) rotate() error {
	if err := s.file.Close(); err != nil {
		return err
	}
	_ = os.Remove(fmt.Sprintf("%s.%d", s.path, maxLogFiles))
	for i := maxLogFiles - 1; i >= 1; i-- {
		_ = os.Rename(fmt.Sprintf("%s.%d", s.path, i), fmt.Sprintf("%s.%d", s.path, i+1))
	}
	_ = os.Rename(s.path, s.path+".1")
	f, err := os.OpenFile(s.path, os.O_CREATE|os.O_TRUNC|os.O_WRONLY, 0600)
	if err != nil {
		return err
	}
	s.file, s.size = f, 0
	return nil
}

// NewLogger writes bounded production JSON logs to the resolved log root.
// Development builds additionally emit readable DEBUG output to the terminal.
func NewLogger(paths apppaths.Paths, build appidentity.BuildInfo) (*zap.Logger, error) {
	encoderConfig := zapcore.EncoderConfig{
		TimeKey: "timestamp", LevelKey: "level", NameKey: "logger", CallerKey: "caller",
		MessageKey: "msg", StacktraceKey: "stacktrace", LineEnding: zapcore.DefaultLineEnding,
		EncodeLevel: zapcore.LowercaseLevelEncoder, EncodeTime: zapcore.ISO8601TimeEncoder,
		EncodeDuration: zapcore.StringDurationEncoder, EncodeCaller: zapcore.ShortCallerEncoder,
	}
	sink, err := openRotatingSink(paths.LogPath())
	if err != nil {
		return nil, err
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
