package inertia_test

// The protocol rules, checked two ways: on the handler directly (headers and status), and by running Inertia's own client
// against it (oracle.Visit), which is the judge of what the client sends and does.

import (
	"net/http"
	"net/http/httptest"
	"reflect"
	"strings"
	"sync/atomic"
	"testing"

	"github.com/samuelpmahan/gondola/gobi"
	"github.com/samuelpmahan/gondola/inertia"
	"github.com/samuelpmahan/gondola/inertia/oracle"
)

// site is a small app: a Home page with every kind of prop, a Users page, and a form that redirects.
func site(version string) (*inertia.App, http.Handler) {
	app := inertia.New(version)
	app.Share("user", map[string]any{"name": "Sam"})
	app.Share("flash", inertia.Always{Value: "saved"})
	app.Layout("shell", func(props inertia.Props, page gobi.Node) gobi.Node {
		return el("main", el("nav", txt("Signed in as "), txt(props["user"].(map[string]any)["name"].(string))), page)
	})
	app.Layout("inner", func(props inertia.Props, page gobi.Node) gobi.Node { return el("section", page) })
	app.Page("Home", func(props inertia.Props) gobi.Node {
		return el("h1", txt("Home "), txt(props["title"].(string)))
	}, "shell", "inner")
	app.Page("Users", func(props inertia.Props) gobi.Node { return el("ul", el("li", txt("sam"))) }, "shell")
	mux := http.NewServeMux()
	mux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		app.Render(w, r, "Home", inertia.Props{
			"title":  "Welcome",
			"count":  3,
			"list":   inertia.Optional{Compute: func() any { return []string{"a", "b"} }},
			"always": inertia.Always{Value: "here"},
		})
	})
	mux.HandleFunc("/users", func(w http.ResponseWriter, r *http.Request) {
		app.Render(w, r, "Users", inertia.Props{"title": "Users"})
	})
	mux.HandleFunc("/save", func(w http.ResponseWriter, r *http.Request) { app.Redirect(w, r, "/users") })
	mux.HandleFunc("/away", func(w http.ResponseWriter, r *http.Request) { app.Redirect(w, r, "https://elsewhere.example/page") })
	mux.HandleFunc("/anchor", func(w http.ResponseWriter, r *http.Request) { app.Redirect(w, r, "/users#top") })
	return app, mux
}

func do(h http.Handler, method, path string, headers map[string]string) *httptest.ResponseRecorder {
	req := httptest.NewRequest(method, path, nil)
	for k, v := range headers {
		req.Header.Set(k, v)
	}
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	return rec
}

var inertiaGet = map[string]string{"X-Inertia": "true", "X-Inertia-Version": "v1"}

func with(extra map[string]string) map[string]string {
	out := map[string]string{}
	for k, v := range inertiaGet {
		out[k] = v
	}
	for k, v := range extra {
		out[k] = v
	}
	return out
}

func TestInertiaVisitAnswersJSON(t *testing.T) {
	_, h := site("v1")
	rec := do(h, "GET", "/?q=1", inertiaGet)
	if rec.Code != 200 || rec.Header().Get("X-Inertia") != "true" || rec.Header().Get("Vary") != "X-Inertia" || !strings.HasPrefix(rec.Header().Get("Content-Type"), "application/json") {
		t.Fatalf("status %d headers %v", rec.Code, rec.Header())
	}
	want := `{"component":"Home","props":{"always":"here","count":3,"errors":{},"flash":"saved","title":"Welcome","user":{"name":"Sam"}},"url":"\/?q=1","version":"v1"}`
	if rec.Body.String() != want {
		t.Errorf("body\n  %s\nwant\n  %s", rec.Body.String(), want)
	}
	if html := do(h, "GET", "/", nil); !strings.HasPrefix(html.Body.String(), "<!DOCTYPE html>") || html.Header().Get("Vary") != "X-Inertia" || html.Header().Get("X-Inertia") != "" {
		t.Errorf("first visit: %d %v", html.Code, html.Header())
	}
}

