// Package plain_test holds Haiku 1's checks: plain pages, first paint and the Inertia protocol for single pages with no
// layouts. Each check builds an inertia.App with inertia.New, registers one page, serves it through an
// http.ServeMux whose handler calls app.Render, and then checks what came back. The protocol is
// https://inertiajs.com/the-protocol (version 3).
package plain_test

import (
	"encoding/json"
	"fmt"
	"mime"
	"net/http"
	"net/http/httptest"
	"reflect"
	"regexp"
	"strings"
	"testing"

	"github.com/samuelpmahan/gondola/gobi"
	"github.com/samuelpmahan/gondola/inertia"
	"github.com/samuelpmahan/gondola/inertia/oracle"
)

// appRoot matches the root element of a first visit: a div whose id is app, with any other attributes (Inertia's server
// rendering writes data-server-rendered="true" before it).
var appRoot = regexp.MustCompile(`<div\b[^>]*\bid="app"`)

// version is the asset version every check gives inertia.New.
const version = "plain-v1"

// component is the component every check registers. The name is the Inertia component name, which is also the
// name the page object carries in its component key.
const component = "Plain/Hello"

// scriptOpen is the opening tag of the script that holds the page object on a first visit (the protocol, first visit).
const scriptOpen = `<script data-page="app" type="application/json">`

// try runs fn and reports a panic as a test error, so the other checks in the same test still run. It reports false
// when fn panicked. The stubs in inertia/inertia.go panic with "not built yet" until the maker builds them.
func try(t *testing.T, what string, fn func()) (ok bool) {
	t.Helper()
	defer func() {
		if r := recover(); r != nil {
			t.Errorf("%s panicked, want it to return normally: %v", what, r)
			ok = false
		}
	}()
	fn()
	return true
}

// heading draws a plain page: a heading from the title prop and a paragraph from the body prop.
func heading(props inertia.Props) gobi.Node {
	return gobi.El("main",
		gobi.El("h1", gobi.Txt(text(props, "title"))),
		gobi.El("p", gobi.Txt(text(props, "body"))))
}

// text reads a string prop. A prop of another type panics, which try reports as a failed check.
func text(props inertia.Props, key string) string {
	s, ok := props[key].(string)
	if !ok {
		panic(fmt.Sprintf("prop %q should be a string, got %T", key, props[key]))
	}
	return s
}

// serve builds an App, registers the page with view, and returns a mux that answers path by calling app.Render with
// props. ok is false when a build step panicked; that panic is already reported.
func serve(t *testing.T, view inertia.View, props inertia.Props, path string) (*inertia.App, *http.ServeMux, bool) {
	t.Helper()
	var app *inertia.App
	var mux *http.ServeMux
	ok := try(t, "inertia.New", func() { app = inertia.New(version) })
	ok = ok && try(t, "App.Page", func() { app.Page(component, view) })
	ok = ok && try(t, "ServeMux.HandleFunc", func() {
		mux = http.NewServeMux()
		mux.HandleFunc(path, func(w http.ResponseWriter, r *http.Request) {
			app.Render(w, r, component, props)
		})
	})
	return app, mux, ok
}

// fetch sends a GET for target to h with the given headers. It returns the recorded answer, and ok false when the
// handler panicked (already reported).
func fetch(t *testing.T, h http.Handler, target string, headers map[string]string) (*httptest.ResponseRecorder, bool) {
	t.Helper()
	rec := httptest.NewRecorder()
	ok := try(t, "GET "+target, func() {
		req := httptest.NewRequest(http.MethodGet, target, nil)
		for k, v := range headers {
			req.Header.Set(k, v)
		}
		h.ServeHTTP(rec, req)
	})
	return rec, ok
}

// dataPage returns the text inside the data-page script of a first-visit body. It reports false when the script is
// missing or never closed.
func dataPage(t *testing.T, body string) (string, bool) {
	t.Helper()
	i := strings.Index(body, scriptOpen)
	if i < 0 {
		t.Errorf("first visit has no %s; the protocol says the page object travels in that script (https://inertiajs.com/the-protocol, first visit); body was %q", scriptOpen, body)
		return "", false
	}
	rest := body[i+len(scriptOpen):]
	j := strings.Index(rest, "</script>")
	if j < 0 {
		t.Errorf("the data-page script is never closed by </script>, so the page object is cut off; body was %q", body)
		return "", false
	}
	return rest[:j], true
}

