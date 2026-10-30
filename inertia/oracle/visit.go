package oracle

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"time"

	"github.com/samuelpmahan/gondola/inertia"
	"github.com/samuelpmahan/gondola/wire"
)

// recording wraps the handler under test and writes down every request Inertia's client sends: the ones that carry the
// X-Inertia header. The first page load (and a full page reload) is the browser's own, not the client's, so it is not one.
type recording struct {
	handler  http.Handler
	mu       sync.Mutex
	requests []Sent
}

func (rec *recording) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	if r.Header.Get("X-Inertia") == "true" {
		sent := Sent{Method: r.Method, URL: r.URL.RequestURI(), Headers: map[string]string{}}
		for name, values := range r.Header {
			if strings.HasPrefix(name, "X-Inertia") {
				sent.Headers[name] = strings.Join(values, ",")
			}
		}
		rec.mu.Lock()
		rec.requests = append(rec.requests, sent)
		rec.mu.Unlock()
	}
	rec.handler.ServeHTTP(w, r)
}

// visit serves handler over real HTTP, starts Inertia's client in jsdom on path and runs the steps (inertia-client.mjs).
func visit(app *inertia.App, handler http.Handler, path string, steps []Step) (Result, error) {
	if err := ready(); err != nil {
		return Result{}, err
	}
	rec := &recording{handler: handler}
	server := httptest.NewServer(rec)
	defer server.Close()
	side := httptest.NewServer(layersHandler(app))
	defer side.Close()
	if steps == nil {
		steps = []Step{}
	}
	job, err := json.Marshal(map[string]any{"base": server.URL, "path": path, "layers": side.URL, "steps": steps})
	if err != nil {
		return Result{}, err
	}
	ctx, cancel := context.WithTimeout(context.Background(), 90*time.Second)
	defer cancel()
	command := nodeCommand(ctx, "inertia-client.mjs")
	command.Stdin = bytes.NewReader(job)
	var stdout, stderr bytes.Buffer
	command.Stdout, command.Stderr = &stdout, &stderr
	if err := command.Run(); err != nil {
		return Result{}, fmt.Errorf("oracle: Inertia's client did not run: %v: %s", err, strings.TrimSpace(stderr.String()))
	}
	decoded, err := wire.DecodeValue(lastLine(stdout.Bytes()))
	answer, _ := decoded.(map[string]any)
	if err != nil || answer == nil {
		return Result{}, fmt.Errorf("oracle: unreadable answer from Inertia's client: %v: %s", err, strings.TrimSpace(stdout.String()))
	}
	result := Result{}
	if reloads, ok := answer["fullReloads"].(float64); ok {
		result.FullReloads = int(reloads)
	}
	for _, message := range answer["errors"].([]any) {
		result.Errors = append(result.Errors, message.(string))
	}
	if page, ok := answer["page"].(map[string]any); ok {
		result.Page.Component, _ = page["component"].(string)
		result.Page.Props, _ = page["props"].(map[string]any)
		result.Page.URL, _ = page["url"].(string)
		result.Page.Version, _ = page["version"].(string)
	}
	rec.mu.Lock()
	result.Requests = append(result.Requests, rec.requests...)
	rec.mu.Unlock()
	return result, nil
}

func lastLine(data []byte) []byte {
	data = bytes.TrimRight(data, "\n")
	if i := bytes.LastIndexByte(data, '\n'); i >= 0 {
		return data[i+1:]
	}
	return data
}
