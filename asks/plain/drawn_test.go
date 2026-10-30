package plain_test

import (
	"reflect"
	"strings"
	"testing"

	"github.com/samuelpmahan/gondola/gobi"
	"github.com/samuelpmahan/gondola/inertia"
	"github.com/samuelpmahan/gondola/inertia/oracle"
)

// listView draws the items prop as an unordered list under a heading. Props are plain JSON data (inertia/inertia.go:
// string, float64, bool, nil, []any, map[string]any), so the list arrives as []any of strings.
func listView(props inertia.Props) gobi.Node {
	items, ok := props["items"].([]any)
	if !ok {
		panic("prop \"items\" should be a []any")
	}
	var lis []gobi.Node
	for _, item := range items {
		s, ok := item.(string)
		if !ok {
			panic("each item should be a string")
		}
		lis = append(lis, gobi.El("li", gobi.Txt(s)))
	}
	return gobi.El("main", gobi.El("h1", gobi.Txt("Shopping")), gobi.El("ul", lis...))
}

// TestPageDrawsListFromPropMatchesInertiaSSR checks a page whose list is drawn from an items prop: the first paint
// matches Inertia's own rendering, and the page object carries the items as the same list of strings, in order. The
// protocol says props are sent as the page was given them (https://inertiajs.com/the-protocol, page object).
func TestPageDrawsListFromPropMatchesInertiaSSR(t *testing.T) {
	items := []any{"eggs", "milk", "disc, 175g"}
	app, mux, ok := serve(t, listView, inertia.Props{"items": items}, "/list")
	if !ok {
		return
	}
	var err error
	if !try(t, "oracle.SameFirstPaint", func() { err = oracle.SameFirstPaint(app, mux, "/list") }) {
		return
	}
	if err != nil {
		t.Errorf("first paint of a page drawing a list from a prop differs from Inertia's own server-side rendering: %v; expected byte identical bodies, because the list must render the same as Inertia renders it (https://inertiajs.com/the-protocol, first visit)", err)
	}

	rec, ok := fetch(t, mux, "/list", nil)
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
	want := []any{"eggs", "milk", "disc, 175g"}
	if got := page.Props["items"]; !reflect.DeepEqual(got, want) {
		t.Errorf("page object props.items = %#v, want %#v; a list prop is sent as a JSON array in the order given (https://inertiajs.com/the-protocol, page object)", got, want)
	}
}

// TestTitlePropWithHTMLTextIsDrawnAsText checks a title prop that holds HTML-looking text, including a script tag. The
// text must reach the page object exactly as given, and the first paint must draw it as text: the markup is escaped
// and no live tag or script appears in the body. The protocol says props are sent exactly as given (https://inertiajs.com/the-protocol,
// page object); the text escaping is what Inertia's server-side rendering writes (the oracle is the judge).
func TestTitlePropWithHTMLTextIsDrawnAsText(t *testing.T) {
	const title = `<b>Bold</b> & "quoted" <script>x</script>`
	app, mux, ok := serve(t, heading, inertia.Props{"title": title, "body": "ok"}, "/title")
	if !ok {
		return
	}
	var err error
	if !try(t, "oracle.SameFirstPaint", func() { err = oracle.SameFirstPaint(app, mux, "/title") }) {
		return
	}
	if err != nil {
		t.Errorf("first paint of a page whose title holds HTML-looking text differs from Inertia's own rendering: %v; expected byte identical bodies (https://inertiajs.com/the-protocol, first visit)", err)
	}

	rec, ok := fetch(t, mux, "/title", nil)
	if !ok {
		return
	}
	body := rec.Body.String()
	if strings.Contains(body, "<b>Bold</b>") {
		t.Errorf("first visit body draws the title with a live <b> tag; the title is text, so its markup must be escaped (&lt;b&gt;), not written as a tag; body was %q", body)
	}
	if strings.Contains(body, "<script>x</script>") {
		t.Errorf("first visit body contains a literal <script>x</script> from the title; a title is text and must not inject a script; body was %q", body)
	}
	if !strings.Contains(body, "&lt;b&gt;Bold&lt;/b&gt;") {
		t.Errorf("first visit body does not draw the title as escaped text &lt;b&gt;Bold&lt;/b&gt;; text children are escaped so that markup in a prop shows as words; body was %q", body)
	}

	raw, ok := dataPage(t, body)
	if !ok {
		return
	}
	page, ok := decodePage(t, "data-page script", raw)
	if !ok {
		return
	}
	if got := page.Props["title"]; got != title {
		t.Errorf("page object props.title = %#v, want %q; props are sent exactly as given, markup and all (https://inertiajs.com/the-protocol, page object)", got, title)
	}
}