// decodePage parses a page object into inertia.Page. It reports false (after reporting) when the text is not JSON.
func decodePage(t *testing.T, what, raw string) (inertia.Page, bool) {
	t.Helper()
	var p inertia.Page
	if err := json.Unmarshal([]byte(raw), &p); err != nil {
		t.Errorf("%s is not a page object: %v; the protocol says the page object is JSON (https://inertiajs.com/the-protocol); got %q", what, err, raw)
		return p, false
	}
	return p, true
}

// mediaType returns the media type of the answer's Content-Type, without parameters such as charset.
func mediaType(t *testing.T, what string, rec *httptest.ResponseRecorder) string {
	t.Helper()
	ct := rec.Header().Get("Content-Type")
	mt, _, err := mime.ParseMediaType(ct)
	if err != nil {
		t.Errorf("%s: Content-Type %q does not parse as a media type: %v", what, ct, err)
	}
	return mt
}

// hasVaryToken reports whether any Vary header value lists token, comparing names without case.
func hasVaryToken(h http.Header, token string) bool {
	for _, v := range h.Values("Vary") {
		for _, part := range strings.Split(v, ",") {
			if strings.EqualFold(strings.TrimSpace(part), token) {
				return true
			}
		}
	}
	return false
}

// TestSimplePageFirstPaintMatchesInertiaSSR checks that a heading and a paragraph from string props produce the same
// first paint as Inertia's own server-side rendering of the same page object. The protocol says the first visit is
// the page as Inertia would render it (https://inertiajs.com/the-protocol, first visit); the oracle compares bytes.
func TestSimplePageFirstPaintMatchesInertiaSSR(t *testing.T) {
	props := inertia.Props{"title": "Hello from Go", "body": "A single page: a heading and a paragraph."}
	app, mux, ok := serve(t, heading, props, "/hello")
	if !ok {
		return
	}
	var err error
	if !try(t, "oracle.SameFirstPaint", func() { err = oracle.SameFirstPaint(app, mux, "/hello") }) {
		return
	}
	if err != nil {
		t.Errorf("first paint of a plain page differs from Inertia's own server-side rendering of the same page object: %v; expected byte identical bodies, because a first visit must render exactly what Inertia renders (https://inertiajs.com/the-protocol, first visit)", err)
	}
}

// TestFirstVisitIsAnHTMLDocumentWithAppDivAndPageScript checks the shape of a first-visit answer: status 200, an HTML
// document, a div with id app to mount in, and the script that holds the page object.
func TestFirstVisitIsAnHTMLDocumentWithAppDivAndPageScript(t *testing.T) {
	_, mux, ok := serve(t, heading, inertia.Props{"title": "Hi", "body": "There"}, "/hello")
	if !ok {
		return
	}
	rec, ok := fetch(t, mux, "/hello", nil)
	if !ok {
		return
	}
	if rec.Code != http.StatusOK {
		t.Errorf("first visit status = %d, want 200; a first visit is a normal page load (https://inertiajs.com/the-protocol, first visit)", rec.Code)
	}
	if mt := mediaType(t, "first visit", rec); mt != "text/html" {
		t.Errorf("first visit media type = %q, want text/html; the protocol says a request without Inertia headers receives a full HTML document (https://inertiajs.com/the-protocol, first visit)", mt)
	}
	body := rec.Body.String()
	if !strings.Contains(strings.ToLower(body), "<!doctype html>") {
		t.Errorf("first visit body has no <!DOCTYPE html>; the protocol says it is a full HTML document (https://inertiajs.com/the-protocol, first visit); body was %q", body)
	}
	if !appRoot.MatchString(body) {
		t.Errorf("first visit body has no div whose id is app; the protocol says the root element with id app is the mount point (https://inertiajs.com/the-protocol, first visit), and Inertia's server-side rendering writes it as <div data-server-rendered=\"true\" id=\"app\">; body was %q", body)
	}
	if !strings.Contains(body, scriptOpen) {
		t.Errorf("first visit body has no %s; the protocol says the page object is in that script (https://inertiajs.com/the-protocol, first visit); body was %q", scriptOpen, body)
	}
}

