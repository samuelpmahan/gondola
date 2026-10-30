package partial_test

import (
	"net/http"
	"testing"

	"github.com/samuelpmahan/gondola/inertia/oracle"
)

// errors is in props on a normal visit and on every partial reload, defaulting to an empty object.
func TestErrorsIsAlwaysInProps(t *testing.T) {
	f, ok := newFixture(t, "v1")
	if !ok {
		return
	}
	for _, c := range []struct {
		name    string
		headers map[string]string
	}{
		{"normal Inertia visit", f.visitHeaders(nil)},
		{"partial reload with only", f.partialHeaders(usersComponent, "users", "")},
		{"partial reload with except", f.partialHeaders(usersComponent, "", "stats")},
	} {
		t.Run(c.name, func(t *testing.T) {
			rec, ok := f.send(t, http.MethodGet, listPath, c.headers)
			if !ok {
				return
			}
			props, ok := answerProps(t, rec)
			if !ok {
				return
			}
			expectErrorsObject(t, props, "errors is always in props, defaulting to {} (protocol: "+docsProtocol+")")
		})
	}

	g, ok := newFixture(t, "v1")
	if !ok {
		return
	}
	res, ok := run(t, g.app, g.mux, listPath, oracle.Step{Kind: "reload", Only: []string{"users"}})
	if !ok {
		return
	}
	expectErrorsObject(t, res.Page.Props,
		"the client's final page after a partial reload still has errors (protocol: "+docsProtocol+")")
}

// A GET with a stale X-Inertia-Version is answered 409 Conflict, with X-Inertia-Location for the target URL and the
// current version.
func TestStaleVersionGetAnswers409WithLocation(t *testing.T) {
	f, ok := newFixture(t, "v2")
	if !ok {
		return
	}
	rec, ok := f.send(t, http.MethodGet, listPath, map[string]string{
		"X-Inertia":         "true",
		"X-Inertia-Version": "v1",
	})
	if !ok {
		return
	}
	expectStatus(t, rec, http.StatusConflict,
		"a GET whose X-Inertia-Version is stale must answer 409 Conflict (asset versioning: "+docsVersion+"; protocol: "+docsProtocol+")")
	if loc := rec.Header().Get("X-Inertia-Location"); loc != listPath {
		t.Errorf("X-Inertia-Location = %q, want %q: the 409 names the target URL the client does a full page visit to (asset versioning: %s)",
			loc, listPath, docsVersion)
	}
	if v := rec.Header().Get("X-Inertia-Version"); v != "v2" {
		t.Errorf("X-Inertia-Version = %q, want %q: the 409 carries the current asset version (asset versioning: %s)",
			v, "v2", docsVersion)
	}
}

// Through Inertia's client: the first page is at v1, the app has moved on to v2 by the reload. The stale reload is
// answered 409, and the client does one full page load, which ends on the v2 page.
func TestStaleVersionThroughOracleIsOneFullPageReload(t *testing.T) {
	first, ok := newFixture(t, "v1")
	if !ok {
		return
	}
	second, ok := newFixture(t, "v2")
	if !ok {
		return
	}
	// The first request is the page visit, answered at v1. Every later request reaches an app that has moved on to v2,
	// which is what a deploy looks like to a page that is still open.
	served := 0
	deployed := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		served++
		if served == 1 {
			first.mux.ServeHTTP(w, r)
			return
		}
		second.mux.ServeHTTP(w, r)
	})
	res, ok := run(t, first.app, deployed, listPath, oracle.Step{Kind: "reload"})
	if !ok {
		return
	}
	sentStale := false
	for _, s := range res.Requests {
		if v, found := headerValue(s.Headers, "X-Inertia-Version"); found && v == "v1" {
			sentStale = true
		}
	}
	if !sentStale {
		t.Errorf("no request carried X-Inertia-Version v1, so the stale version was never sent (asset versioning: %s)", docsVersion)
	}
	if res.FullReloads != 1 {
		t.Errorf("FullReloads = %d, want 1: the 409 with X-Inertia-Location makes the client do one full page load (asset versioning: %s)",
			res.FullReloads, docsVersion)
	}
	if res.Page.Version != "v2" {
		t.Errorf("final page version = %q, want %q: the full page load fetches the current assets (asset versioning: %s)",
			res.Page.Version, "v2", docsVersion)
	}
	if res.Page.Component != usersComponent || res.Page.URL != listPath {
		t.Errorf("final page = %s at %s, want %s at %s: the client lands on the location the 409 named (asset versioning: %s)",
			res.Page.Component, res.Page.URL, usersComponent, listPath, docsVersion)
	}
	if len(res.Errors) != 0 {
		t.Errorf("client raised errors %v, want none: the 409 is an answer the client handles itself (asset versioning: %s)",
			res.Errors, docsVersion)
	}
}

// Non-GET requests never receive a mismatch 409, so a stale PUT is answered with its redirect.
func TestStaleVersionOnPutIsNotAnswered409(t *testing.T) {
	f, ok := newFixture(t, "v2")
	if !ok {
		return
	}
	rec, ok := f.send(t, http.MethodPut, memberPath, map[string]string{
		"X-Inertia":         "true",
		"X-Inertia-Version": "v1",
	})
	if !ok {
		return
	}
	if rec.Code == http.StatusConflict {
		t.Errorf("PUT with a stale version answered 409, want it not answered 409: non-GET requests never receive a mismatch 409 (protocol: %s)",
			docsProtocol)
	}
}