func TestStaleVersionOnGetIsAConflict(t *testing.T) {
	_, h := site("v2")
	rec := do(h, "GET", "/users?page=2", inertiaGet)
	if rec.Code != 409 || rec.Header().Get("X-Inertia-Location") != "/users?page=2" || rec.Header().Get("X-Inertia-Version") != "v2" {
		t.Errorf("%d %v", rec.Code, rec.Header())
	}
	if rec.Header().Get("X-Inertia") != "" {
		t.Error("a 409 control response carries no X-Inertia header")
	}
	if rec := do(h, "POST", "/users", inertiaGet); rec.Code == 409 {
		t.Error("only a GET is answered with 409 for a stale version")
	}
	if rec := do(h, "GET", "/users", nil); rec.Code != 200 {
		t.Errorf("a first visit has no version to compare: %d", rec.Code)
	}
}

func TestPartialReloads(t *testing.T) {
	_, h := site("v1")
	keys := func(extra map[string]string) []string {
		rec := do(h, "GET", "/", with(extra))
		var names []string
		for _, key := range []string{"title", "count", "list", "always", "errors", "flash", "user"} {
			if strings.Contains(rec.Body.String(), `"`+key+`":`) {
				names = append(names, key)
			}
		}
		return names
	}
	partial := func(data, except string) map[string]string {
		m := map[string]string{"X-Inertia-Partial-Component": "Home"}
		if data != "" {
			m["X-Inertia-Partial-Data"] = data
		}
		if except != "" {
			m["X-Inertia-Partial-Except"] = except
		}
		return m
	}
	for _, c := range []struct {
		name  string
		extra map[string]string
		want  []string
	}{
		{"a full visit leaves out Optional props", nil, []string{"title", "count", "always", "errors", "flash", "user"}},
		{"only names props, Always and errors still come", partial("title", ""), []string{"title", "always", "errors", "flash"}},
		{"only can name an Optional prop", partial("list, count", ""), []string{"count", "list", "always", "errors", "flash"}},
		{"except alone sends everything else but not Optional props", partial("", "title,user"), []string{"count", "always", "errors", "flash"}},
		{"only narrows first, then except removes", partial("title,count", "count"), []string{"title", "always", "errors", "flash"}},
		{"an Always prop cannot be excepted", partial("", "always,flash"), []string{"title", "count", "always", "errors", "flash", "user"}},
		{"another component's partial headers are ignored", map[string]string{"X-Inertia-Partial-Component": "Users", "X-Inertia-Partial-Data": "title"}, []string{"title", "count", "always", "errors", "flash", "user"}},
	} {
		if got := keys(c.extra); !reflect.DeepEqual(got, c.want) {
			t.Errorf("%s: got %v want %v", c.name, got, c.want)
		}
	}
	if rec := do(h, "GET", "/", map[string]string{"X-Inertia-Partial-Component": "Home", "X-Inertia-Partial-Data": "title"}); !strings.HasPrefix(rec.Body.String(), "<!DOCTYPE") {
		t.Error("partial headers without X-Inertia are a first visit and answer HTML")
	}
	if rec := do(h, "GET", "/", with(map[string]string{"X-Inertia-Partial-Component": "Home", "X-Inertia-Partial-Data": "list"})); !strings.Contains(rec.Body.String(), `"list":["a","b"]`) {
		t.Errorf("the Optional prop is computed when named: %s", rec.Body.String())
	}
}

func TestOptionalIsNotComputedUnlessNamed(t *testing.T) {
	app := inertia.New("v1")
	app.Page("P", func(inertia.Props) gobi.Node { return el("i") })
	computed := 0
	h := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		app.Render(w, r, "P", inertia.Props{"slow": inertia.Optional{Compute: func() any { computed++; return 1 }}})
	})
	do(h, "GET", "/", nil)
	do(h, "GET", "/", inertiaGet)
	do(h, "GET", "/", with(map[string]string{"X-Inertia-Partial-Component": "P", "X-Inertia-Partial-Data": "other"}))
	if computed != 0 {
		t.Errorf("computed %d times without being named", computed)
	}
	do(h, "GET", "/", with(map[string]string{"X-Inertia-Partial-Component": "P", "X-Inertia-Partial-Data": "slow"}))
	if computed != 1 {
		t.Errorf("computed %d times when named once", computed)
	}
}

