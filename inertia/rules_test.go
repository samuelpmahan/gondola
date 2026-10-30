package inertia_test

// The rules table of the Inertia server: every row is a page and the exact body Inertia's own server-side rendering
// (@inertiajs/react 3.9.1, React 19.3.1, createInertiaApp with renderToString) wrote for it. TestRulesGo checks that Go
// writes the recorded body; TestRulesAgainstInertia asks Inertia again for the page object Go wrote and checks that the
// recorded body is still what Inertia writes, so a row cannot drift from the oracle.
//
// The recorded bodies are in rules_recorded_test.go. To record a new row run: GOBI_RECORD=1 go test ./inertia/ -run TestRecordRules
// and read the diff: a body is only trusted once TestRulesAgainstInertia passes, which asks Inertia for the same page.

import (
	"fmt"
	"math"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"testing"

	"github.com/samuelpmahan/gondola/gobi"
	"github.com/samuelpmahan/gondola/inertia"
	"github.com/samuelpmahan/gondola/inertia/oracle"
)

var el, txt, frag = gobi.El, gobi.Txt, gobi.Frag

// rule is one row. The page draws Page whatever its props; Layouts wrap it, outermost first.
type rule struct {
	Name      string
	Props     inertia.Props
	Shared    map[string]any
	Version   string // defaults to "v1"
	NoVersion bool   // the empty version
	URL       string // defaults to "/"
	Page      gobi.Node
	Layouts   []func(page gobi.Node) gobi.Node
}

const (
	open  = `<script data-page="app" type="application/json">`
	root  = `</script><div data-server-rendered="true" id="app">`
	close = `</div>`
)

// build makes the App and the handler for one row.
func (r rule) build() (*inertia.App, http.Handler) {
	version := r.Version
	if version == "" && !r.NoVersion {
		version = "v1"
	}
	app := inertia.New(version)
	for key, value := range r.Shared {
		app.Share(key, value)
	}
	var names []string
	for i, wrap := range r.Layouts {
		name := fmt.Sprint("layout", i)
		names = append(names, name)
		wrap := wrap
		app.Layout(name, func(props inertia.Props, page gobi.Node) gobi.Node { return wrap(page) })
	}
	app.Page("Page", func(inertia.Props) gobi.Node { return r.Page }, names...)
	return app, http.HandlerFunc(func(w http.ResponseWriter, req *http.Request) { app.Render(w, req, "Page", r.Props) })
}

func (r rule) path() string {
	if r.URL == "" {
		return "/"
	}
	return r.URL
}

// body is what Go writes for the row: the data-page script and the root element.
func (r rule) body(t *testing.T) string {
	_, handler := r.build()
	recorder := httptest.NewRecorder()
	handler.ServeHTTP(recorder, httptest.NewRequest(http.MethodGet, r.path(), nil))
	html := recorder.Body.String()
	start, stop := strings.Index(html, open), strings.LastIndex(html, "\n</body>")
	if start < 0 || stop < start {
		t.Fatalf("%s: no body in %q", r.Name, html)
	}
	return html[start:stop]
}

var p = el("p", txt("x"))

