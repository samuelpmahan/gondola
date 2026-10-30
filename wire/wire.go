// Package wire moves Nodes and results between JavaScript and Go without losing text. JavaScript strings may hold lone
// surrogates, which Go's encoding/json turns into U+FFFD, so this package reads and writes JSON itself and keeps text in
// Go strings as WTF-8: UTF-8, except that a lone surrogate is stored as its own 3-byte form.
package wire

import (
	"errors"
	"fmt"
	"strconv"
	"strings"

	"github.com/samuelpmahan/gondola/gobi"
)

// Case is one generated input: a name and the Node to render.
type Case struct {
	Name string
	Node gobi.Node
}

// Result is what the React side reports for one case: its HTML, or the error React raised.
type Result struct{ Name, HTML, Error string }

// ToUnits turns WTF-8 text into UTF-16 code units, the way JavaScript sees the same text.
func ToUnits(s string) []uint16 {
	var units []uint16
	for i := 0; i < len(s); {
		r, size := decodeWTF8(s[i:])
		i += size
		if r >= 0x10000 {
			r -= 0x10000
			units = append(units, uint16(0xD800+(r>>10)), uint16(0xDC00+(r&0x3FF)))
		} else {
			units = append(units, uint16(r))
		}
	}
	return units
}

// FromUnits turns UTF-16 code units into WTF-8 text: valid pairs combine, lone surrogates stay.
func FromUnits(units []uint16) string {
	var b strings.Builder
	for i := 0; i < len(units); i++ {
		u := rune(units[i])
		if u >= 0xD800 && u < 0xDC00 && i+1 < len(units) && units[i+1] >= 0xDC00 && units[i+1] < 0xE000 {
			u = 0x10000 + (u-0xD800)<<10 + (rune(units[i+1]) - 0xDC00)
			i++
		}
		appendWTF8(&b, u)
	}
	return b.String()
}

// appendWTF8 writes one code point (a surrogate included) in UTF-8 form.
func appendWTF8(b *strings.Builder, r rune) {
	switch {
	case r < 0x80:
		b.WriteByte(byte(r))
	case r < 0x800:
		b.WriteByte(byte(0xC0 | r>>6))
		b.WriteByte(byte(0x80 | r&0x3F))
	case r < 0x10000:
		b.WriteByte(byte(0xE0 | r>>12))
		b.WriteByte(byte(0x80 | r>>6&0x3F))
		b.WriteByte(byte(0x80 | r&0x3F))
	default:
		b.WriteByte(byte(0xF0 | r>>18))
		b.WriteByte(byte(0x80 | r>>12&0x3F))
		b.WriteByte(byte(0x80 | r>>6&0x3F))
		b.WriteByte(byte(0x80 | r&0x3F))
	}
}

// decodeWTF8 reads one code point from the front of s and says how many bytes it took. A stray byte decodes as itself.
func decodeWTF8(s string) (rune, int) {
	c := s[0]
	switch {
	case c < 0x80:
		return rune(c), 1
	case c >= 0xC0 && c < 0xE0 && len(s) >= 2:
		return rune(c&0x1F)<<6 | rune(s[1]&0x3F), 2
	case c >= 0xE0 && c < 0xF0 && len(s) >= 3:
		return rune(c&0x0F)<<12 | rune(s[1]&0x3F)<<6 | rune(s[2]&0x3F), 3
	case c >= 0xF0 && len(s) >= 4:
		return rune(c&0x07)<<18 | rune(s[1]&0x3F)<<12 | rune(s[2]&0x3F)<<6 | rune(s[3]&0x3F), 4
	}
	return rune(c), 1
}

// Quote writes WTF-8 text as an ASCII-only JSON string literal: non-ASCII as \uXXXX code units, so lone surrogates
// survive and a line never holds a raw newline.
func Quote(s string) string {
	var b strings.Builder
	b.WriteByte('"')
	for _, u := range ToUnits(s) {
		switch {
		case u == '"':
			b.WriteString(`\"`)
		case u == '\\':
			b.WriteString(`\\`)
		case u == '\n':
			b.WriteString(`\n`)
		case u == '\r':
			b.WriteString(`\r`)
		case u == '\t':
			b.WriteString(`\t`)
		case u < 0x20 || u >= 0x7F:
			fmt.Fprintf(&b, `\u%04x`, u)
		default:
			b.WriteByte(byte(u))
		}
	}
	b.WriteByte('"')
	return b.String()
}

