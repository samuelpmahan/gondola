package main

// Strict JSON decoders shared by bridge tests and the native replay command.
import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"strconv"
	"unicode/utf8"

	"github.com/samuelpmahan/gondola/asyncsave"
	"github.com/samuelpmahan/gondola/collection"
	"github.com/samuelpmahan/gondola/composition"
	"github.com/samuelpmahan/gondola/multisession"
)

type replayAction struct {
	Method string            `json:"method"`
	Args   []json.RawMessage `json:"args"`
}

func decodeReplayInput(encoded []byte) ([]replayAction, error) {
	if !utf8.Valid(encoded) {
		return nil, fmt.Errorf("input must contain valid Unicode")
	}
	fields, err := decodeExactObject(string(encoded), "actions")
	if err != nil {
		return nil, err
	}
	raw := bytes.TrimSpace(fields["actions"])
	if len(raw) == 0 || raw[0] != '[' {
		return nil, fmt.Errorf("field %q must be an array", "actions")
	}
	var actions []json.RawMessage
	if err := json.Unmarshal(raw, &actions); err != nil || actions == nil {
		return nil, fmt.Errorf("field %q must be an array", "actions")
	}
	result := make([]replayAction, len(actions))
	for index, action := range actions {
		decoded, err := decodeActionJSON(string(action))
		if err != nil {
			return nil, fmt.Errorf("action %d: %w", index, err)
		}
		result[index] = decoded
	}
	return result, nil
}

func decodeActionJSON(encoded string) (replayAction, error) {
	fields, err := decodeExactObject(encoded, "method", "args")
	if err != nil {
		return replayAction{}, err
	}
	method, err := decodeJSONString(fields, "method")
	if err != nil {
		return replayAction{}, err
	}
	argsRaw := bytes.TrimSpace(fields["args"])
	if len(argsRaw) == 0 || argsRaw[0] != '[' {
		return replayAction{}, fmt.Errorf("field %q must be an array", "args")
	}
	var args []json.RawMessage
	if err := json.Unmarshal(argsRaw, &args); err != nil || args == nil {
		return replayAction{}, fmt.Errorf("field %q must be an array", "args")
	}
	return replayAction{Method: method, Args: args}, nil
}

func decodeStepJSON(encoded string) (collection.Step, error) {
	fields, err := decodeExactObject(encoded, "Path", "Event", "Value", "Key")
	if err != nil {
		return collection.Step{}, err
	}
	path, err := decodeJSONString(fields, "Path")
	if err != nil {
		return collection.Step{}, err
	}
	event, err := decodeJSONString(fields, "Event")
	if err != nil {
		return collection.Step{}, err
	}
	value, err := decodeJSONString(fields, "Value")
	if err != nil {
		return collection.Step{}, err
	}
	key, err := decodeJSONString(fields, "Key")
	if err != nil {
		return collection.Step{}, err
	}
	return collection.Step{Path: path, Event: event, Value: value, Key: key}, nil
}

func decodeReplyJSON(encoded string) (asyncsave.Reply, error) {
	fields, err := decodeExactObject(encoded, "ID", "Value", "Error")
	if err != nil {
		return asyncsave.Reply{}, err
	}
	id, err := parsePositiveSafeUint(fields["ID"], "ID")
	if err != nil {
		return asyncsave.Reply{}, err
	}
	value, err := decodeJSONString(fields, "Value")
	if err != nil {
		return asyncsave.Reply{}, err
	}
	message, err := decodeJSONString(fields, "Error")
	if err != nil {
		return asyncsave.Reply{}, err
	}
	return asyncsave.Reply{ID: id, Value: value, Error: message}, nil
}

func decodeInputsJSON(encoded string) (composition.Inputs, error) {
	if !utf8.ValidString(encoded) || !validUnicodeEscapes([]byte(encoded)) {
		return composition.Inputs{}, fmt.Errorf("input must contain valid Unicode")
	}
	fields, err := decodeExactObject(encoded, "Title", "ReadOnly")
	if err != nil {
		return composition.Inputs{}, err
	}
	title, err := decodeJSONString(fields, "Title")
	if err != nil {
		return composition.Inputs{}, err
	}
	var readOnly bool
	if !isJSONBool(fields["ReadOnly"]) || json.Unmarshal(fields["ReadOnly"], &readOnly) != nil {
		return composition.Inputs{}, fmt.Errorf("field %q must be a boolean", "ReadOnly")
	}
	return composition.Inputs{Title: title, ReadOnly: readOnly}, nil
}