func rules() []rule {
	return []rule{
		// What the page object looks like and how it is written.
		{Name: "the body is the data-page script and a root element marked as server rendered", Page: p},
		{Name: "page keys are component, props, url, version, and errors is {} when the page has none", Page: p, Props: inertia.Props{"a": "b"}},
		{Name: "errors from the page are kept", Page: p, Props: inertia.Props{"errors": map[string]any{"name": "Required"}}},
		{Name: "a page prop wins over a shared prop of the same key", Page: p, Shared: map[string]any{"x": "shared", "y": "shared"}, Props: inertia.Props{"x": "page"}},
		{Name: "url is the path and the query as the browser sent them", Page: p, URL: "/a/b?c=d&e=%2F"},
		{Name: "an empty version is an empty string", Page: p, NoVersion: true},
		{Name: "a version that looks like a number stays a string", Page: p, Version: "1"},
		// How text in props is escaped.
		{Name: "less-than is \\u003c and slash is \\/, so that </script> cannot close the script", Page: p, Props: inertia.Props{"s": "</script><!--"}},
		{Name: "greater-than, ampersand and apostrophe are written as they are", Page: p, Props: inertia.Props{"s": "a>b&c'd"}},
		{Name: "quote and backslash are escaped", Page: p, Props: inertia.Props{"s": "a\"b\\c"}},
		{Name: "non-ASCII text is written as it is", Page: p, Props: inertia.Props{"s": "é日本語😀"}},
		{Name: "U+2028, U+2029 and DEL are written as they are", Page: p, Props: inertia.Props{"s": "a b c\x7fd"}},
		{Name: "control characters use the short escapes or \\u00xx in lower case", Page: p, Props: inertia.Props{"s": "\x00\x01\x1f\b\f\n\r\t"}},
		{Name: "a lone surrogate is \\udxxx in lower case, in a value and in a key", Page: p, Props: inertia.Props{"s": "a\xed\xa0\x80b", "k\xed\xb0\x80": 1}},
		{Name: "the same escapes apply to keys and to the url", Page: p, Props: inertia.Props{"</a/>": "x"}, URL: "/a<b"},
		// How values and keys are written.
		{Name: "numbers are written the way JavaScript writes them", Page: p, Props: inertia.Props{
			"int": 3, "float": 1.5, "negative zero": math.Copysign(0, -1), "big": 1e21, "small": 1e-7, "huge": 123456789012345680000.0, "tenth": 0.1, "int64": int64(1) << 40}},
		{Name: "booleans, null, empty and nested values", Page: p, Props: inertia.Props{"t": true, "f": false, "n": nil, "list": []any{}, "map": map[string]any{}, "deep": []any{map[string]any{"a": []any{1.0, "x", nil}}}}},
		{Name: "a Go slice of strings is a JSON array", Page: p, Props: inertia.Props{"tags": []string{"a", "b"}}},
		{Name: "keys that look like array indexes come first, in number order, then the others sorted", Page: p, Props: inertia.Props{
			"b": 1, "a": 2, "10": 3, "2": 4, "01": 5, " ": 6, "-1": 7, "4294967295": 8, "4294967294": 9, "": 10, "B": 11}},
		// How the page is drawn.
		{Name: "two text runs that touch are separated by <!-- -->", Page: el("p", txt("a"), txt("b"), txt("c"))},
		{Name: "empty text writes nothing and separates nothing", Page: el("p", txt("a"), txt(""), txt("b"), txt(""))},
		{Name: "a tag between two text runs needs no separator", Page: el("p", txt("a"), el("b"), txt("c"), el("br"), txt("d"))},
		{Name: "a closing tag ends a text run", Page: frag(el("b", txt("x")), txt("y"))},
		{Name: "a fragment does not end a text run", Page: el("p", txt("a"), frag(txt("b")), frag(), frag(txt("")), txt("c"))},
		{Name: "text runs touch across fragments and a text root", Page: frag(txt("a"), frag(frag(txt("b"))), txt("c"))},
		{Name: "the first text in an element needs no separator, even after text outside it", Page: frag(txt("a"), el("p", txt("b")))},
		{Name: "option text children are separated too", Page: el("select", el("option", txt("a"), txt("b")))},
		{Name: "escaped text is separated the same way", Page: el("p", txt("<"), txt("&"))},
		{Name: "a layout and its page touch like any other siblings", Page: txt("page"), Layouts: []func(gobi.Node) gobi.Node{
			func(page gobi.Node) gobi.Node { return el("main", txt("before"), page, txt("after")) }}},
		{Name: "layouts nest, the first one outermost", Page: txt("page"), Layouts: []func(gobi.Node) gobi.Node{
			func(page gobi.Node) gobi.Node { return el("main", txt("outer "), page) },
			func(page gobi.Node) gobi.Node { return el("section", txt("inner "), page) }}},
		{Name: "an image preload goes to the front of the root element", Page: el("div", txt("t"), el("img").Set("src", "a.png"))},
		{Name: "nothing is added around a page of one element", Page: el("i")},
	}
}

var ruleList = rules()

func TestRulesGo(t *testing.T) {
	for _, r := range ruleList {
		r := r
		t.Run(r.Name, func(t *testing.T) {
			want, ok := recorded[r.Name]
			if !ok {
				t.Fatal("not recorded yet; see the top of this file")
			}
			if got := r.body(t); got != want {
				t.Errorf("Go wrote\n  %s\nrecorded from Inertia\n  %s", got, want)
			}
		})
	}
}

func TestRulesAgainstInertia(t *testing.T) {
	for _, r := range ruleList {
		r := r
		t.Run(r.Name, func(t *testing.T) {
			app, handler := r.build()
			if err := oracle.SameFirstPaint(app, handler, r.path()); err != nil {
				t.Error(err)
			}
		})
	}
}

// TestRecordRules writes rules_recorded_test.go: the body Inertia writes for every row.
func TestRecordRules(t *testing.T) {
	if os.Getenv("GOBI_RECORD") == "" {
		t.Skip("set GOBI_RECORD=1 to record the bodies")
	}
	var b strings.Builder
	b.WriteString("package inertia_test\n\n// Recorded by TestRecordRules. Each body is what Inertia's server-side rendering wrote for the row (TestRulesAgainstInertia checks it again).\n\nvar recorded = map[string]string{\n")
	for _, r := range ruleList {
		app, handler := r.build()
		body, err := oracle.InertiaBody(app, handler, r.path())
		if err != nil {
			t.Fatal(err)
		}
		fmt.Fprintf(&b, "\t%q:\n\t\t%q,\n", r.Name, body)
	}
	b.WriteString("}\n")
	if err := os.WriteFile("rules_recorded_test.go", []byte(b.String()), 0o644); err != nil {
		t.Fatal(err)
	}
}