// Unquote reads a JSON string literal (raw UTF-8 or \u escapes) into WTF-8 text.
func Unquote(literal string) (string, error) {
	r := reader{text: literal}
	s, err := r.str()
	if err != nil {
		return "", err
	}
	r.skip()
	if r.at < len(r.text) {
		return "", errors.New("wire: text after string literal")
	}
	return s, nil
}

// Canonical is the one text form of a Node: compact JSON, fixed field order, zero values left out.
func Canonical(n gobi.Node) string {
	var b strings.Builder
	writeNode(&b, n)
	return b.String()
}

func writeNode(b *strings.Builder, n gobi.Node) {
	fmt.Fprintf(b, `{"Kind":%d`, n.Kind)
	if n.Tag != "" {
		b.WriteString(`,"Tag":` + Quote(n.Tag))
	}
	if n.Key != "" {
		b.WriteString(`,"Key":` + Quote(n.Key))
	}
	if len(n.Attrs) > 0 {
		b.WriteString(`,"Attrs":[`)
		for i, a := range n.Attrs {
			if i > 0 {
				b.WriteByte(',')
			}
			b.WriteString(`{"Name":` + Quote(a.Name))
			if a.Value != "" {
				b.WriteString(`,"Value":` + Quote(a.Value))
			}
			if a.Flag {
				b.WriteString(`,"Flag":true`)
			}
			if len(a.Style) > 0 {
				b.WriteString(`,"Style":[`)
				for j, s := range a.Style {
					if j > 0 {
						b.WriteByte(',')
					}
					b.WriteString(`{"Property":` + Quote(s.Property))
					if s.Value != "" {
						b.WriteString(`,"Value":` + Quote(s.Value))
					}
					b.WriteByte('}')
				}
				b.WriteByte(']')
			}
			b.WriteByte('}')
		}
		b.WriteByte(']')
	}
	if len(n.On) > 0 {
		b.WriteString(`,"On":[`)
		for i, o := range n.On {
			if i > 0 {
				b.WriteByte(',')
			}
			b.WriteString(`{"Event":` + Quote(o.Event))
			if o.Message != "" {
				b.WriteString(`,"Message":` + Quote(o.Message))
			}
			if o.Arg != "" {
				b.WriteString(`,"Arg":` + Quote(o.Arg))
			}
			b.WriteByte('}')
		}
		b.WriteByte(']')
	}
	if len(n.Kids) > 0 {
		b.WriteString(`,"Kids":[`)
		for i, k := range n.Kids {
			if i > 0 {
				b.WriteByte(',')
			}
			writeNode(b, k)
		}
		b.WriteByte(']')
	}
	if n.Text != "" {
		b.WriteString(`,"Text":` + Quote(n.Text))
	}
	b.WriteByte('}')
}

// EncodeCases writes cases as a JSON array JavaScript can parse and DecodeCases reads back exactly.
func EncodeCases(cases []Case) []byte {
	var b strings.Builder
	b.WriteByte('[')
	for i, c := range cases {
		if i > 0 {
			b.WriteByte(',')
		}
		b.WriteString(`{"Name":` + Quote(c.Name) + `,"Node":` + Canonical(c.Node) + `}`)
	}
	b.WriteByte(']')
	return []byte(b.String())
}

// EncodeResults writes results as a JSON array.
func EncodeResults(results []Result) []byte {
	var b strings.Builder
	b.WriteByte('[')
	for i, r := range results {
		if i > 0 {
			b.WriteByte(',')
		}
		b.WriteString(`{"Name":` + Quote(r.Name))
		if r.Error != "" {
			b.WriteString(`,"Error":` + Quote(r.Error))
		} else {
			b.WriteString(`,"HTML":` + Quote(r.HTML))
		}
		b.WriteByte('}')
	}
	b.WriteByte(']')
	return []byte(b.String())
}

