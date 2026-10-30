package compilercontract

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"reflect"
	"strings"
	"unicode/utf8"
)

// decodeClosed checks unknown keys recursively and requires every non-omitempty
// struct field before decoding. encoding/json's DisallowUnknownFields alone
// does not enforce required properties.
func decodeClosed(data []byte, destination any) error {
	if destination == nil || reflect.ValueOf(destination).Kind() != reflect.Pointer || reflect.ValueOf(destination).IsNil() {
		return fmt.Errorf("destination must be a non-nil pointer")
	}
	if err := validateJSONUnicode(data); err != nil {
		return err
	}
	var raw any
	shapeDecoder := json.NewDecoder(bytes.NewReader(data))
	shapeDecoder.UseNumber()
	if err := shapeDecoder.Decode(&raw); err != nil {
		return err
	}
	var extra any
	if err := shapeDecoder.Decode(&extra); err != io.EOF {
		if err == nil {
			return fmt.Errorf("trailing JSON value")
		}
		return err
	}
	if err := checkJSONShape(reflect.TypeOf(destination).Elem(), raw, "$"); err != nil {
		return err
	}
	decoder := json.NewDecoder(bytes.NewReader(data))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(destination); err != nil {
		return err
	}
	return nil
}

func validateJSONUnicode(data []byte) error {
	if !utf8.Valid(data) {
		return fmt.Errorf("JSON input is not valid UTF-8")
	}
	for i := 0; i < len(data); i++ {
		if data[i] != '"' {
			continue
		}
		for i++; i < len(data) && data[i] != '"'; i++ {
			if data[i] != '\\' {
				continue
			}
			i++
			if i >= len(data) {
				return fmt.Errorf("truncated JSON escape")
			}
			if data[i] != 'u' {
				continue
			}
			unit, next, err := readJSONHexUnit(data, i+1)
			if err != nil {
				return err
			}
			i = next - 1
			if unit >= 0xdc00 && unit <= 0xdfff {
				return fmt.Errorf("JSON contains an unpaired low surrogate")
			}
			if unit >= 0xd800 && unit <= 0xdbff {
				if i+6 >= len(data) || data[i+1] != '\\' || data[i+2] != 'u' {
					return fmt.Errorf("JSON contains an unpaired high surrogate")
				}
				low, end, err := readJSONHexUnit(data, i+3)
				if err != nil {
					return err
				}
				if low < 0xdc00 || low > 0xdfff {
					return fmt.Errorf("JSON contains an unpaired high surrogate")
				}
				i = end - 1
			}
		}
	}
	return nil
}

func readJSONHexUnit(data []byte, start int) (uint16, int, error) {
	if start+4 > len(data) {
		return 0, start, fmt.Errorf("truncated JSON unicode escape")
	}
	var value uint16
	for _, char := range data[start : start+4] {
		value <<= 4
		switch {
		case char >= '0' && char <= '9':
			value |= uint16(char - '0')
		case char >= 'a' && char <= 'f':
			value |= uint16(char-'a') + 10
		case char >= 'A' && char <= 'F':
			value |= uint16(char-'A') + 10
		default:
			return 0, start, fmt.Errorf("invalid JSON unicode escape")
		}
	}
	return value, start + 4, nil
}

func checkJSONShape(target reflect.Type, raw any, path string) error {
	for target.Kind() == reflect.Pointer {
		if raw == nil {
			return nil
		}
		target = target.Elem()
	}
	switch target.Kind() {
	case reflect.Struct:
		object, ok := raw.(map[string]any)
		if !ok {
			return fmt.Errorf("%s must be an object", path)
		}
		known := make(map[string]reflect.StructField, target.NumField())
		for i := 0; i < target.NumField(); i++ {
			field := target.Field(i)
			if field.PkgPath != "" {
				continue
			}
			name, options, skip := jsonFieldName(field)
			if skip {
				continue
			}
			known[name] = field
			value, exists := object[name]
			if !exists && !strings.Contains(options, "omitempty") {
				return fmt.Errorf("%s.%s is required", path, name)
			}
			if exists {
				if err := checkJSONShape(field.Type, value, path+"."+name); err != nil {
					return err
				}
			}
		}
		for name := range object {
			if _, ok := known[name]; !ok {
				return fmt.Errorf("%s has unknown field %q", path, name)
			}
		}
	case reflect.Slice, reflect.Array:
		if raw == nil && target.Kind() == reflect.Slice {
			return nil
		}
		items, ok := raw.([]any)
		if !ok {
			return fmt.Errorf("%s must be an array", path)
		}
		if target.Kind() == reflect.Array && len(items) != target.Len() {
			return fmt.Errorf("%s must have %d items", path, target.Len())
		}
		for i, item := range items {
			if err := checkJSONShape(target.Elem(), item, fmt.Sprintf("%s[%d]", path, i)); err != nil {
				return err
			}
		}
	case reflect.Map:
		if raw == nil {
			return nil
		}
		object, ok := raw.(map[string]any)
		if !ok {
			return fmt.Errorf("%s must be an object", path)
		}
		for key, item := range object {
			if err := checkJSONShape(target.Elem(), item, path+"."+key); err != nil {
				return err
			}
		}
	}
	return nil
}

func jsonFieldName(field reflect.StructField) (name, options string, skip bool) {
	tag := field.Tag.Get("json")
	if tag == "-" {
		return "", "", true
	}
	parts := strings.Split(tag, ",")
	name = parts[0]
	if name == "" {
		name = field.Name
	}
	if len(parts) > 1 {
		options = "," + strings.Join(parts[1:], ",")
	}
	return name, options, false
}
