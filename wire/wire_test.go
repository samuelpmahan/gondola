package wire

import (
	"reflect"
	"strings"
	"testing"

	"github.com/samuelpmahan/gondola/gobi"
)

var samples = []string{"", "plain", `<&>"'`, "\n\t\r", "\u0000", "Café", "日本語", "🥏", "\xed\xa0\x80", "\xed\xb0\x80",
	"a\xed\xa0\x80z", "\xed\xb8\x80\xed\xa0\xbd"}

func TestQuoteRoundTrip(t *testing.T) {
	for _, s := range samples {
		q := Quote(s)
		for i := 0; i < len(q); i++ {
			if q[i] >= 0x7F || q[i] < 0x20 {
				t.Fatalf("Quote(%q) = %q is not plain ASCII", s, q)
			}
		}
		back, err := Unquote(q)
		if err != nil || back != s {
			t.Errorf("Unquote(Quote(%q)) = %q, %v", s, back, err)
		}
	}
}

func TestDecodeSurrogates(t *testing.T) {
	cases, err := DecodeCases([]byte(`[{"Name":"x","Node":{"Kind":2,"Text":"\ud800|🥏|\udc00|é"}}]`))
	if err != nil {
		t.Fatal(err)
	}
	if want := "\xed\xa0\x80|🥏|\xed\xb0\x80|é"; cases[0].Node.Text != want {
		t.Errorf("got %q want %q", cases[0].Node.Text, want)
	}
}

func TestCasesRoundTrip(t *testing.T) {
	n := gobi.El("div", gobi.Txt("a\xed\xa0\x80"), gobi.Frag(gobi.El("input").Set("class", "x\xed\xb0\x80").Flag("disabled").Keyed("k"))).
		Css(gobi.S("font-size", "12px"), gobi.S("--c", "")).Handle("click", "m", "a")
	in := []Case{{"case-00000", n}, {"case-00001", gobi.Txt("🥏")}, {"case-00002", gobi.Frag()}}
	out, err := DecodeCases(EncodeCases(in))
	if err != nil || !reflect.DeepEqual(in, out) {
		t.Fatalf("round trip differs: %v\n%v\n%v", err, in, out)
	}
}

func TestCanonicalStable(t *testing.T) {
	n := gobi.El("p", gobi.Txt("é🥏\xed\xa0\x80")).Set("title", "<")
	a, b := Canonical(n), Canonical(n)
	if a != b {
		t.Error("not stable")
	}
	for i := 0; i < len(a); i++ {
		if a[i] >= 0x80 {
			t.Fatalf("non-ASCII byte in %q", a)
		}
	}
	if !strings.HasPrefix(a, `{"Kind":1,"Tag":"p","Attrs":[{"Name":"title","Value":"<"`[:30]) {
		t.Errorf("unexpected order: %s", a)
	}
}

func TestUnits(t *testing.T) {
	for _, s := range samples {
		if back := FromUnits(ToUnits(s)); back != s {
			t.Errorf("%q -> %q", s, back)
		}
	}
	if u := ToUnits("🥏"); len(u) != 2 || u[0] != 0xD83E || u[1] != 0xDD4F {
		t.Errorf("pair units %x", u)
	}
}

func TestResultsRoundTrip(t *testing.T) {
	in := []Result{{Name: "a", HTML: "<p>\xed\xa0\x80</p>"}, {Name: "b", Error: "boom"}}
	out, err := DecodeResults(EncodeResults(in))
	if err != nil || !reflect.DeepEqual(in, out) {
		t.Fatalf("%v %v %v", err, in, out)
	}
}

func TestMalformed(t *testing.T) {
	for _, bad := range []string{`[{"Name":`, `[{"Name":"a"} x]`, `[{"Name":"\u12"}]`} {
		if _, err := DecodeCases([]byte(bad)); err == nil {
			t.Errorf("no error for %q", bad)
		}
	}
}
