package modulequalification

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"reflect"
	"strings"
	"unicode/utf8"
)

var (
	jsonUnmarshalerType = reflect.TypeOf((*json.Unmarshaler)(nil)).Elem()
	rawMessageType      = reflect.TypeOf(json.RawMessage{})
)

// DecodeStrict decodes one UTF-8 JSON value. It rejects duplicate object keys,
// invalid UTF-8, unpaired UTF-16 surrogate escapes, trailing JSON values, and
// unknown or incorrectly-cased fields when decoding into a struct. Generic
// maps retain numbers as json.Number instead of rounding them through float64.
func DecodeStrict(data []byte, out any) error {
	if out == nil {
		return errors.New("strict JSON output must be a non-nil pointer")
	}
	output := reflect.ValueOf(out)
	if output.Kind() != reflect.Pointer || output.IsNil() {
		return errors.New("strict JSON output must be a non-nil pointer")
	}
	if !utf8.Valid(data) {
		return errors.New("JSON input is not valid UTF-8")
	}
	if err := rejectUnpairedSurrogateEscapes(data); err != nil {
		return err
	}
	if err := scanJSONForDuplicateKeys(data); err != nil {
		return err
	}
	if err := validateExactStructFields(data, output.Elem().Type(), "$"); err != nil {
		return err
	}

	decoder := json.NewDecoder(bytes.NewReader(data))
	decoder.UseNumber()
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(out); err != nil {
		return fmt.Errorf("decode strict JSON: %w", err)
	}
	if err := decoder.Decode(new(any)); !errors.Is(err, io.EOF) {
		if err == nil {
			return errors.New("JSON input has a trailing value")
		}
		return fmt.Errorf("JSON input has trailing data: %w", err)
	}
	return nil
}

func rejectUnpairedSurrogateEscapes(data []byte) error {
	for index := 0; index < len(data); {
		if data[index] != '"' {
			index++
			continue
		}
		index++
		for index < len(data) && data[index] != '"' {
			if data[index] != '\\' {
				index++
				continue
			}
			if index+1 >= len(data) {
				return nil // The JSON decoder reports the malformed escape.
			}
			if data[index+1] != 'u' {
				index += 2
				continue
			}
			code, ok := decodeHexQuad(data[index+2:])
			if !ok {
				return nil // The JSON decoder reports an invalid unicode escape.
			}
			switch {
			case code >= 0xd800 && code <= 0xdbff:
				next := index + 6
				if next+6 > len(data) || data[next] != '\\' || data[next+1] != 'u' {
					return fmt.Errorf("JSON string has an unpaired high surrogate at byte %d", index)
				}
				low, valid := decodeHexQuad(data[next+2:])
				if !valid || low < 0xdc00 || low > 0xdfff {
					return fmt.Errorf("JSON string has an unpaired high surrogate at byte %d", index)
				}
				index = next + 6
			case code >= 0xdc00 && code <= 0xdfff:
				return fmt.Errorf("JSON string has an unpaired low surrogate at byte %d", index)
			default:
				index += 6
			}
		}
		if index < len(data) {
			index++
		}
	}
	return nil
}

func decodeHexQuad(encoded []byte) (uint16, bool) {
	if len(encoded) < 4 {
		return 0, false
	}
	var value uint16
	for _, digit := range encoded[:4] {
		value <<= 4
		switch {
		case digit >= '0' && digit <= '9':
			value |= uint16(digit - '0')
		case digit >= 'a' && digit <= 'f':
			value |= uint16(digit-'a') + 10
		case digit >= 'A' && digit <= 'F':
			value |= uint16(digit-'A') + 10
		default:
			return 0, false
		}
	}
	return value, true
}

func scanJSONForDuplicateKeys(data []byte) error {
	decoder := json.NewDecoder(bytes.NewReader(data))
	decoder.UseNumber()
	if err := consumeJSONValue(decoder); err != nil {
		return fmt.Errorf("scan JSON value: %w", err)
	}
	if _, err := decoder.Token(); !errors.Is(err, io.EOF) {
		if err == nil {
			return errors.New("JSON input has a trailing value")
		}
		return fmt.Errorf("JSON input has trailing data: %w", err)
	}
	return nil
}

