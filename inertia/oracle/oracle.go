// Package oracle grades the Go Inertia server against Inertia itself (@inertiajs/react and @inertiajs/core 3.9.1 with
// React 19.3.1), which is the golden reference. Inertia is a black box: its documentation, its type declarations and
// what it does are fair game; its implementation source is not read.
//
// This file is the Milestone 1 contract for the checks. The maker owns everything behind it.
package oracle

import (
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"

	"github.com/samuelpmahan/gondola/inertia"
	"github.com/samuelpmahan/gondola/wire"
)

// SameFirstPaint makes a first visit (no X-Inertia header) to path on handler, takes the page object out of the
// answer, asks Inertia's own server-side rendering to render that page object with the same components, and returns
// an error naming the first byte that differs between the two bodies, or nil when they are byte identical.
func SameFirstPaint(app *inertia.App, handler http.Handler, path string) error {
	got, want, err := firstPaint(app, handler, path)
	if err != nil {
		return err
	}
	if got == want {
		return nil
	}
	at := firstDifference(got, want)
	return fmt.Errorf("oracle: first visit to %s: Go's body differs from Inertia's at byte %d\n  Go wrote:      %s\n  Inertia wrote: %s",
		path, at, around(got, at), around(want, at))
}

// FirstPaint makes a first visit to path and returns the body Go wrote and the body Inertia's own server-side rendering
// writes for the same page object.
func FirstPaint(app *inertia.App, handler http.Handler, path string) (goBody, inertiaBody string, err error) {
	return firstPaint(app, handler, path)
}

// InertiaBody makes a first visit to path and returns the body Inertia's own server-side rendering writes for the page
// object Go answered with. The rules table records these bodies.
func InertiaBody(app *inertia.App, handler http.Handler, path string) (string, error) {
	_, want, err := firstPaint(app, handler, path)
	return want, err
}

// firstPaint returns the body Go wrote and the body Inertia writes for the same page object.
func firstPaint(app *inertia.App, handler http.Handler, path string) (got, want string, err error) {
	if err := ready(); err != nil {
		return "", "", err
	}
	recorder := httptest.NewRecorder()
	handler.ServeHTTP(recorder, httptest.NewRequest(http.MethodGet, path, nil))
	if recorder.Code != http.StatusOK {
		return "", "", fmt.Errorf("oracle: first visit to %s answered %d, want 200: %s", path, recorder.Code, strings.TrimSpace(recorder.Body.String()))
	}
	pageJSON, got, err := firstPaintBody(recorder.Body.String())
	if err != nil {
		return "", "", fmt.Errorf("oracle: first visit to %s: %w", path, err)
	}
	side := httptest.NewServer(layersHandler(app))
	defer side.Close()
	want, err = renderBody(side.URL, pageJSON)
	if err != nil {
		return "", "", fmt.Errorf("oracle: first visit to %s: %w", path, err)
	}
	return got, want, nil
}

const dataPageOpen = `<script data-page="app" type="application/json">`

// firstPaintBody takes the page object text and the body (the data-page script and the root element) out of a full page.
func firstPaintBody(html string) (pageJSON, body string, err error) {
	start := strings.Index(html, dataPageOpen)
	if start < 0 {
		return "", "", fmt.Errorf("the page has no %s", dataPageOpen)
	}
	end := strings.Index(html[start:], "</script>")
	if end < 0 {
		return "", "", fmt.Errorf("the data-page script is not closed")
	}
	pageJSON = html[start+len(dataPageOpen) : start+end]
	stop := strings.LastIndex(html, "</body>")
	if stop < start {
		stop = len(html)
	}
	return pageJSON, strings.TrimRight(html[start:stop], " \t\r\n"), nil
}

// firstDifference is the offset of the first byte where a and b differ.
func firstDifference(a, b string) int {
	i := 0
	for i < len(a) && i < len(b) && a[i] == b[i] {
		i++
	}
	return i
}

// around quotes the text near offset, so that a difference can be read at a glance.
func around(text string, offset int) string {
	from, to := offset-30, offset+50
	if from < 0 {
		from = 0
	}
	if to > len(text) {
		to = len(text)
	}
	if from > len(text) {
		from = len(text)
	}
	return wire.Quote(text[from:to])
}

// Step is one thing Inertia's own client does: Kind is "visit", "reload", "post", "put", "patch" or "delete".
// Only and Except name props for a partial reload; Data is the form data sent with post, put and patch.
type Step struct {
	Kind   string
	URL    string
	Only   []string
	Except []string
	Data   map[string]any
}

// Sent is one request Inertia's client made: its method, URL and the X-Inertia headers it sent.
type Sent struct {
	Method  string
	URL     string
	Headers map[string]string
}

// Result is what happened when Inertia's client ran the steps: every request it sent, the page object it ended on,
// how many times it gave up and did a full page load, and any error it raised.
type Result struct {
	Requests    []Sent
	Page        inertia.Page
	FullReloads int
	Errors      []string
}

// Visit loads path from handler the way a browser would, starts Inertia's own client on it, then runs the steps.
func Visit(app *inertia.App, handler http.Handler, path string, steps ...Step) (Result, error) {
	return visit(app, handler, path, steps)
}
