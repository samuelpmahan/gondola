package gobi

// HTML writes a Node the way react-dom/server's renderToStaticMarkup does. React is the golden reference: every rule in
// this file was found by rendering with React 19.3.1 and reading the output, and each has a row in rules_test.go.
// Nothing here calls a method through an interface or passes a function around (PORTING.md rule 2).
func HTML(n Node) string {
	s := htmlState{}
	s.write(n, selectScope{})
	return joinSurrogates(s.preloads + s.out)
}

// htmlState is the output so far. preloads holds the <link> tags React hoists to the front for images.
type htmlState struct {
	out      string
	preloads string
	seen     []string // image sources already preloaded
}

// selectScope is the value of the nearest enclosing <select>, which decides which <option>s are selected.
type selectScope struct {
	has   bool
	value string
}

var void = map[string]bool{"area": true, "base": true, "br": true, "col": true, "embed": true, "hr": true, "img": true,
	"input": true, "link": true, "meta": true, "source": true, "track": true, "wbr": true}

// written is one attribute as it will appear: the name React writes and the text after the equals sign.
type written struct {
	name string
	text string // ` name="value"` or ` name=""`
}

func (s *htmlState) write(n Node, scope selectScope) {
	switch n.Kind {
	case Text:
		s.out += escape(n.Text)
	case Fragment:
		for _, k := range n.Kids {
			s.write(k, scope)
		}
	case Element:
		s.element(n, scope)
	}
}

func (s *htmlState) element(n Node, scope selectScope) {
	attrs, textareaValue, hasTextareaValue := s.attributes(n, scope)
	s.out += "<" + n.Tag
	for _, a := range attrs {
		s.out += a.text
	}
	if void[n.Tag] {
		s.out += "/>"
		return
	}
	s.out += ">"
	switch n.Tag {
	case "textarea":
		// The value, or the single text child, is the content; a leading newline gets a second one because HTML
		// parsers drop the first (rule "textarea leading newline").
		content := textareaValue
		if !hasTextareaValue && len(n.Kids) == 1 && n.Kids[0].Kind == Text {
			content = n.Kids[0].Text
		}
		if len(content) > 0 && content[0] == '\n' {
			s.out += "\n"
		}
		s.out += escape(content)
	case "select":
		inner := selectScope{}
		for _, a := range n.Attrs {
			if a.Name == "value" && !a.Flag {
				inner = selectScope{has: true, value: a.Value}
			}
		}
		for _, k := range n.Kids {
			s.write(k, inner)
		}
	default:
		for _, k := range n.Kids {
			s.write(k, scope)
		}
	}
	s.out += "</" + n.Tag + ">"
}

// attributes works out the attributes React writes for an element, in React's order, and the textarea's value.
func (s *htmlState) attributes(n Node, scope selectScope) ([]written, string, bool) {
	var list []written
	var textareaValue string
	hasTextareaValue := false
	flagSelected := false
	for _, a := range n.Attrs {
		switch {
		case a.Flag:
			switch {
			case a.Name == "selected":
				flagSelected = n.Tag == "option"
			case a.Name == "checked":
				if n.Tag == "input" {
					list = append(list, written{"checked", ` checked=""`})
				}
			case isBoolean(a.Name):
				name := outputName(a.Name)
				list = append(list, written{name, " " + name + `=""`})
			case hasPrefix(a.Name, "data-") || hasPrefix(a.Name, "aria-"):
				list = append(list, written{a.Name, " " + a.Name + `="true"`})
			}
		case a.Name == "style":
			css := styleText(a.Style)
			if css != "" {
				list = append(list, written{"style", ` style="` + escape(css) + `"`})
			}
		case a.Name == "value" && n.Tag == "textarea":
			textareaValue, hasTextareaValue = a.Value, true
		case a.Name == "value" && n.Tag == "select":
		case a.Name == "src" && a.Value == "", a.Name == "href" && a.Value == "" && n.Tag != "a":
		case a.Name == "rowspan" && numberIsNaN(a.Value):
		default:
			name := outputName(a.Name)
			value := a.Value
			if (a.Name == "href" || a.Name == "src") && isJavascriptURL(value) {
				value = blockedURL
			}
			list = append(list, written{name, " " + name + `="` + escape(value) + `"`})
		}
	}
	if n.Tag == "input" {
		list = inputOrder(list)
	}
	if n.Tag == "button" {
		list = nameLast(list)
	}
	if n.Tag == "option" {
		selected := flagSelected
		if scope.has {
			selected = optionMatches(n, scope.value)
		}
		if selected {
			list = append(list, written{"selected", ` selected=""`})
		}
	}
	if n.Tag == "img" {
		s.preloadImage(n)
	}
	return list, textareaValue, hasTextareaValue
}