func consumeJSONValue(decoder *json.Decoder) error {
	token, err := decoder.Token()
	if err != nil {
		return err
	}
	delimiter, isDelimiter := token.(json.Delim)
	if !isDelimiter {
		return nil
	}
	switch delimiter {
	case '{':
		seen := make(map[string]struct{})
		for decoder.More() {
			keyToken, err := decoder.Token()
			if err != nil {
				return err
			}
			key, ok := keyToken.(string)
			if !ok {
				return errors.New("JSON object key is not a string")
			}
			if _, duplicate := seen[key]; duplicate {
				return fmt.Errorf("JSON object has duplicate key %q", key)
			}
			seen[key] = struct{}{}
			if err := consumeJSONValue(decoder); err != nil {
				return err
			}
		}
		end, err := decoder.Token()
		if err != nil {
			return err
		}
		if end != json.Delim('}') {
			return errors.New("JSON object is not terminated")
		}
	case '[':
		for decoder.More() {
			if err := consumeJSONValue(decoder); err != nil {
				return err
			}
		}
		end, err := decoder.Token()
		if err != nil {
			return err
		}
		if end != json.Delim(']') {
			return errors.New("JSON array is not terminated")
		}
	default:
		return fmt.Errorf("unexpected JSON delimiter %q", delimiter)
	}
	return nil
}

func validateExactStructFields(data []byte, target reflect.Type, at string) error {
	for target.Kind() == reflect.Pointer {
		target = target.Elem()
	}
	if target == rawMessageType || hasJSONUnmarshaler(target) || target.Kind() == reflect.Interface {
		return nil
	}
	switch target.Kind() {
	case reflect.Struct:
		var fields map[string]json.RawMessage
		if err := json.Unmarshal(data, &fields); err != nil || fields == nil {
			return nil // The ordinary decoder reports type and syntax mismatches.
		}
		known := make(map[string]reflect.Type)
		if err := collectJSONFields(target, known); err != nil {
			return fmt.Errorf("%s: %w", at, err)
		}
		for name, raw := range fields {
			fieldType, ok := known[name]
			if !ok {
				return fmt.Errorf("%s: unknown or incorrectly-cased JSON field %q", at, name)
			}
			if err := validateExactStructFields(raw, fieldType, at+"."+name); err != nil {
				return err
			}
		}
	case reflect.Slice, reflect.Array:
		if target.Elem().Kind() == reflect.Uint8 {
			return nil
		}
		var elements []json.RawMessage
		if err := json.Unmarshal(data, &elements); err != nil {
			return nil
		}
		for index, raw := range elements {
			if err := validateExactStructFields(raw, target.Elem(), fmt.Sprintf("%s[%d]", at, index)); err != nil {
				return err
			}
		}
	case reflect.Map:
		var values map[string]json.RawMessage
		if err := json.Unmarshal(data, &values); err != nil {
			return nil
		}
		for key, raw := range values {
			if err := validateExactStructFields(raw, target.Elem(), at+"["+key+"]"); err != nil {
				return err
			}
		}
	}
	return nil
}

func collectJSONFields(target reflect.Type, fields map[string]reflect.Type) error {
	for index := 0; index < target.NumField(); index++ {
		field := target.Field(index)
		if field.PkgPath != "" { // Unexported fields are not decoded by encoding/json.
			continue
		}
		tag := field.Tag.Get("json")
		name, options, _ := strings.Cut(tag, ",")
		if name == "-" {
			continue
		}
		if field.Anonymous && name == "" {
			embedded := field.Type
			for embedded.Kind() == reflect.Pointer {
				embedded = embedded.Elem()
			}
			if embedded.Kind() == reflect.Struct && !hasJSONUnmarshaler(embedded) {
				if err := collectJSONFields(embedded, fields); err != nil {
					return err
				}
				continue
			}
		}
		if name == "" {
			name = field.Name
		}
		if name == "" || strings.ContainsAny(name, "\\\x00") {
			return fmt.Errorf("unsupported JSON field name in %s", target)
		}
		if _, duplicate := fields[name]; duplicate {
			return fmt.Errorf("ambiguous JSON field name %q in %s", name, target)
		}
		_ = options // Options affect encoding shape, not the accepted field name.
		fields[name] = field.Type
	}
	return nil
}

func hasJSONUnmarshaler(target reflect.Type) bool {
	if target.Implements(jsonUnmarshalerType) {
		return true
	}
	return target.Kind() != reflect.Pointer && reflect.PointerTo(target).Implements(jsonUnmarshalerType)
}