// decodeExactObject rejects arrays, null, duplicate keys, missing keys,
// unknown keys, and trailing JSON values. Duplicate matching uses decoded
// names, so (for example) "ID" and "I\\u0044" collide.
func decodeExactObject(encoded string, names ...string) (map[string]json.RawMessage, error) {
	decoder := json.NewDecoder(bytes.NewBufferString(encoded))
	first, err := decoder.Token()
	if err != nil {
		return nil, err
	}
	open, ok := first.(json.Delim)
	if !ok || open != '{' {
		return nil, fmt.Errorf("input must be an object")
	}
	allowed := make(map[string]struct{}, len(names))
	for _, name := range names {
		allowed[name] = struct{}{}
	}
	fields := make(map[string]json.RawMessage, len(names))
	for decoder.More() {
		token, err := decoder.Token()
		if err != nil {
			return nil, err
		}
		name, ok := token.(string)
		if !ok {
			return nil, fmt.Errorf("input property name must be a string")
		}
		if _, exists := fields[name]; exists {
			return nil, fmt.Errorf("duplicate field %q", name)
		}
		if _, exists := allowed[name]; !exists {
			return nil, fmt.Errorf("unexpected field %q", name)
		}
		var raw json.RawMessage
		if err := decoder.Decode(&raw); err != nil {
			return nil, err
		}
		fields[name] = raw
	}
	last, err := decoder.Token()
	if err != nil {
		return nil, err
	}
	close, ok := last.(json.Delim)
	if !ok || close != '}' {
		return nil, fmt.Errorf("input object was not closed")
	}
	if _, err := decoder.Token(); err != io.EOF {
		if err == nil {
			return nil, fmt.Errorf("trailing JSON value")
		}
		return nil, err
	}
	for _, name := range names {
		if _, ok := fields[name]; !ok {
			return nil, fmt.Errorf("missing field %q", name)
		}
	}
	return fields, nil
}

func decodeJSONString(fields map[string]json.RawMessage, name string) (string, error) {
	var value string
	raw := bytes.TrimSpace(fields[name])
	if len(raw) == 0 || raw[0] != '"' {
		return "", fmt.Errorf("field %q must be a string", name)
	}
	if err := json.Unmarshal(raw, &value); err != nil {
		return "", fmt.Errorf("field %q must be a string", name)
	}
	return value, nil
}

func parsePositiveSafeUint(raw json.RawMessage, name string) (uint64, error) {
	value, err := parseSafeUint(raw, name)
	if err != nil || value == 0 {
		return 0, fmt.Errorf("field %q must be a positive safe integer", name)
	}
	return value, nil
}

func parseSafeUint(raw json.RawMessage, name string) (uint64, error) {
	value := bytes.TrimSpace(raw)
	if len(value) == 0 || value[0] < '0' || value[0] > '9' {
		return 0, fmt.Errorf("field %q must be a non-negative safe integer", name)
	}
	for _, digit := range value {
		if digit < '0' || digit > '9' {
			return 0, fmt.Errorf("field %q must be a non-negative safe integer", name)
		}
	}
	parsed, err := strconv.ParseUint(string(value), 10, 64)
	if err != nil || parsed > asyncsave.MaxID || strconv.FormatUint(parsed, 10) != string(value) {
		return 0, fmt.Errorf("field %q must be a non-negative safe integer", name)
	}
	return parsed, nil
}

func decodeSessionIDJSON(raw json.RawMessage, name string) (multisession.SessionID, error) {
	value, err := parsePositiveSafeUint(raw, name)
	if err != nil {
		return 0, err
	}
	return multisession.SessionID(value), nil
}

func decodeRowIDJSON(raw json.RawMessage) (collection.RowID, error) {
	value, err := parsePositiveSafeUint(raw, "rowID")
	if err != nil {
		return 0, err
	}
	return collection.RowID(value), nil
}

func decodeRevisionJSON(raw json.RawMessage) (uint64, error) {
	return parseSafeUint(raw, "inputRevision")
}

func decodeStatusJSON(raw json.RawMessage) (int, error) {
	value, err := parseSafeUint(raw, "status")
	if err != nil || value < 100 || value > 599 {
		return 0, fmt.Errorf("field %q must be an integer in range 100..599", "status")
	}
	return int(value), nil
}

func isJSONBool(raw json.RawMessage) bool {
	trimmed := bytes.TrimSpace(raw)
	return bytes.Equal(trimmed, []byte("true")) || bytes.Equal(trimmed, []byte("false"))
}

func validUnicodeEscapes(body []byte) bool {
	inString := false
	for i := 0; i < len(body); {
		if !inString {
			if body[i] == '"' {
				inString = true
			}
			i++
			continue
		}
		if body[i] == '"' {
			inString = false
			i++
			continue
		}
		if body[i] != '\\' {
			i++
			continue
		}
		if i+1 >= len(body) {
			return false
		}
		if body[i+1] != 'u' {
			i += 2
			continue
		}
		if i+6 > len(body) {
			return false
		}
		code, ok := parseHex4(body[i+2 : i+6])
		if !ok {
			return false
		}
		switch {
		case code >= 0xd800 && code <= 0xdbff:
			if i+12 > len(body) || body[i+6] != '\\' || body[i+7] != 'u' {
				return false
			}
			low, ok := parseHex4(body[i+8 : i+12])
			if !ok || low < 0xdc00 || low > 0xdfff {
				return false
			}
			i += 12
		case code >= 0xdc00 && code <= 0xdfff:
			return false
		default:
			i += 6
		}
	}
	return !inString
}

func parseHex4(value []byte) (uint16, bool) {
	if len(value) != 4 {
		return 0, false
	}
	var result uint16
	for _, digit := range value {
		result <<= 4
		switch {
		case digit >= '0' && digit <= '9':
			result |= uint16(digit - '0')
		case digit >= 'a' && digit <= 'f':
			result |= uint16(digit-'a') + 10
		case digit >= 'A' && digit <= 'F':
			result |= uint16(digit-'A') + 10
		default:
			return 0, false
		}
	}
	return result, true
}