// inputOrder moves name, checked and value to the end, in that order ("input attribute order").
func inputOrder(list []written) []written {
	var out []written
	for _, a := range list {
		if a.name != "name" && a.name != "checked" && a.name != "value" {
			out = append(out, a)
		}
	}
	for _, last := range []string{"name", "checked", "value"} {
		for _, a := range list {
			if a.name == last {
				out = append(out, a)
			}
		}
	}
	return out
}

// nameLast moves the name attribute of a <button> to the end ("button name goes last").
func nameLast(list []written) []written {
	var out []written
	for _, a := range list {
		if a.name != "name" {
			out = append(out, a)
		}
	}
	for _, a := range list {
		if a.name == "name" {
			out = append(out, a)
		}
	}
	return out
}

// optionMatches says whether an <option> is selected by its <select>'s value: it compares the option's value attribute,
// or, with none, its text when every child is text.
func optionMatches(n Node, value string) bool {
	for _, a := range n.Attrs {
		if a.Name == "value" && !a.Flag {
			return a.Value == value
		}
	}
	text := ""
	for _, k := range n.Kids {
		if k.Kind != Text {
			return false
		}
		text += k.Text
	}
	return joinSurrogates(text) == joinSurrogates(value)
}

const blockedURL = "javascript:throw new Error('React has blocked a javascript: URL as a security precaution.')"

// isJavascriptURL says whether a URL starts with javascript: once leading control characters and spaces are skipped,
// ignoring case and allowing tab, newline and carriage return between its letters (rule "javascript URL blocked").
func isJavascriptURL(url string) bool {
	i := 0
	for i < len(url) && (url[i] <= 0x1F || url[i] == ' ') {
		i++
	}
	word := "javascript"
	for w := 0; w < len(word); w++ {
		for i < len(url) && (url[i] == '\t' || url[i] == '\n' || url[i] == '\r') && w > 0 {
			i++
		}
		if i >= len(url) {
			return false
		}
		c := url[i]
		if c >= 'A' && c <= 'Z' {
			c = c - 'A' + 'a'
		}
		if c != word[w] {
			return false
		}
		i++
	}
	for i < len(url) && (url[i] == '\t' || url[i] == '\n' || url[i] == '\r') {
		i++
	}
	return i < len(url) && url[i] == ':'
}

// joinSurrogates turns a high surrogate followed by a low surrogate, each written as its own three bytes, into the one
// four-byte character JavaScript would make of them. Go builds text by joining pieces; JavaScript joins code units.
func joinSurrogates(s string) string {
	found := false
	for i := 0; i+5 < len(s); i++ {
		if s[i] == 0xED && s[i+1] >= 0xA0 && s[i+1] <= 0xAF && s[i+3] == 0xED && s[i+4] >= 0xB0 && s[i+4] <= 0xBF {
			found = true
		}
	}
	if !found {
		return s
	}
	out := ""
	for i := 0; i < len(s); i++ {
		if s[i] == 0xED && i+5 < len(s) && s[i+1] >= 0xA0 && s[i+1] <= 0xAF && s[i+3] == 0xED && s[i+4] >= 0xB0 && s[i+4] <= 0xBF {
			high := 0xD000 + int(s[i+1]&0x3F)<<6 + int(s[i+2]&0x3F)
			low := 0xD000 + int(s[i+4]&0x3F)<<6 + int(s[i+5]&0x3F)
			r := 0x10000 + (high-0xD800)<<10 + (low - 0xDC00)
			out += string([]byte{byte(0xF0 | r>>18), byte(0x80 | r>>12&0x3F), byte(0x80 | r>>6&0x3F), byte(0x80 | r&0x3F)})
			i += 5
			continue
		}
		out += s[i : i+1]
	}
	return out
}

// preloadImage adds the <link rel="preload"> React writes in front of the whole output for the first <img> with each src.
func (s *htmlState) preloadImage(n Node) {
	src, hasSrc, typeValue, hasType := "", false, "", false
	for _, a := range n.Attrs {
		if a.Name == "src" && !a.Flag {
			src, hasSrc = a.Value, true
		}
		if a.Name == "type" && !a.Flag {
			typeValue, hasType = a.Value, true
		}
	}
	if !hasSrc || src == "" || hasPrefixFold(src, "data:") {
		return
	}
	for _, seen := range s.seen {
		if seen == src {
			return
		}
	}
	s.seen = append(s.seen, src)
	if isJavascriptURL(src) {
		src = blockedURL
	}
	link := `<link rel="preload" as="image" href="` + escape(src) + `"`
	if hasType {
		link += ` type="` + escape(typeValue) + `"`
	}
	s.preloads += link + "/>"
}

