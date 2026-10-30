package partial_test

import (
	"encoding/json"
	"fmt"
	"maps"
	"net/http"
	"net/http/httptest"
	"slices"
	"strings"
	"testing"

	"github.com/samuelpmahan/gondola/gobi"
	"github.com/samuelpmahan/gondola/inertia"
	"github.com/samuelpmahan/gondola/inertia/oracle"
)

// The Inertia 3 pages each check cites.
const (
	docsProtocol  = "https://inertiajs.com/the-protocol"
	docsPartial   = "https://inertiajs.com/partial-reloads"
	docsVersion   = "https://inertiajs.com/asset-versioning"
	docsRedirects = "https://inertiajs.com/redirects"
)

const (
	usersComponent = "Users"
	listPath       = "/users"
	memberPath     = "/users/1"
)

// attempt runs one call into the contract. A panic (the contract is still "not built yet", or a bug in the maker's
// code) is reported with t.Errorf and attempt returns false, so the rest of the run still reports.
func attempt(t *testing.T, call string, fn func()) (ok bool) {
	t.Helper()
	defer func() {
		if r := recover(); r != nil {
			t.Errorf("%s panicked: %v", call, r)
			ok = false
		}
	}()
	fn()
	return true
}

// usersView draws the Users page. The checks read props, not the drawn screen, so the screen is minimal.
func usersView(_ inertia.Props) gobi.Node {
	return gobi.El("main", gobi.Txt("Users"))
}

// fixture is one App with a Users page and its routes. Each answer carries values that change with every visit, so a
// check can tell a prop the client kept from a prop the server sent again.
type fixture struct {
	version          string
	app              *inertia.App
	mux              *http.ServeMux
	visits           int // GET /users answers rendered so far
	optionalComputes int // times the Optional prop's Compute ran
}

// newFixture builds an App at version with the Users page and the routes the checks use: GET and POST /users, and
// PUT, PATCH and DELETE /users/1. Every write route answers with app.Redirect to /users.
func newFixture(t *testing.T, version string) (*fixture, bool) {
	t.Helper()
	f := &fixture{version: version, mux: http.NewServeMux()}
	if !attempt(t, "inertia.New", func() { f.app = inertia.New(version) }) {
		return nil, false
	}
	if !attempt(t, "App.Page(Users)", func() { f.app.Page(usersComponent, usersView) }) {
		return nil, false
	}
	f.mux.HandleFunc("GET /users", func(w http.ResponseWriter, r *http.Request) {
		f.visits++
		f.app.Render(w, r, usersComponent, f.props(f.visits))
	})
	back := func(w http.ResponseWriter, r *http.Request) { f.app.Redirect(w, r, listPath) }
	f.mux.HandleFunc("POST /users", back)
	f.mux.HandleFunc("PUT /users/1", back)
	f.mux.HandleFunc("PATCH /users/1", back)
	f.mux.HandleFunc("DELETE /users/1", back)
	return f, true
}

// props are the Users page's props for visit n. title, users, stats and user change with n. activity is Optional and
// counts its own computations. user is Always.
func (f *fixture) props(n int) inertia.Props {
	return inertia.Props{
		"title": fmt.Sprintf("title at visit %d", n),
		"users": fmt.Sprintf("users at visit %d", n),
		"stats": fmt.Sprintf("stats at visit %d", n),
		"user":  inertia.Always{Value: fmt.Sprintf("ada at visit %d", n)},
		"activity": inertia.Optional{Compute: func() any {
			f.optionalComputes++
			return "activity"
		}},
	}
}

// send makes one request straight into the fixture's routes, with the given headers.
func (f *fixture) send(t *testing.T, method, target string, headers map[string]string) (*httptest.ResponseRecorder, bool) {
	t.Helper()
	var rec *httptest.ResponseRecorder
	ok := attempt(t, method+" "+target, func() {
		req := httptest.NewRequest(method, target, nil)
		for k, v := range headers {
			req.Header.Set(k, v)
		}
		rec = httptest.NewRecorder()
		f.mux.ServeHTTP(rec, req)
	})
	return rec, ok
}

// visitHeaders are the headers of an Inertia request made at the fixture's version, plus extra.
func (f *fixture) visitHeaders(extra map[string]string) map[string]string {
	h := map[string]string{"X-Inertia": "true", "X-Inertia-Version": f.version}
	maps.Copy(h, extra)
	return h
}