// TestFirstVisitPageObjectNamesComponentPropsURLAndVersion checks the four keys every page object has, each with the
// value it was given: the component name, the props, the request URL and the asset version.
func TestFirstVisitPageObjectNamesComponentPropsURLAndVersion(t *testing.T) {
	_, mux, ok := serve(t, heading, inertia.Props{"title": "Hello from Go", "body": "A paragraph."}, "/hello")
	if !ok {
		return
	}
	rec, ok := fetch(t, mux, "/hello", nil)
	if !ok {
		return
	}
	raw, ok := dataPage(t, rec.Body.String())
	if !ok {
		return
	}
	page, ok := decodePage(t, "data-page script", raw)
	if !ok {
		return
	}
	if page.Component != component {
		t.Errorf("page object component = %q, want %q; the component key names the page the client renders (https://inertiajs.com/the-protocol, page object)", page.Component, component)
	}
	if got := page.Props["title"]; got != "Hello from Go" {
		t.Errorf("page object props.title = %#v, want %q; props are sent exactly as the page was given them (https://inertiajs.com/the-protocol, page object)", got, "Hello from Go")
	}
	if got := page.Props["body"]; got != "A paragraph." {
		t.Errorf("page object props.body = %#v, want %q; props are sent exactly as the page was given them (https://inertiajs.com/the-protocol, page object)", got, "A paragraph.")
	}
	if page.URL != "/hello" {
		t.Errorf("page object url = %q, want %q; url is the current URL the page was requested at (https://inertiajs.com/the-protocol, page object)", page.URL, "/hello")
	}
	if page.Version != version {
		t.Errorf("page object version = %q, want %q; version is the asset version given to inertia.New, which the client compares on later visits (https://inertiajs.com/the-protocol, page object and version mismatch)", page.Version, version)
	}
}

// TestPageObjectHasOnlyTheFourKeysOnAPlainPage checks that a plain page with no shared or special props carries exactly
// component, props, url and version. The protocol says other keys appear only when they apply.
func TestPageObjectHasOnlyTheFourKeysOnAPlainPage(t *testing.T) {
	_, mux, ok := serve(t, heading, inertia.Props{"title": "Hi", "body": "There"}, "/hello")
	if !ok {
		return
	}
	rec, ok := fetch(t, mux, "/hello", nil)
	if !ok {
		return
	}
	raw, ok := dataPage(t, rec.Body.String())
	if !ok {
		return
	}
	var keys map[string]json.RawMessage
	if err := json.Unmarshal([]byte(raw), &keys); err != nil {
		t.Errorf("page object is not a JSON object: %v; got %q", err, raw)
		return
	}
	want := []string{"component", "props", "url", "version"}
	for _, k := range want {
		if _, has := keys[k]; !has {
			t.Errorf("page object has no %q key; the protocol says only component, props, url and version are present on every page object (https://inertiajs.com/the-protocol, page object)", k)
		}
	}
	for k := range keys {
		if !contains(want, k) {
			t.Errorf("page object has key %q on a plain page; the protocol says other keys appear only when they apply, and a plain page with no shared, deferred or merge props has none (https://inertiajs.com/the-protocol, page object)", k)
		}
	}
}

// TestPropsAlwaysCarryAnErrorsObjectWhenNoneGiven checks that props holds errors as an empty object even when the
// page was given no errors. The protocol says errors is an always prop, so every page object includes it.
func TestPropsAlwaysCarryAnErrorsObjectWhenNoneGiven(t *testing.T) {
	_, mux, ok := serve(t, heading, inertia.Props{"title": "Hi", "body": "There"}, "/hello")
	if !ok {
		return
	}
	rec, ok := fetch(t, mux, "/hello", nil)
	if !ok {
		return
	}
	raw, ok := dataPage(t, rec.Body.String())
	if !ok {
		return
	}
	page, ok := decodePage(t, "data-page script", raw)
	if !ok {
		return
	}
	errs, has := page.Props["errors"]
	if !has {
		t.Errorf("page object props has no errors key; the protocol says errors is an always prop, so every page object includes it, defaulting to {} (https://inertiajs.com/the-protocol, page object)")
		return
	}
	m, isObject := errs.(map[string]any)
	if !isObject || len(m) != 0 {
		t.Errorf("page object props.errors = %#v, want an empty object {}; the protocol says errors defaults to an empty object (https://inertiajs.com/the-protocol, page object)", errs)
	}
}

