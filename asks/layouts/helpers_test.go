package layouts_test

import (
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"testing"

	"github.com/samuelpmahan/gondola/inertia"
	"github.com/samuelpmahan/gondola/inertia/oracle"
)

// assetVersion is the version every check builds its app with. The X-Inertia-Version check compares against it.
const assetVersion = "layouts-2026-10-30"

// try runs f and turns a panic into a test error. The stubs panic with "not built yet", so without this one panic
// would stop the whole test binary; with it each check reports its own failure and the rest still run.
func try(t *testing.T, what string, f func()) (ok bool) {
	t.Helper()
	defer func() {
		if r := recover(); r != nil {
			t.Errorf("%s: panicked: %v", what, r)
			ok = false
		}
	}()
	f()
	return true
}

// response is what a plain GET (a first visit, no X-Inertia header) got back from the handler.
type response struct {
	Code   int
	Header http.Header
	Body   string
}

// get sends a plain GET for path to h and returns the answer.
func get(t *testing.T, h http.Handler, path string) (response, bool) {
	t.Helper()
	var out response
	ok := try(t, "GET "+path, func() {
		rec := httptest.NewRecorder()
		h.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, path, nil))
		out = response{Code: rec.Code, Header: rec.Result().Header, Body: rec.Body.String()}
	})
	return out, ok
}

// visit runs Inertia's own client on path, then the steps, through oracle.Visit.
func visit(t *testing.T, app *inertia.App, h http.Handler, path string, steps ...oracle.Step) (oracle.Result, bool) {
	t.Helper()
	var res oracle.Result
	ok := try(t, "oracle.Visit "+path, func() {
		var err error
		res, err = oracle.Visit(app, h, path, steps...)
		if err != nil {
			t.Errorf("oracle.Visit %s: expected Inertia's client to run without error, got: %v (https://inertiajs.com/the-protocol)", path, err)
		}
	})
	return res, ok
}

// sameFirstPaint checks that the first paint of path is byte identical to Inertia's own server-side render of the
// same page object. The first request to an Inertia app is a regular full-page request (https://inertiajs.com/the-protocol),
// so its HTML is the first paint, and the oracle compares it against Inertia's renderer (asks/README.md, oracle.go).
func sameFirstPaint(t *testing.T, app *inertia.App, h http.Handler, path string) {
	t.Helper()
	try(t, "oracle.SameFirstPaint "+path, func() {
		if err := oracle.SameFirstPaint(app, h, path); err != nil {
			t.Errorf("first paint of %s: expected byte identical HTML to Inertia's own server render, got: %v (https://inertiajs.com/the-protocol: the first request is a full-page request)", path, err)
		}
	})
}

// markersInOrder checks that each marker appears exactly once in body, and that the markers appear in the order
// given. why says what the order means and which docs page says so; it goes into every message.
func markersInOrder(t *testing.T, path, body, why string, markers ...string) {
	t.Helper()
	last, lastMarker := -1, ""
	for _, m := range markers {
		if n := strings.Count(body, m); n != 1 {
			t.Errorf("GET %s: expected %q exactly once in the HTML, found it %d times. %s", path, m, n, why)
			continue
		}
		at := strings.Index(body, m)
		if at < last {
			t.Errorf("GET %s: expected %q to come after %q in the HTML, but it comes before. %s", path, m, lastMarker, why)
		}
		last, lastMarker = at, m
	}
}

// sentTo returns the first request the client sent to the path, comparing paths and ignoring the host.
func sentTo(reqs []oracle.Sent, path string) (oracle.Sent, bool) {
	for _, s := range reqs {
		if u, err := url.Parse(s.URL); err == nil && u.Path == path {
			return s, true
		}
	}
	return oracle.Sent{}, false
}

// headerValue reads a request header by name. HTTP header names are case-insensitive, so the match is too.
func headerValue(h map[string]string, name string) (string, bool) {
	for k, v := range h {
		if strings.EqualFold(k, name) {
			return v, true
		}
	}
	return "", false
}