func TestRedirects(t *testing.T) {
	_, h := site("v1")
	for _, c := range []struct {
		method, path string
		headers      map[string]string
		code         int
		header, want string
	}{
		{"POST", "/save", inertiaGet, 302, "Location", "/users"},
		{"PUT", "/save", inertiaGet, 303, "Location", "/users"},
		{"PATCH", "/save", inertiaGet, 303, "Location", "/users"},
		{"DELETE", "/save", inertiaGet, 303, "Location", "/users"},
		{"GET", "/save", nil, 302, "Location", "/users"},
		{"PUT", "/away", inertiaGet, 409, "X-Inertia-Location", "https://elsewhere.example/page"},
		{"PUT", "/anchor", inertiaGet, 409, "X-Inertia-Redirect", "/users#top"},
		{"GET", "/anchor", nil, 302, "Location", "/users#top"},
	} {
		rec := do(h, c.method, c.path, c.headers)
		if rec.Code != c.code || rec.Header().Get(c.header) != c.want {
			t.Errorf("%s %s: %d %s=%q, want %d %q", c.method, c.path, rec.Code, c.header, rec.Header().Get(c.header), c.code, c.want)
		}
	}
}

func TestUnknownComponentAndLayout(t *testing.T) {
	app := inertia.New("v1")
	app.Page("Needs", func(inertia.Props) gobi.Node { return el("i") }, "missing")
	h := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		app.Render(w, r, r.URL.Query().Get("c"), nil)
	})
	for _, c := range []string{"Nope", "Needs"} {
		if rec := do(h, "GET", "/?c="+c, nil); rec.Code != 500 {
			t.Errorf("%s: %d", c, rec.Code)
		}
	}
}

func TestPropsAreJSONData(t *testing.T) {
	type user struct {
		Name string `json:"name"`
		Age  int    `json:"age"`
	}
	app := inertia.New("v1")
	var seen inertia.Props
	app.Page("P", func(props inertia.Props) gobi.Node { seen = props; return el("i") })
	h := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		app.Render(w, r, "P", inertia.Props{"n": 3, "u": user{"Ann", 30}, "xs": []string{"a"}})
	})
	do(h, "GET", "/", nil)
	if seen["n"] != 3.0 || !reflect.DeepEqual(seen["u"], map[string]any{"name": "Ann", "age": 30.0}) || !reflect.DeepEqual(seen["xs"], []any{"a"}) || !reflect.DeepEqual(seen["errors"], map[string]any{}) {
		t.Errorf("the view got %#v, want the data the browser gets", seen)
	}
}

func TestLayoutsGetThePagesProps(t *testing.T) {
	app := inertia.New("v1")
	app.Share("who", "shared")
	app.Share("clash", "shared")
	var inLayout inertia.Props
	app.Layout("L", func(props inertia.Props, page gobi.Node) gobi.Node { inLayout = props; return page })
	app.Page("P", func(inertia.Props) gobi.Node { return el("i") }, "L")
	h := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		app.Render(w, r, "P", inertia.Props{"clash": "page", "own": 1})
	})
	do(h, "GET", "/", nil)
	want := inertia.Props{"who": "shared", "clash": "page", "own": 1.0, "errors": map[string]any{}}
	if !reflect.DeepEqual(inLayout, want) {
		t.Errorf("layout got %#v, want %#v", inLayout, want)
	}
}

// The tests below run Inertia's own client.

