package oracle

import (
	"bytes"
	"context"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"sync"

	"github.com/samuelpmahan/gondola/reactmap"
)

// root is the repository root, found from the place of this source file, so that checks work from any directory.
func root() string {
	_, file, _, _ := runtime.Caller(0)
	return filepath.Clean(filepath.Join(filepath.Dir(file), "..", ".."))
}

var prepare struct {
	once sync.Once
	err  error
}

// ready makes sure the Node side can run: the packages are installed and the React mapping generated from the Go tables
// is on disk (it is generated, never committed).
func ready() error {
	prepare.once.Do(func() {
		if _, err := os.Stat(filepath.Join(root(), "node_modules", "@inertiajs", "react")); err != nil {
			prepare.err = fmt.Errorf("oracle: the Node packages are not installed; run `npm ci` in %s", root())
			return
		}
		// Reading the scripts puts them in the key of go test's result cache, which cannot see what a child process reads.
		for _, script := range []string{"inertia-ssr.mjs", "inertia-client.mjs", "inertia-pages.mjs", "react-nodes.mjs", "package-lock.json"} {
			if _, err := os.ReadFile(filepath.Join(root(), script)); err != nil {
				prepare.err = err
				return
			}
		}
		want := []byte(reactmap.Generate())
		path := filepath.Join(root(), "react-map.gen.mjs")
		if have, err := os.ReadFile(path); err != nil || !bytes.Equal(have, want) {
			if err := os.WriteFile(path, want, 0o644); err != nil {
				prepare.err = err
			}
		}
	})
	return prepare.err
}

// nodeCommand is `node script args...` run in the repository root, stopped when ctx ends.
func nodeCommand(ctx context.Context, script string, args ...string) *exec.Cmd {
	command := exec.CommandContext(ctx, "node", append([]string{script}, args...)...)
	command.Dir = root()
	return command
}

// Versions are the versions of the golden reference, as installed.
func Versions() (map[string]string, error) {
	if err := ready(); err != nil {
		return nil, err
	}
	var stderr bytes.Buffer
	command := nodeCommand(context.Background(), "inertia-ssr.mjs", "--versions")
	command.Stderr = &stderr
	out, err := command.Output()
	if err != nil {
		return nil, fmt.Errorf("oracle: node inertia-ssr.mjs --versions: %v: %s", err, strings.TrimSpace(stderr.String()))
	}
	return parseFlatObject(string(out)), nil
}

// parseFlatObject reads {"a":"b","c":"d"}, the only JSON this file reads that way.
func parseFlatObject(text string) map[string]string {
	out := map[string]string{}
	text = strings.TrimSpace(text)
	text = strings.TrimSuffix(strings.TrimPrefix(text, "{"), "}")
	for _, pair := range strings.Split(text, ",") {
		kv := strings.SplitN(pair, ":", 2)
		if len(kv) == 2 {
			out[strings.Trim(kv[0], `"`)] = strings.Trim(kv[1], `"`)
		}
	}
	return out
}
