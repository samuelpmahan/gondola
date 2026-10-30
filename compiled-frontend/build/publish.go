package build

import (
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"sync"
)

var publishMu sync.Mutex

// Publish builds into a sibling staging directory and atomically replaces
// outputDir only after produce succeeds. It reports true when a failed attempt
// left an existing output directory available at its original path.
func Publish(outputDir string, produce func(stageDir string) error) (preservedPreviousOutput bool, err error) {
	if produce == nil {
		return false, errors.New("build producer is required")
	}
	if outputDir == "" {
		return false, errors.New("output directory is required")
	}
	out, err := filepath.Abs(outputDir)
	if err != nil {
		return false, fmt.Errorf("resolve output directory: %w", err)
	}
	out = filepath.Clean(out)
	if out == filepath.Dir(out) {
		return false, errors.New("refusing to publish over a filesystem root")
	}

	publishMu.Lock()
	defer publishMu.Unlock()

	parent := filepath.Dir(out)
	if err := os.MkdirAll(parent, 0o755); err != nil {
		return false, fmt.Errorf("create output parent: %w", err)
	}
	_, priorExists, err := inspectOutput(out)
	if err != nil {
		return false, err
	}

	stage, err := os.MkdirTemp(parent, ".gobi-stage-*")
	if err != nil {
		return priorExists, fmt.Errorf("create output staging directory: %w", err)
	}
	defer os.RemoveAll(stage)
	if err := produce(stage); err != nil {
		return priorExists, err
	}

	if !priorExists {
		if err := os.Rename(stage, out); err != nil {
			return false, fmt.Errorf("publish staged output: %w", err)
		}
		return false, nil
	}

	backup, err := os.MkdirTemp(parent, ".gobi-backup-*")
	if err != nil {
		return true, fmt.Errorf("create output backup path: %w", err)
	}
	if err := os.Remove(backup); err != nil {
		return true, fmt.Errorf("prepare output backup path: %w", err)
	}
	if err := os.Rename(out, backup); err != nil {
		return true, fmt.Errorf("move previous output aside: %w", err)
	}
	if err := os.Rename(stage, out); err != nil {
		restoreErr := os.Rename(backup, out)
		if restoreErr != nil {
			return false, fmt.Errorf("publish staged output: %v; restore previous output: %w", err, restoreErr)
		}
		return true, fmt.Errorf("publish staged output: %w", err)
	}
	if err := os.RemoveAll(backup); err != nil {
		return false, fmt.Errorf("remove replaced output backup: %w", err)
	}
	return false, nil
}

func inspectOutput(path string) (os.FileInfo, bool, error) {
	info, err := os.Lstat(path)
	if errors.Is(err, os.ErrNotExist) {
		return nil, false, nil
	}
	if err != nil {
		return nil, false, fmt.Errorf("inspect previous output: %w", err)
	}
	if !info.IsDir() || info.Mode()&os.ModeSymlink != 0 {
		return info, true, fmt.Errorf("existing output path %q is not a directory", path)
	}
	return info, true, nil
}
