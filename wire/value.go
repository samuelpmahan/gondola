package wire

import (
	"errors"
	"strconv"
)

// DecodeValue reads any JSON value into plain Go data (nil, bool, float64, string, []any, map[string]any) and keeps
// every string exact, lone surrogates included, which encoding/json cannot do.
func DecodeValue(data []byte) (any, error) {
	r := reader{text: string(data)}
	v, err := r.value()
	if err != nil {
		return nil, err
	}
	r.skip()
	if r.at < len(r.text) {
		return nil, errors.New("wire: text after top-level value")
	}
	return v, nil
}

func (r *reader) value() (any, error) {
	switch c := r.peek(); {
	case c == '"':
		return r.str()
	case c == '[':
		list := []any{}
		err := r.array(func() error {
			item, err := r.value()
			list = append(list, item)
			return err
		})
		return list, err
	case c == '{':
		members := map[string]any{}
		err := r.object(func(key string) error {
			item, err := r.value()
			members[key] = item
			return err
		})
		return members, err
	case c == 't':
		return true, r.literal("true")
	case c == 'f':
		return false, r.literal("false")
	case c == 'n':
		return nil, r.literal("null")
	default:
		r.skip()
		start := r.at
		for r.at < len(r.text) && (r.text[r.at] == '+' || r.text[r.at] == '-' || r.text[r.at] == '.' || r.text[r.at] == 'e' || r.text[r.at] == 'E' || (r.text[r.at] >= '0' && r.text[r.at] <= '9')) {
			r.at++
		}
		f, err := strconv.ParseFloat(r.text[start:r.at], 64)
		if err != nil {
			return nil, r.fail("bad number")
		}
		return f, nil
	}
}