// DecodeCases reads the JSON array of {Name, Node} that gen-cases.mjs writes.
func DecodeCases(data []byte) ([]Case, error) {
	r := reader{text: string(data)}
	var cases []Case
	err := r.array(func() error {
		var c Case
		err := r.object(func(key string) error {
			switch key {
			case "Name":
				s, err := r.str()
				c.Name = s
				return err
			case "Node":
				n, err := r.node()
				c.Node = n
				return err
			}
			return r.skipValue()
		})
		cases = append(cases, c)
		return err
	})
	if err == nil {
		r.skip()
		if r.at < len(r.text) {
			err = errors.New("wire: text after top-level value")
		}
	}
	return cases, err
}

// DecodeResults reads the JSON array of {Name, HTML} or {Name, Error} that react-side.mjs writes.
func DecodeResults(data []byte) ([]Result, error) {
	r := reader{text: string(data)}
	var results []Result
	err := r.array(func() error {
		var x Result
		err := r.object(func(key string) error {
			var err error
			switch key {
			case "Name":
				x.Name, err = r.str()
			case "HTML":
				x.HTML, err = r.str()
			case "Error":
				x.Error, err = r.str()
			default:
				err = r.skipValue()
			}
			return err
		})
		results = append(results, x)
		return err
	})
	if err == nil {
		r.skip()
		if r.at < len(r.text) {
			err = errors.New("wire: text after top-level value")
		}
	}
	return results, err
}

// reader is a small recursive-descent JSON reader that keeps string contents exact.
type reader struct {
	text string
	at   int
}

func (r *reader) skip() {
	for r.at < len(r.text) && strings.IndexByte(" \t\r\n", r.text[r.at]) >= 0 {
		r.at++
	}
}

func (r *reader) fail(what string) error { return fmt.Errorf("wire: %s at byte %d", what, r.at) }

func (r *reader) expect(c byte) error {
	r.skip()
	if r.at >= len(r.text) || r.text[r.at] != c {
		return r.fail("expected " + string(c))
	}
	r.at++
	return nil
}

func (r *reader) peek() byte {
	r.skip()
	if r.at >= len(r.text) {
		return 0
	}
	return r.text[r.at]
}

// array reads [ item, item ] and calls item once per element.
func (r *reader) array(item func() error) error {
	if r.peek() == 'n' {
		return r.literal("null")
	}
	if err := r.expect('['); err != nil {
		return err
	}
	if r.peek() == ']' {
		r.at++
		return nil
	}
	for {
		if err := item(); err != nil {
			return err
		}
		switch r.peek() {
		case ',':
			r.at++
		case ']':
			r.at++
			return nil
		default:
			return r.fail("expected , or ]")
		}
	}
}

// object reads { "key": value, ... } and calls member once per key; member must consume the value.
func (r *reader) object(member func(key string) error) error {
	if r.peek() == 'n' {
		return r.literal("null")
	}
	if err := r.expect('{'); err != nil {
		return err
	}
	if r.peek() == '}' {
		r.at++
		return nil
	}
	for {
		key, err := r.str()
		if err != nil {
			return err
		}
		if err := r.expect(':'); err != nil {
			return err
		}
		if err := member(key); err != nil {
			return err
		}
		switch r.peek() {
		case ',':
			r.at++
		case '}':
			r.at++
			return nil
		default:
			return r.fail("expected , or }")
		}
	}
}

func (r *reader) literal(word string) error {
	r.skip()
	if !strings.HasPrefix(r.text[r.at:], word) {
		return r.fail("expected " + word)
	}
	r.at += len(word)
	return nil
}

// skipValue reads and discards any JSON value.
func (r *reader) skipValue() error {
	switch c := r.peek(); {
	case c == '"':
		_, err := r.str()
		return err
	case c == '[':
		return r.array(r.skipValue)
	case c == '{':
		return r.object(func(string) error { return r.skipValue() })
	case c == 't':
		return r.literal("true")
	case c == 'f':
		return r.literal("false")
	case c == 'n':
		return r.literal("null")
	default:
		_, err := r.number()
		return err
	}
}