// TestPageURLKeepsTheQueryString checks that the url in the page object is the request target with its query string,
// so the client's address bar and history carry the query the user asked for.
func TestPageURLKeepsTheQueryString(t *testing.T) {
	_, mux, ok := serve(t, heading, inertia.Props{"title": "Search", "body": "Results"}, "/hello")
	if !ok {
		return
	}
	rec, ok := fetch(t, mux, "/hello?name=ada&tab=notes", nil)
	if !ok {
		return
	}
	raw, ok := dataPage(t, rec.Body.String())
	if !ok {
		return
	}
	page, ok := decodePage(t, "data-page script", raw)
	if !ok {
		return
	}
	if want := "/hello?name=ada&tab=notes"; page.URL != want {
		t.Errorf("page object url = %q, want %q; the url is the current URL with its query string (https://inertiajs.com/the-protocol, page object)", page.URL, want)
	}
}

// TestInertiaVisitAnswersJSONWithInertiaHeaders checks an Inertia visit (X-Inertia: true with the right version): the
// answer is JSON, marked X-Inertia: true, with Vary: X-Inertia, and its body is a page object.
func TestInertiaVisitAnswersJSONWithInertiaHeaders(t *testing.T) {
	_, mux, ok := serve(t, heading, inertia.Props{"title": "Hi", "body": "There"}, "/hello")
	if !ok {
		return
	}
	rec, ok := fetch(t, mux, "/hello", map[string]string{
		"X-Inertia":         "true",
		"X-Inertia-Version": version,
		"X-Requested-With":  "XMLHttpRequest",
	})
	if !ok {
		return
	}
	if rec.Code != http.StatusOK {
		t.Errorf("Inertia visit status = %d, want 200 because the version matches; a mismatch would be 409 (https://inertiajs.com/the-protocol, version mismatch)", rec.Code)
	}
	if mt := mediaType(t, "Inertia visit", rec); mt != "application/json" {
		t.Errorf("Inertia visit media type = %q, want application/json; the protocol says Inertia requests get JSON (https://inertiajs.com/the-protocol, Inertia requests)", mt)
	}
	if got := rec.Header().Get("X-Inertia"); got != "true" {
		t.Errorf("Inertia visit header X-Inertia = %q, want \"true\"; the protocol says the JSON answer carries it (https://inertiajs.com/the-protocol, Inertia requests)", got)
	}
	if !hasVaryToken(rec.Header(), "X-Inertia") {
		t.Errorf("Inertia visit Vary = %v, want it to list X-Inertia; the protocol says Vary: X-Inertia lets browsers tell HTML and JSON answers apart (https://inertiajs.com/the-protocol, Inertia requests)", rec.Header().Values("Vary"))
	}
	decodePage(t, "Inertia visit body", rec.Body.String())
}

// TestInertiaVisitJSONPageObjectMatchesFirstVisit checks that the JSON an Inertia visit gets is the same page object
// the first visit put in its script: same component, url, version and props.
func TestInertiaVisitJSONPageObjectMatchesFirstVisit(t *testing.T) {
	_, mux, ok := serve(t, heading, inertia.Props{"title": "Hello from Go", "body": "Same page object."}, "/hello")
	if !ok {
		return
	}
	first, ok := fetch(t, mux, "/hello?x=1", nil)
	if !ok {
		return
	}
	raw, ok := dataPage(t, first.Body.String())
	if !ok {
		return
	}
	firstPage, ok := decodePage(t, "first visit data-page script", raw)
	if !ok {
		return
	}
	jsonVisit, ok := fetch(t, mux, "/hello?x=1", map[string]string{
		"X-Inertia":         "true",
		"X-Inertia-Version": version,
		"X-Requested-With":  "XMLHttpRequest",
	})
	if !ok {
		return
	}
	visitPage, ok := decodePage(t, "Inertia visit body", jsonVisit.Body.String())
	if !ok {
		return
	}
	if !reflect.DeepEqual(visitPage, firstPage) {
		t.Errorf("Inertia visit page object = %#v, want the same page object as the first visit %#v; the protocol says the JSON answer is the page object (https://inertiajs.com/the-protocol, Inertia requests)", visitPage, firstPage)
	}
}

// contains reports whether list holds s.
func contains(list []string, s string) bool {
	for _, x := range list {
		if x == s {
			return true
		}
	}
	return false
}
