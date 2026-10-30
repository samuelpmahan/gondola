package gobi_test

// The rules table: every row is something react-dom/server (React 19.3.1) was seen to do, as a Node and the exact HTML
// React wrote for it. TestRulesGo checks Go's writer against the recorded HTML; TestRulesAgainstReact renders the same
// Nodes with React and checks the recorded HTML is still what React writes, so a row cannot drift from the oracle.

import (
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"

	"github.com/samuelpmahan/gondola/gobi"
	"github.com/samuelpmahan/gondola/wire"
)

type rule struct {
	Name string
	Node gobi.Node
	HTML string
}

var el, txt, frag, css = gobi.El, gobi.Txt, gobi.Frag, gobi.S

// kids returns n with the given children.
func kids(n gobi.Node, children ...gobi.Node) gobi.Node {
	n.Kids = children
	return n
}

func rules() []rule {
	return []rule{
		{"text escapes & < > \" '", el("p", txt(`<&>"'`)), "<p>&lt;&amp;&gt;&quot;&#x27;</p>"},
		{"attribute value escapes the same five", el("b").Set("title", `"<&'>`), "<b title=\"&quot;&lt;&amp;&#x27;&gt;\"></b>"},
		{"adjacent text nodes join with no marker", el("p", txt("Count: "), txt("3")), "<p>Count: 3</p>"},
		{"empty text writes nothing", frag(txt(""), txt("")), ""},
		{"fragment writes only its children", frag(el("i"), txt("t")), "<i></i>t"},
		{"a Text root is just the text", txt("hi"), "hi"},
		{"handlers and keys are dropped", el("button", txt("+")).Handle("click", "add", "").Keyed("k"), "<button>+</button>"},
		{"void elements close with />", frag(el("br"), el("hr"), el("input").Set("id", "a")), "<br/><hr/><input id=\"a\"/>"},
		{"flag attribute writes name=\"\"", el("div").Flag("hidden").Flag("disabled"), "<div hidden=\"\" disabled=\"\"></div>"},
		{"empty attribute value is kept", el("div").Set("class", "").Set("data-x", "").Set("aria-label", ""), "<div class=\"\" data-x=\"\" aria-label=\"\"></div>"},
		{"data- and aria- flags write \"true\"", el("div").Flag("data-x").Flag("aria-hidden"), "<div data-x=\"true\" aria-hidden=\"true\"></div>"},
		{"a flag React does not know is dropped", el("div").Flag("foo"), "<div></div>"},
		{"class for tabindex use the DOM names", el("label").Set("class", "a").Set("for", "b").Set("tabindex", "3"), "<label class=\"a\" for=\"b\" tabindex=\"3\"></label>"},
		{"svg attribute keeps viewBox and hyphens", el("svg").Set("viewBox", "0 0 1 1").Set("stroke-width", "2"), "<svg viewBox=\"0 0 1 1\" stroke-width=\"2\"></svg>"},
		{"maxlength minlength colspan are written in camelCase", el("td").Set("maxlength", "3").Set("minlength", "1").Set("colspan", "2"), "<td maxLength=\"3\" minLength=\"1\" colSpan=\"2\"></td>"},
		{"readonly flag is written readOnly", el("input").Flag("readonly"), "<input readOnly=\"\"/>"},
		{"rowspan is camelCase and kept when Number() is a number", el("td").Set("rowspan", " 12 "), "<td rowSpan=\" 12 \"></td>"},
		{"rowspan is dropped when Number() is NaN", el("td").Set("rowspan", "12px"), "<td></td>"},
		{"rowspan empty counts as 0 and is kept", el("td").Set("rowspan", ""), "<td rowSpan=\"\"></td>"},
		{"rowspan hex and exponent are numbers", frag(el("td").Set("rowspan", "0x10"), el("td").Set("rowspan", "1e3"), el("td").Set("rowspan", "1_0")), "<td rowSpan=\"0x10\"></td><td rowSpan=\"1e3\"></td><td></td>"},
		{"checked is written only on input", frag(el("td").Flag("checked"), el("input").Flag("checked")), "<td></td><input checked=\"\"/>"},
		{"selected is written only on option", frag(el("td").Flag("selected"), el("option").Flag("selected")), "<td></td><option selected=\"\"></option>"},
		{"href=\"\" is dropped except on a", frag(el("a").Set("href", ""), el("div").Set("href", "")), "<a href=\"\"></a><div></div>"},
		{"src=\"\" is dropped", el("div").Set("src", ""), "<div></div>"},
		{"javascript: URL in href is replaced", el("a").Set("href", "javascript:alert(1)"), "<a href=\"javascript:throw new Error(&#x27;React has blocked a javascript: URL as a security precaution.&#x27;)\"></a>"},
		{"javascript: URL is found through leading space, case and inner newlines", el("div").Set("src", "  JAVA\nscript:x"), "<div src=\"javascript:throw new Error(&#x27;React has blocked a javascript: URL as a security precaution.&#x27;)\"></div>"},
		{"javascript without a colon is left alone", el("a").Set("href", "javascript").Set("title", "xjavascript:a"), "<a href=\"javascript\" title=\"xjavascript:a\"></a>"},
		{"style joins declarations with ; and keeps vendor and custom names", el("i").Css(css("font-size", "12px"), css("-webkit-line-clamp", "2"), css("-ms-filter", "x"), css("--Mixed-Case", "1")), "<i style=\"font-size:12px;-webkit-line-clamp:2;-ms-filter:x;--Mixed-Case:1\"></i>"},
		{"style values are trimmed and kept verbatim otherwise", el("i").Css(css("width", "  8px  "), css("height", "12PX"), css("margin-top", "0")), "<i style=\"width:8px;height:12PX;margin-top:0\"></i>"},
		{"style with only empty values writes no attribute", el("i").Css(css("width", "")), "<i></i>"},
		{"style custom property of spaces keeps its name", el("i").Css(css("--x", "  ")), "<i style=\"--x:\"></i>"},
		{"style property repeated keeps first place and last value", el("i").Css(css("color", "red"), css("width", "1px"), css("color", "blue")), "<i style=\"color:blue;width:1px\"></i>"},
		{"style value escapes", el("i").Css(css("color", `"'<&`)), "<i style=\"color:&quot;&#x27;&lt;&amp;\"></i>"},
		{"img with src preloads it at the very front", el("div", txt("t"), el("img").Set("src", "a.png").Set("alt", "x")), "<link rel=\"preload\" as=\"image\" href=\"a.png\"/><div>t<img src=\"a.png\" alt=\"x\"/></div>"},
		{"img preloads are deduplicated by src, first type wins", el("div", el("img").Set("src", "a"), el("img").Set("src", "a").Set("type", "t"), el("img").Set("src", "b").Set("type", "t")), "<link rel=\"preload\" as=\"image\" href=\"a\"/><link rel=\"preload\" as=\"image\" href=\"b\" type=\"t\"/><div><img src=\"a\"/><img src=\"a\" type=\"t\"/><img src=\"b\" type=\"t\"/></div>"},
		{"img preload is skipped for data: URLs in any case", frag(el("img").Set("src", "data:x"), el("img").Set("src", "DATA:x")), "<img src=\"data:x\"/><img src=\"DATA:x\"/>"},
		{"img preload carries the blocked javascript URL", el("img").Set("src", "javascript:void(0)"), "<link rel=\"preload\" as=\"image\" href=\"javascript:throw new Error(&#x27;React has blocked a javascript: URL as a security precaution.&#x27;)\"/><img src=\"javascript:throw new Error(&#x27;React has blocked a javascript: URL as a security precaution.&#x27;)\"/>"},
		{"img without src or with empty src preloads nothing", frag(el("img").Set("alt", "a"), el("img").Set("src", "")), "<img alt=\"a\"/><img/>"},
		{"input writes name, then checked, then value last", el("input").Set("value", "v").Set("name", "n").Flag("checked").Set("id", "i").Set("type", "checkbox"), "<input id=\"i\" type=\"checkbox\" name=\"n\" checked=\"\" value=\"v\"/>"},
		{"button writes name last", el("button").Set("name", "n").Set("id", "i").Set("value", "v"), "<button id=\"i\" value=\"v\" name=\"n\"></button>"},
		{"textarea value becomes its content", el("textarea").Set("id", "i").Set("value", "a<b"), "<textarea id=\"i\">a&lt;b</textarea>"},
		{"textarea child text becomes its content", el("textarea", txt("hi")), "<textarea>hi</textarea>"},
		{"textarea content starting with a newline gets one more", frag(el("textarea", txt("\nhi")), el("textarea").Set("value", "\n"), el("textarea", txt("a\nb")), el("textarea").Set("value", "\r\nx")), "<textarea>\n\nhi</textarea><textarea>\n\n</textarea><textarea>a\nb</textarea><textarea>\r\nx</textarea>"},
		{"textarea drops checked and selected", el("textarea").Flag("checked").Flag("selected"), "<textarea></textarea>"},
		{"select value selects the option with that value", kids(el("select").Set("value", "b").Set("id", "s"), el("option").Set("value", "a"), el("option").Set("value", "b")), "<select id=\"s\"><option value=\"a\"></option><option value=\"b\" selected=\"\"></option></select>"},
		{"select value matches option text when it has no value attribute", kids(el("select").Set("value", "B"), el("option", txt("A")), el("option", txt("B"))), "<select><option>A</option><option selected=\"\">B</option></select>"},
		{"select value matches option text made of several text children", kids(el("select").Set("value", "AB"), el("option", txt("A"), txt("B"))), "<select><option selected=\"\">AB</option></select>"},
		{"select value does not match option text that holds an element", kids(el("select").Set("value", "AB"), el("option", txt("A"), el("b", txt("B")))), "<select><option>A<b>B</b></option></select>"},
		{"select value empty matches an option with value empty", kids(el("select").Set("value", ""), el("option").Set("value", ""), el("option").Set("value", "a")), "<select><option value=\"\" selected=\"\"></option><option value=\"a\"></option></select>"},
		{"select value selects every option with that value", kids(el("select").Set("value", "a"), el("option").Set("value", "a"), el("option").Set("value", "a")), "<select><option value=\"a\" selected=\"\"></option><option value=\"a\" selected=\"\"></option></select>"},
		{"select value reaches options inside other elements and fragments", kids(el("select").Set("value", "a"), el("div", el("option").Set("value", "a")), frag(el("option").Set("value", "a"))), "<select><div><option value=\"a\" selected=\"\"></option></div><option value=\"a\" selected=\"\"></option></select>"},
		{"a nested select starts its own value", kids(el("select").Set("value", "a"), el("select", el("option").Set("value", "a"))), "<select><select><option value=\"a\"></option></select></select>"},
		{"select value overrides the selected flag of its options", kids(el("select").Set("value", "b"), el("option").Set("value", "a").Flag("selected"), el("option").Set("value", "b")), "<select><option value=\"a\"></option><option value=\"b\" selected=\"\"></option></select>"},
		{"selected flag counts when the select has no value", kids(el("select"), el("option").Set("value", "a").Flag("selected"), el("option").Set("value", "b").Flag("selected")), "<select><option value=\"a\" selected=\"\"></option><option value=\"b\" selected=\"\"></option></select>"},
		{"an option outside a select keeps its selected flag, written last", el("option").Flag("selected").Set("id", "i").Set("value", "a"), "<option id=\"i\" value=\"a\" selected=\"\"></option>"},
		{"lone surrogates pass through", el("p", txt("\xed\xa0\x80")).Set("title", "\xed\xb0\x80"), "<p title=\"\xed\xb0\x80\">\xed\xa0\x80</p>"},
		{"adjacent lone surrogates join into one character", frag(txt("\xed\xa0\xbd"), txt("\xed\xb8\x80")), "😀"},
		{"emoji and non-ASCII are written as they are", el("span", txt("Café ✓ 🥏")).Set("title", "日本語"), "<span title=\"日本語\">Café ✓ 🥏</span>"},
		{"NUL and CR LF pass through", el("p", txt("a\x00b\r\nc")).Set("title", "a\tb"), "<p title=\"a\tb\">a\x00b\r\nc</p>"},
	}
}

