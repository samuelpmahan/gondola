// Package httpwire defines the typed JSON boundary for HTTP save requests.
package httpwire

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"strconv"
	"unicode/utf8"

	"github.com/samuelpmahan/gondola/asyncsave"
)

// MaxResponseBytes bounds the response parser's input to 64 KiB.
const MaxResponseBytes = 65536

type request struct {
	ID    uint64 `json:"ID"`
	Value string `json:"Value"`
}

// EncodeRequest serializes the exact HTTP save request object. ID must fit in
// JavaScript's integer-safe range because the WASM transport carries it as a
// Number.
func EncodeRequest(id uint64, value string) ([]byte, error) {
	if id == 0 || id > asyncsave.MaxID {
		return nil, fmt.Errorf("request ID %d is outside the supported range 1..%d", id, asyncsave.MaxID)
	}
	if !utf8.ValidString(value) {
		return nil, fmt.Errorf("request value is not valid UTF-8")
	}
	encoded, err := json.Marshal(request{ID: id, Value: value})
	if err != nil {
		return nil, fmt.Errorf("encode HTTP request: %w", err)
	}
	return encoded, nil
}

// DecodeResponse validates a correlated HTTP reply. Every failure is converted
// into an error reply carrying the expected ID, so the caller can safely pass
// it to asyncsave.Session.Complete without trusting response data.
func DecodeResponse(id uint64, status int, body []byte) asyncsave.Reply {
	if status != 200 {
		return asyncsave.Reply{ID: id, Error: fmt.Sprintf("http status %d", status)}
	}
	if len(body) > MaxResponseBytes || !utf8.Valid(body) || !validUnicodeEscapes(body) {
		return invalidReply(id)
	}

	decodedID, value, message, err := decodeExactResponse(body)
	if err != nil || decodedID != id {
		return invalidReply(id)
	}
	return asyncsave.Reply{ID: id, Value: value, Error: message}
}

// validUnicodeEscapes rejects lone UTF-16 surrogate escapes. encoding/json is
// intentionally permissive here and replaces them with U+FFFD; rejecting
// them keeps the wire boundary from silently changing response values/keys.
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

func invalidReply(id uint64) asyncsave.Reply {
	return asyncsave.Reply{ID: id, Error: "invalid response"}
}

func decodeExactResponse(body []byte) (uint64, string, string, error) {
	decoder := json.NewDecoder(bytes.NewReader(body))
	decoder.UseNumber()
	first, err := decoder.Token()
	if err != nil {
		return 0, "", "", err
	}
	open, ok := first.(json.Delim)
	if !ok || open != '{' {
		return 0, "", "", fmt.Errorf("response must be an object")
	}

	seen := make(map[string]struct{}, 3)
	var id uint64
	var value, message string
	for decoder.More() {
		token, err := decoder.Token()
		if err != nil {
			return 0, "", "", err
		}
		name, ok := token.(string)
		if !ok {
			return 0, "", "", fmt.Errorf("response property name must be a string")
		}
		if _, exists := seen[name]; exists {
			return 0, "", "", fmt.Errorf("duplicate response property %q", name)
		}
		seen[name] = struct{}{}

		field, err := decoder.Token()
		if err != nil {
			return 0, "", "", err
		}
		switch name {
		case "ID":
			number, ok := field.(json.Number)
			if !ok {
				return 0, "", "", fmt.Errorf("response ID must be an integer number")
			}
			id, err = parseSafeID(number.String())
			if err != nil {
				return 0, "", "", err
			}
		case "Value":
			var ok bool
			value, ok = field.(string)
			if !ok {
				return 0, "", "", fmt.Errorf("response Value must be a string")
			}
		case "Error":
			var ok bool
			message, ok = field.(string)
			if !ok {
				return 0, "", "", fmt.Errorf("response Error must be a string")
			}
		default:
			return 0, "", "", fmt.Errorf("unexpected response property %q", name)
		}
	}

	last, err := decoder.Token()
	if err != nil {
		return 0, "", "", err
	}
	close, ok := last.(json.Delim)
	if !ok || close != '}' {
		return 0, "", "", fmt.Errorf("response object was not closed")
	}
	if len(seen) != 3 {
		return 0, "", "", fmt.Errorf("response must contain exactly ID, Value, and Error")
	}
	if _, err := decoder.Token(); err != io.EOF {
		if err == nil {
			return 0, "", "", fmt.Errorf("trailing JSON value")
		}
		return 0, "", "", err
	}
	return id, value, message, nil
}

func parseSafeID(raw string) (uint64, error) {
	if raw == "" {
		return 0, fmt.Errorf("response ID is empty")
	}
	for _, digit := range raw {
		if digit < '0' || digit > '9' {
			return 0, fmt.Errorf("response ID must use integer decimal notation")
		}
	}
	id, err := strconv.ParseUint(raw, 10, 64)
	if err != nil || id == 0 || id > asyncsave.MaxID {
		return 0, fmt.Errorf("response ID is outside the supported range")
	}
	return id, nil
}