// styleText writes style declarations as React does: one declaration per style key (a repeated key keeps its first
// place and its last value), values trimmed, empty values dropped.
func styleText(styles []Style) string {
	var keys, values []string
	for _, st := range styles {
		key := StyleKey(st.Property)
		found := false
		for i := range keys {
			if keys[i] == key {
				values[i] = st.Value
				found = true
			}
		}
		if !found {
			keys = append(keys, key)
			values = append(values, st.Value)
		}
	}
	css := ""
	for i := range keys {
		if values[i] == "" {
			continue
		}
		if css != "" {
			css += ";"
		}
		css += hyphenate(keys[i]) + ":" + trimJS(values[i])
	}
	return css
}

// hyphenate turns a style key back into a CSS property: Webkit becomes -webkit-, ms becomes -ms-, capitals become -x.
func hyphenate(key string) string {
	if len(key) >= 2 && key[0] == '-' && key[1] == '-' {
		return key
	}
	if len(key) > 2 && key[:2] == "ms" && key[2] >= 'A' && key[2] <= 'Z' {
		key = "-" + key
	}
	out := ""
	for i := 0; i < len(key); i++ {
		c := key[i]
		if c >= 'A' && c <= 'Z' {
			out += "-" + string(rune(c-'A'+'a'))
		} else {
			out += key[i : i+1]
		}
	}
	return out
}

func hasPrefix(s, prefix string) bool { return len(s) >= len(prefix) && s[:len(prefix)] == prefix }

// hasPrefixFold is hasPrefix with ASCII letters compared without regard to case; prefix is lower case.
func hasPrefixFold(s, prefix string) bool {
	if len(s) < len(prefix) {
		return false
	}
	for i := 0; i < len(prefix); i++ {
		c := s[i]
		if c >= 'A' && c <= 'Z' {
			c = c - 'A' + 'a'
		}
		if c != prefix[i] {
			return false
		}
	}
	return true
}

// isJSSpace is JavaScript's idea of white space for String.prototype.trim and Number().
func isJSSpace(r rune) bool {
	switch r {
	case '\t', '\n', '\v', '\f', '\r', ' ', 0xA0, 0x1680, 0x2028, 0x2029, 0x202F, 0x205F, 0x3000, 0xFEFF:
		return true
	}
	return r >= 0x2000 && r <= 0x200A
}

// trimJS removes JavaScript white space from both ends.
func trimJS(s string) string {
	start, end := len(s), len(s)
	lastWasText := false
	for i, r := range s {
		if isJSSpace(r) {
			if lastWasText {
				end = i
			}
			lastWasText = false
			continue
		}
		if start == len(s) {
			start = i
		}
		lastWasText = true
		end = len(s)
	}
	if start == len(s) {
		return ""
	}
	return s[start:end]
}

// numberIsNaN says whether JavaScript's Number(s) is NaN: after trimming, empty is 0; otherwise a decimal literal
// (optional sign, digits with an optional point and exponent, or Infinity) or an unsigned 0x, 0o or 0b literal.
func numberIsNaN(s string) bool {
	s = trimJS(s)
	if s == "" {
		return false
	}
	if len(s) > 2 && s[0] == '0' {
		base := 0
		switch s[1] {
		case 'x', 'X':
			base = 16
		case 'o', 'O':
			base = 8
		case 'b', 'B':
			base = 2
		}
		if base != 0 {
			for i := 2; i < len(s); i++ {
				if digitValue(s[i]) >= base {
					return true
				}
			}
			return false
		}
	}
	i := 0
	if s[i] == '+' || s[i] == '-' {
		i++
	}
	if s[i:] == "Infinity" {
		return false
	}
	digits := 0
	for i < len(s) && s[i] >= '0' && s[i] <= '9' {
		i++
		digits++
	}
	if i < len(s) && s[i] == '.' {
		i++
		for i < len(s) && s[i] >= '0' && s[i] <= '9' {
			i++
			digits++
		}
	}
	if digits == 0 {
		return true
	}
	if i < len(s) && (s[i] == 'e' || s[i] == 'E') {
		i++
		if i < len(s) && (s[i] == '+' || s[i] == '-') {
			i++
		}
		exponent := 0
		for i < len(s) && s[i] >= '0' && s[i] <= '9' {
			i++
			exponent++
		}
		if exponent == 0 {
			return true
		}
	}
	return i != len(s)
}

func digitValue(c byte) int {
	switch {
	case c >= '0' && c <= '9':
		return int(c - '0')
	case c >= 'a' && c <= 'f':
		return int(c-'a') + 10
	case c >= 'A' && c <= 'F':
		return int(c-'A') + 10
	}
	return 99
}

// escape writes text as React does: & < > " ' become &amp; &lt; &gt; &quot; &#x27;. Other bytes, lone surrogates
// included, pass through untouched.
func escape(s string) string {
	out := ""
	for i := 0; i < len(s); i++ {
		switch s[i] {
		case '&':
			out += "&amp;"
		case '<':
			out += "&lt;"
		case '>':
			out += "&gt;"
		case '"':
			out += "&quot;"
		case '\'':
			out += "&#x27;"
		default:
			out += s[i : i+1]
		}
	}
	return out
}
