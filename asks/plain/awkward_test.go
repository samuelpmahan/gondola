package plain_test

import (
	"encoding/json"
	"reflect"
	"strings"
	"testing"

	"github.com/samuelpmahan/gondola/gobi"
	"github.com/samuelpmahan/gondola/inertia"
	"github.com/samuelpmahan/gondola/inertia/oracle"
)

// awkwardCase is one prop value that is hard to carry from Go to the page and back.
type awkwardCase struct {
	name  string
	value any
}

// awkwardCases covers the awkward props from asks/README.md (Haiku 1): a </script> inside a string, a URL with
// slashes, quotes and apostrophes, non-ASCII and emoji, an empty string, nested maps and lists, numbers and booleans.
var awkwardCases = []awkwardCase{
	{"string containing a script close tag", "before </script> after"},
	{"URL with slashes, query and ampersand", "https://example.com/a/b/?next=/x/y&tag=a/b"},
	{"quotes, apostrophes and a backslash", `She said "it's fine", then \ backslash and 'single' quotes`},
	{"non-ASCII and emoji", "café, naïve, 日本語, 🥏 disc, 😀"},
	{"empty string", ""},
	{"nested maps and lists", map[string]any{
		"list": []any{"one", "two", []any{"deep"}},
		"map":  map[string]any{"inner": map[string]any{"k": "v"}},
	}},
	{"empty list and empty map", map[string]any{"list": []any{}, "map": map[string]any{}}},
	{"whole number 42", 42},
	{"negative decimal -7.5", -7.5},
	{"boolean true", true},
	{"boolean false", false},
}

// awkwardView draws the value prop as one paragraph. A string is drawn as it is; any other value is drawn as its JSON
// text, so the paragraph shows what the page object carries.
func awkwardView(props inertia.Props) gobi.Node {
	return gobi.El("main", gobi.El("p", gobi.Txt(show(props["value"]))))
}

// show is the text a value is drawn as: a string as it is, anything else as JSON.
func show(v any) string {
	if s, ok := v.(string); ok {
		return s
	}
	b, err := json.Marshal(v)
	if err != nil {
		panic(err)
	}
	return string(b)
}

// TestAwkwardPropPassesSameFirstPaint checks, one case at a time, that a page carrying an awkward prop has the same
// first paint as Inertia's own server-side rendering of that page object.
func TestAwkwardPropPassesSameFirstPaint(t *testing.T) {
	for _, c := range awkwardCases {
		t.Run(c.name, func(t *testing.T) {
			app, mux, ok := serve(t, awkwardView, inertia.Props{"value": c.value}, "/awkward")
			if !ok {
				return
			}
			var err error
			if !try(t, "oracle.SameFirstPaint", func() { err = oracle.SameFirstPaint(app, mux, "/awkward") }) {
				return
			}
			if err != nil {
				t.Errorf("first paint with prop value %#v differs from Inertia's own rendering: %v; expected byte identical bodies, because the page object must carry the prop exactly and render the same (https://inertiajs.com/the-protocol, first visit)", c.value, err)
			}
		})
	}
}

// TestAwkwardPropRoundTripsThroughPageObject checks, one case at a time, that the prop comes back out of the data-page
// script unchanged: decoding the page object gives the value as it was given (JSON round trip, so numbers arrive as
// float64). The protocol says props are sent as the page was given them (https://inertiajs.com/the-protocol, page
// object).
func TestAwkwardPropRoundTripsThroughPageObject(t *testing.T) {
	for _, c := range awkwardCases {
		t.Run(c.name, func(t *testing.T) {
			_, mux, ok := serve(t, awkwardView, inertia.Props{"value": c.value}, "/awkward")
			if !ok {
				return
			}
			rec, ok := fetch(t, mux, "/awkward", nil)
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
			want, ok := jsonValue(t, c.value)
			if !ok {
				return
			}
			got, has := page.Props["value"]
			if !has {
				t.Errorf("page object props has no value key; the prop was given, so the protocol says it is sent (https://inertiajs.com/the-protocol, page object)")
				return
			}
			if !reflect.DeepEqual(got, want) {
				t.Errorf("page object props.value = %#v, want %#v; the prop must round trip unchanged through the data-page script, with no escaping lost or added (https://inertiajs.com/the-protocol, page object)", got, want)
			}
		})
	}
}

// TestDataPageScriptEscapesSlashesAndAvoidsHTMLEntities checks the bytes inside the data-page script: forward slashes
// are escaped as \/ so a </script> can never end the script early, and the page object has no HTML entity encoding,
// so an ampersand in a URL is written as & and not as &amp;. The protocol says both (https://inertiajs.com/the-protocol,
// first visit).
func TestDataPageScriptEscapesSlashesAndAvoidsHTMLEntities(t *testing.T) {
	_, mux, ok := serve(t, awkwardView, inertia.Props{"value": "https://example.com/a/b?x=1&y=2 and </script>"}, "/awkward")
	if !ok {
		return
	}
	rec, ok := fetch(t, mux, "/awkward", nil)
	if !ok {
		return
	}
	raw, ok := dataPage(t, rec.Body.String())
	if !ok {
		return
	}
	if !strings.Contains(raw, `https:\/\/example.com\/a\/b`) {
		t.Errorf("data-page script holds %q, want the forward slashes of the URL escaped as \\/ (https:\\/\\/example.com\\/a\\/b); the protocol says forward slashes in that JSON must be escaped (https://inertiajs.com/the-protocol, first visit)", raw)
	}
	if !strings.Contains(raw, "\\u003c\\/script>") {
		t.Errorf("data-page script holds %q, want the </script> inside the string written as \\u003c\\/script> (less-than as \\u003c, slash as \\/), so that it cannot close the script; the tool's rules table (inertia/rules_test.go, escaping rows) and Inertia's own rendering agree on this form", raw)
	}
	for _, entity := range []string{"&amp;", "&lt;", "&gt;", "&quot;", "&#"} {
		if strings.Contains(raw, entity) {
			t.Errorf("data-page script holds HTML entity %q in %q; the protocol says HTML entity encoding is not allowed in the page object (https://inertiajs.com/the-protocol, first visit)", entity, raw)
		}
	}
}

// jsonValue returns v after a JSON round trip, which is the form the client decodes. ok is false (after reporting)
// when v cannot be encoded.
func jsonValue(t *testing.T, v any) (any, bool) {
	t.Helper()
	b, err := json.Marshal(v)
	if err != nil {
		t.Errorf("test setup: cannot encode %#v as JSON: %v", v, err)
		return nil, false
	}
	var out any
	if err := json.Unmarshal(b, &out); err != nil {
		t.Errorf("test setup: cannot decode %s back from JSON: %v", b, err)
		return nil, false
	}
	return out, true
}