func TestRulesGo(t *testing.T) {
	for _, r := range rules() {
		if got := gobi.HTML(r.Node); got != r.HTML {
			t.Errorf("%s\n  want %s\n  got  %s", r.Name, wire.Quote(r.HTML), wire.Quote(got))
		}
	}
}

// TestRulesAgainstReact renders every row with React 19.3.1 (through node) and compares with the recorded HTML.
// GOBI_RULES_PRINT=1 prints what React wrote for each row, as Go string literals, to fill in a new row.
func TestRulesAgainstReact(t *testing.T) {
	root, _ := filepath.Abs("..")
	if _, err := os.Stat(filepath.Join(root, "node_modules", "react")); err != nil {
		t.Skip("npm install has not been run; no oracle")
	}
	var cases []wire.Case
	for i, r := range rules() {
		cases = append(cases, wire.Case{Name: fmt.Sprintf("rule-%03d", i), Node: r.Node})
	}
	dir := t.TempDir()
	if err := os.WriteFile(filepath.Join(dir, "cases.json"), wire.EncodeCases(cases), 0o644); err != nil {
		t.Fatal(err)
	}
	command := exec.Command("node", "react-side.mjs", filepath.Join(dir, "cases.json"), filepath.Join(dir, "out.json"))
	command.Dir = root
	if out, err := command.CombinedOutput(); err != nil {
		t.Fatalf("node: %v\n%s", err, out)
	}
	data, _ := os.ReadFile(filepath.Join(dir, "out.json"))
	results, err := wire.DecodeResults(data)
	if err != nil || len(results) != len(cases) {
		t.Fatalf("results: %v", err)
	}
	print := os.Getenv("GOBI_RULES_PRINT") != ""
	for i, r := range rules() {
		if print {
			fmt.Printf("%s\t%s\n", r.Name, strings.TrimSpace(quoteGo(results[i].HTML+results[i].Error)))
			continue
		}
		if results[i].Error != "" || results[i].HTML != r.HTML {
			t.Errorf("%s\n  recorded %s\n  React    %s %s", r.Name, wire.Quote(r.HTML), wire.Quote(results[i].HTML), results[i].Error)
		}
	}
}

// quoteGo writes WTF-8 text as a Go string literal that keeps lone surrogates as \x escapes.
func quoteGo(s string) string {
	var b strings.Builder
	b.WriteByte('"')
	for i := 0; i < len(s); {
		c := s[i]
		switch {
		case c == '"' || c == '\\':
			b.WriteByte('\\')
			b.WriteByte(c)
		case c == '\n':
			b.WriteString(`\n`)
		case c == '\r':
			b.WriteString(`\r`)
		case c == '\t':
			b.WriteString(`\t`)
		case c < 0x20:
			fmt.Fprintf(&b, `\x%02x`, c)
		case c == 0xED && i+2 < len(s) && s[i+1] >= 0xA0:
			fmt.Fprintf(&b, `\x%02x\x%02x\x%02x`, s[i], s[i+1], s[i+2])
			i += 3
			continue
		default:
			b.WriteByte(c)
		}
		i++
	}
	b.WriteByte('"')
	return b.String()
}