func (r *reader) number() (int, error) {
	r.skip()
	start := r.at
	for r.at < len(r.text) && strings.IndexByte("+-0123456789.eE", r.text[r.at]) >= 0 {
		r.at++
	}
	f, err := strconv.ParseFloat(r.text[start:r.at], 64)
	if err != nil {
		return 0, r.fail("bad number")
	}
	return int(f), nil
}

func (r *reader) boolean() (bool, error) {
	switch r.peek() {
	case 't':
		return true, r.literal("true")
	case 'f':
		return false, r.literal("false")
	case 'n':
		return false, r.literal("null")
	}
	return false, r.fail("expected boolean")
}

// str reads a JSON string. Raw bytes pass through; \u escapes become code units and FromUnits joins them.
func (r *reader) str() (string, error) {
	if r.peek() == 'n' {
		return "", r.literal("null")
	}
	if err := r.expect('"'); err != nil {
		return "", err
	}
	var out strings.Builder
	var units []uint16
	flush := func() {
		if len(units) > 0 {
			out.WriteString(FromUnits(units))
			units = units[:0]
		}
	}
	for r.at < len(r.text) {
		c := r.text[r.at]
		switch {
		case c == '"':
			r.at++
			flush()
			return out.String(), nil
		case c == '\\':
			if r.at+1 >= len(r.text) {
				return "", r.fail("unfinished escape")
			}
			e := r.text[r.at+1]
			r.at += 2
			if e == 'u' {
				if r.at+4 > len(r.text) {
					return "", r.fail("short \\u escape")
				}
				v, err := strconv.ParseUint(r.text[r.at:r.at+4], 16, 16)
				if err != nil {
					return "", r.fail("bad \\u escape")
				}
				r.at += 4
				units = append(units, uint16(v))
				continue
			}
			flush()
			simple := map[byte]byte{'"': '"', '\\': '\\', '/': '/', 'b': '\b', 'f': '\f', 'n': '\n', 'r': '\r', 't': '\t'}
			v, ok := simple[e]
			if !ok {
				return "", r.fail("bad escape")
			}
			out.WriteByte(v)
		case c < 0x20:
			return "", r.fail("raw control character in string")
		default:
			flush()
			out.WriteByte(c)
			r.at++
		}
	}
	return "", r.fail("unterminated string")
}

// node reads one Node object; absent members stay zero and empty lists stay nil.
func (r *reader) node() (gobi.Node, error) {
	var n gobi.Node
	err := r.object(func(key string) error {
		var err error
		switch key {
		case "Kind":
			var k int
			k, err = r.number()
			n.Kind = gobi.Kind(k)
		case "Tag":
			n.Tag, err = r.str()
		case "Key":
			n.Key, err = r.str()
		case "Text":
			n.Text, err = r.str()
		case "Attrs":
			err = r.array(func() error {
				a, err := r.attribute()
				n.Attrs = append(n.Attrs, a)
				return err
			})
		case "On":
			err = r.array(func() error {
				var o gobi.On
				err := r.object(func(key string) error {
					var err error
					switch key {
					case "Event":
						o.Event, err = r.str()
					case "Message":
						o.Message, err = r.str()
					case "Arg":
						o.Arg, err = r.str()
					default:
						err = r.skipValue()
					}
					return err
				})
				n.On = append(n.On, o)
				return err
			})
		case "Kids":
			err = r.array(func() error {
				k, err := r.node()
				n.Kids = append(n.Kids, k)
				return err
			})
		default:
			err = r.skipValue()
		}
		return err
	})
	return n, err
}

func (r *reader) attribute() (gobi.Attr, error) {
	var a gobi.Attr
	err := r.object(func(key string) error {
		var err error
		switch key {
		case "Name":
			a.Name, err = r.str()
		case "Value":
			a.Value, err = r.str()
		case "Flag":
			a.Flag, err = r.boolean()
		case "Style":
			err = r.array(func() error {
				var s gobi.Style
				err := r.object(func(key string) error {
					var err error
					switch key {
					case "Property":
						s.Property, err = r.str()
					case "Value":
						s.Value, err = r.str()
					default:
						err = r.skipValue()
					}
					return err
				})
				a.Style = append(a.Style, s)
				return err
			})
		default:
			err = r.skipValue()
		}
		return err
	})
	return a, err
}