func TestClientNavigatesWithoutReload(t *testing.T) {
	app, h := site("v1")
	res, err := oracle.Visit(app, h, "/",
		oracle.Step{Kind: "visit", URL: "/users"},
		oracle.Step{Kind: "visit", URL: "/"},
		oracle.Step{Kind: "reload", Only: []string{"list"}},
	)
	if err != nil {
		t.Fatal(err)
	}
	if len(res.Errors) > 0 || res.FullReloads != 0 {
		t.Errorf("errors %v, full reloads %d", res.Errors, res.FullReloads)
	}
	want := []oracle.Sent{
		{Method: "GET", URL: "/users", Headers: map[string]string{"X-Inertia": "true", "X-Inertia-Version": "v1"}},
		{Method: "GET", URL: "/", Headers: map[string]string{"X-Inertia": "true", "X-Inertia-Version": "v1"}},
		{Method: "GET", URL: "/", Headers: map[string]string{"X-Inertia": "true", "X-Inertia-Version": "v1", "X-Inertia-Partial-Component": "Home", "X-Inertia-Partial-Data": "list"}},
	}
	if !reflect.DeepEqual(res.Requests, want) {
		t.Errorf("requests %+v", res.Requests)
	}
	if res.Page.Component != "Home" || res.Page.URL != "/" || res.Page.Props["list"] == nil || res.Page.Props["title"] != "Welcome" {
		t.Errorf("final page %+v: a partial reload keeps the props it did not ask for and adds the new one", res.Page)
	}
}

func TestClientFollowsA303AfterPut(t *testing.T) {
	app, h := site("v1")
	res, err := oracle.Visit(app, h, "/", oracle.Step{Kind: "put", URL: "/save", Data: map[string]any{"name": "x"}})
	if err != nil {
		t.Fatal(err)
	}
	if len(res.Errors) > 0 || res.Page.Component != "Users" || res.Page.URL != "/users" {
		t.Errorf("%+v", res)
	}
	if len(res.Requests) != 2 || res.Requests[0].Method != "PUT" || res.Requests[1].Method != "GET" || res.Requests[1].URL != "/users" || res.Requests[1].Headers["X-Inertia"] != "true" {
		t.Errorf("requests %+v", res.Requests)
	}
}

func TestClientReloadsWholePageOnStaleVersion(t *testing.T) {
	// The page is loaded from version v1; by the first visit the server has moved on to v2.
	old, oldHandler := site("v1")
	_, currentHandler := site("v2")
	for _, step := range []oracle.Step{{Kind: "visit", URL: "/users"}, {Kind: "reload"}} {
		var moved atomic.Bool
		h := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if moved.Load() {
				currentHandler.ServeHTTP(w, r)
				return
			}
			oldHandler.ServeHTTP(w, r)
			moved.Store(r.Header.Get("X-Inertia") == "") // the first page load is the last one served by the old version
		})
		res, err := oracle.Visit(old, h, "/users", step)
		if err != nil {
			t.Fatal(err)
		}
		if res.FullReloads != 1 || res.Page.Version != "v2" || res.Page.Component != "Users" || len(res.Errors) > 0 {
			t.Errorf("%s: %+v", step.Kind, res)
		}
	}
}

func TestClientHydratesWhatGoWrote(t *testing.T) {
	app, h := site("v1")
	res, err := oracle.Visit(app, h, "/")
	if err != nil {
		t.Fatal(err)
	}
	if len(res.Errors) > 0 || len(res.Requests) != 0 {
		t.Errorf("%+v", res)
	}
}

func TestClientReportsAHydrationMismatch(t *testing.T) {
	app, h := site("v1")
	tampered := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		rec := httptest.NewRecorder()
		h.ServeHTTP(rec, r)
		for k, v := range rec.Header() {
			w.Header()[k] = v
		}
		w.Write([]byte(strings.Replace(rec.Body.String(), "Welcome", "Tampered", 1)))
	})
	res, err := oracle.Visit(app, tampered, "/")
	if err != nil {
		t.Fatal(err)
	}
	if len(res.Errors) == 0 || !strings.Contains(res.Errors[0], "hydration") {
		t.Errorf("Inertia's client should report the mismatch: %+v", res.Errors)
	}
}
