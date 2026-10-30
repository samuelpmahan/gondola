package main

// This file contains the JSON half of the WASM boundary so the exact object
// contract can be exercised by native Go tests too.

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"math"
	"strconv"

	"github.com/samuelpmahan/gondola/asyncsave"
	"github.com/samuelpmahan/gondola/collection"
	"github.com/samuelpmahan/gondola/multisession"
)

func decodeStepJSON(encoded string) (collection.Step, error) {
	fields, err := decodeExactObject(encoded, "Path", "Event", "Value", "Key")
	if err != nil {
		return collection.Step{}, err
	}
	path, err := decodeRequiredString(fields, "Path")
	if err != nil {
		return collection.Step{}, err
	}
	event, err := decodeRequiredString(fields, "Event")
	if err != nil {
		return collection.Step{}, err
	}
	value, err := decodeRequiredString(fields, "Value")
	if err != nil {
		return collection.Step{}, err
	}
	key, err := decodeRequiredString(fields, "Key")
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
	value, err := decodeRequiredString(fields, "Value")
	if err != nil {
		return asyncsave.Reply{}, err
	}
	message, err := decodeRequiredString(fields, "Error")
	if err != nil {
		return asyncsave.Reply{}, err
	}
	return asyncsave.Reply{ID: id, Value: value, Error: message}, nil
}

// decodeExactObject rejects arrays, null, duplicate keys, missing keys,
// unknown keys, and trailing JSON values. The decoder also catches duplicate
// names after escape decoding, such as "ID" and "I\\u0044".
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

func decodeRequiredString(fields map[string]json.RawMessage, name string) (string, error) {
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
	value := bytes.TrimSpace(raw)
	if len(value) == 0 || value[0] < '0' || value[0] > '9' {
		return 0, fmt.Errorf("field %q must be a positive safe integer", name)
	}
	for _, digit := range value {
		if digit < '0' || digit > '9' {
			return 0, fmt.Errorf("field %q must be a positive safe integer", name)
		}
	}
	id, err := strconv.ParseUint(string(value), 10, 64)
	if err != nil || id == 0 || id > asyncsave.MaxID || strconv.FormatUint(id, 10) != string(value) {
		return 0, fmt.Errorf("field %q must be a positive safe integer", name)
	}
	return id, nil
}

func sessionIDFromNumber(number float64) (multisession.SessionID, error) {
	maximum := float64(multisession.MaxSessionID)
	if math.IsNaN(number) || math.IsInf(number, 0) || math.Trunc(number) != number || number < 1 || number > maximum {
		return 0, fmt.Errorf("session ID must be an integer in range 1..%d", multisession.MaxSessionID)
	}
	return multisession.SessionID(uint64(number)), nil
}
