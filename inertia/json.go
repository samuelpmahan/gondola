package inertia

import (
	"encoding/json"
	"fmt"
	"math"
	"reflect"
	"sort"
	"strconv"
	"strings"

	"github.com/samuelpmahan/gondola/wire"
)

// Every rule in this file was found by giving Inertia's server-side rendering (the @inertiajs/react createInertiaApp
// entry) a page object and reading the data-page script it wrote back; each has a row in rules_test.go.

// normalize turns any value into the data a browser would get from the page object: nil, bool, string (WTF-8 text),
// float64, []any and map[string]any. Whole numbers become float64 because JavaScript has no other kind. Values the
// function does not know are sent through encoding/json first.
func normalize(value any) (any, error) {
	switch v := value.(type) {
	case nil, bool, string:
		return v, nil
	case float64:
		if math.IsNaN(v) || math.IsInf(v, 0) {
			return nil, fmt.Errorf("inertia: %v cannot travel in JSON", v)
		}
		return v, nil
	case int:
		return float64(v), nil
	case int64:
		return float64(v), nil
	case int32:
		return float64(v), nil
	case uint:
		return float64(v), nil
	case uint64:
		return float64(v), nil
	case uint32:
		return float64(v), nil
	case float32:
		return normalize(float64(v))
	case []any:
		out := make([]any, len(v))
		for i, item := range v {
			n, err := normalize(item)
			if err != nil {
				return nil, err
			}
			out[i] = n
		}
		return out, nil
	case map[string]any:
		out := make(map[string]any, len(v))
		for key, item := range v {
			n, err := normalize(item)
			if err != nil {
				return nil, err
			}
			out[key] = n
		}
		return out, nil
	case Props:
		return normalize(map[string]any(v))
	case []string:
		out := make([]any, len(v))
		for i, item := range v {
			out[i] = item
		}
		return out, nil
	case map[string]string:
		out := make(map[string]any, len(v))
		for key, item := range v {
			out[key] = item
		}
		return out, nil
	}
	if reflect.TypeOf(value).Kind() == reflect.Func {
		return nil, fmt.Errorf("inertia: a %T cannot travel in JSON", value)
	}
	data, err := json.Marshal(value)
	if err != nil {
		return nil, err
	}
	var decoded any
	if err := json.Unmarshal(data, &decoded); err != nil {
		return nil, err
	}
	return decoded, nil
}

// writeJSON writes a normalized value the way the page object is written in the data-page script. The rules, all
// learned from Inertia's own output:
//   - "<" is written < and "/" is written \/, so that "</script>" cannot close the script early;
//   - ">" "&" and "'" are written as themselves, and so is every character from U+007F up, U+2028 and U+2029 included;
//   - other control characters are \u00xx in lower case, and a lone surrogate is \udxxx in lower case;
//   - numbers are written the way JavaScript writes them (1e+21, no minus sign on zero);
//   - an object lists the keys that look like array indexes first, from smallest to largest, and then the other keys,
//     because Inertia reads the page object into a JavaScript object and writes it again. Go maps have no order, so
//     the other keys are sorted by UTF-16 code unit, as JavaScript sorts strings.
func writeJSON(b *strings.Builder, value any) {
	switch v := value.(type) {
	case nil:
		b.WriteString("null")
	case bool:
		b.WriteString(strconv.FormatBool(v))
	case string:
		writeString(b, v)
	case float64:
		b.WriteString(formatNumber(v))
	case []any:
		b.WriteByte('[')
		for i, item := range v {
			if i > 0 {
				b.WriteByte(',')
			}
			writeJSON(b, item)
		}
		b.WriteByte(']')
	case map[string]any:
		b.WriteByte('{')
		for i, key := range orderedKeys(v) {
			if i > 0 {
				b.WriteByte(',')
			}
			writeString(b, key)
			b.WriteByte(':')
			writeJSON(b, v[key])
		}
		b.WriteByte('}')
	default:
		panic(fmt.Sprintf("inertia: writeJSON on %T, which normalize does not produce", value))
	}
}

func formatNumber(f float64) string {
	if f == 0 {
		return "0"
	}
	data, _ := json.Marshal(f) // encoding/json writes numbers the ECMAScript way
	return string(data)
}

// arrayIndex says whether key is a canonical array index (0 to 4294967294, no leading zero).
func arrayIndex(key string) (uint64, bool) {
	if key == "" || len(key) > 10 || (len(key) > 1 && key[0] == '0') {
		return 0, false
	}
	n, err := strconv.ParseUint(key, 10, 64)
	if err != nil || n > 4294967294 {
		return 0, false
	}
	return n, true
}

func orderedKeys(m map[string]any) []string {
	var indexes, others []string
	for key := range m {
		if _, ok := arrayIndex(key); ok {
			indexes = append(indexes, key)
		} else {
			others = append(others, key)
		}
	}
	sort.Slice(indexes, func(i, j int) bool {
		a, _ := arrayIndex(indexes[i])
		b, _ := arrayIndex(indexes[j])
		return a < b
	})
	sort.Slice(others, func(i, j int) bool { return lessUnits(others[i], others[j]) })
	return append(indexes, others...)
}

func lessUnits(a, b string) bool {
	x, y := wire.ToUnits(a), wire.ToUnits(b)
	for i := 0; i < len(x) && i < len(y); i++ {
		if x[i] != y[i] {
			return x[i] < y[i]
		}
	}
	return len(x) < len(y)
}

func writeString(b *strings.Builder, s string) {
	b.WriteByte('"')
	units := wire.ToUnits(s)
	for i := 0; i < len(units); i++ {
		u := units[i]
		switch {
		case u == '"':
			b.WriteString(`\"`)
		case u == '\\':
			b.WriteString(`\\`)
		case u == '/':
			b.WriteString(`\/`)
		case u == '<':
			b.WriteString(`\u003c`)
		case u == '\b':
			b.WriteString(`\b`)
		case u == '\f':
			b.WriteString(`\f`)
		case u == '\n':
			b.WriteString(`\n`)
		case u == '\r':
			b.WriteString(`\r`)
		case u == '\t':
			b.WriteString(`\t`)
		case u < 0x20:
			fmt.Fprintf(b, `\u%04x`, u)
		case u >= 0xD800 && u < 0xDC00 && i+1 < len(units) && units[i+1] >= 0xDC00 && units[i+1] < 0xE000:
			b.WriteRune(0x10000 + (rune(u)-0xD800)<<10 + (rune(units[i+1]) - 0xDC00))
			i++
		case u >= 0xD800 && u < 0xE000:
			fmt.Fprintf(b, `\u%04x`, u) // a lone surrogate half
		default:
			b.WriteRune(rune(u))
		}
	}
	b.WriteByte('"')
}