// partialHeaders are the headers of a partial reload of the Users page naming data (and except, when given).
func (f *fixture) partialHeaders(component, data, except string) map[string]string {
	h := f.visitHeaders(map[string]string{"X-Inertia-Partial-Component": component})
	if data != "" {
		h["X-Inertia-Partial-Data"] = data
	}
	if except != "" {
		h["X-Inertia-Partial-Except"] = except
	}
	return h
}

// run starts Inertia's own client on path, through handler, and runs the steps.
func run(t *testing.T, app *inertia.App, handler http.Handler, path string, steps ...oracle.Step) (oracle.Result, bool) {
	t.Helper()
	var res oracle.Result
	var err error
	if !attempt(t, "oracle.Visit("+path+")", func() { res, err = oracle.Visit(app, handler, path, steps...) }) {
		return res, false
	}
	if err != nil {
		t.Errorf("oracle.Visit(%s) raised an error, want none: %v (%s)", path, err, docsProtocol)
		return res, false
	}
	return res, true
}

// lastSent is the last request Inertia's client made.
func lastSent(t *testing.T, res oracle.Result) (oracle.Sent, bool) {
	t.Helper()
	if len(res.Requests) == 0 {
		t.Errorf("Inertia's client sent no requests, want at least the reload request (%s)", docsPartial)
		return oracle.Sent{}, false
	}
	return res.Requests[len(res.Requests)-1], true
}

// headerValue finds a header by name, ignoring case, since HTTP header names are case-insensitive.
func headerValue(headers map[string]string, name string) (string, bool) {
	for k, v := range headers {
		if strings.EqualFold(k, name) {
			return v, true
		}
	}
	return "", false
}

// expectHeader checks one header a request carried.
func expectHeader(t *testing.T, headers map[string]string, name, want, why string) {
	t.Helper()
	got, found := headerValue(headers, name)
	if !found {
		t.Errorf("request did not send %s, want %q: %s", name, want, why)
		return
	}
	if got != want {
		t.Errorf("%s = %q, want %q: %s", name, got, want, why)
	}
}

// expectStatus checks the status code of an answer.
func expectStatus(t *testing.T, rec *httptest.ResponseRecorder, want int, why string) {
	t.Helper()
	if rec.Code != want {
		t.Errorf("status = %d, want %d: %s", rec.Code, want, why)
	}
}

// answerProps reads the props of a JSON page object, which an Inertia request is answered with.
func answerProps(t *testing.T, rec *httptest.ResponseRecorder) (map[string]any, bool) {
	t.Helper()
	var page struct {
		Props map[string]any `json:"props"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &page); err != nil {
		t.Errorf("answer is not a JSON page object (%v), want the page object on an Inertia request; body was %q (%s)",
			err, rec.Body.String(), docsProtocol)
		return nil, false
	}
	if page.Props == nil {
		t.Errorf("page object has no props, want props on every page object (%s)", docsProtocol)
		return nil, false
	}
	return page.Props, true
}

// expectKeys checks that the props hold exactly the keys wanted, no more and no fewer.
func expectKeys(t *testing.T, props map[string]any, want []string, why string) {
	t.Helper()
	got := slices.Sorted(maps.Keys(props))
	wantSorted := slices.Sorted(slices.Values(want))
	if !slices.Equal(got, wantSorted) {
		t.Errorf("props keys = %v, want exactly %v: %s", got, wantSorted, why)
	}
}

// expectValue checks one prop's value.
func expectValue(t *testing.T, props map[string]any, key string, want any, why string) {
	t.Helper()
	got, found := props[key]
	if !found {
		t.Errorf("props[%q] is missing, want %q: %s", key, want, why)
		return
	}
	if got != want {
		t.Errorf("props[%q] = %v, want %v: %s", key, got, want, why)
	}
}

// expectAbsent checks that a prop is not in the props at all.
func expectAbsent(t *testing.T, props map[string]any, key, why string) {
	t.Helper()
	if _, found := props[key]; found {
		t.Errorf("props[%q] is present, want it absent: %s", key, why)
	}
}

// expectErrorsObject checks that errors is in props and is an object (empty by default).
func expectErrorsObject(t *testing.T, props map[string]any, why string) {
	t.Helper()
	raw, found := props["errors"]
	if !found {
		t.Errorf("props has no errors key, want errors in every page object: %s", why)
		return
	}
	if _, ok := raw.(map[string]any); !ok {
		t.Errorf("props.errors = %#v, want an object: %s", raw, why)
	}
}

// expectComputes checks how many times the Optional prop's Compute has run.
func expectComputes(t *testing.T, f *fixture, want int, why string) {
	t.Helper()
	if f.optionalComputes != want {
		t.Errorf("Optional prop's Compute ran %d times, want %d: %s", f.optionalComputes, want, why)
	}
}
