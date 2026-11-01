package effectqualification

import (
	"bytes"
	"encoding/json"
	"errors"

	"github.com/samuelpmahan/gondola/modulequalification"
)

// decodeJSONStrict delegates to the established module qualification decoder,
// which rejects duplicate keys, invalid UTF-8, unpaired surrogates, trailing
// values, unknown fields, and incorrect struct-field casing. It also applies
// UseNumber to generic maps.
func decodeJSONStrict(data []byte, out any) error {
	return modulequalification.DecodeStrict(data, out)
}

// compactJSON preserves object member order while removing insignificant JSON
// whitespace, matching the scenario producer's JSON.stringify digest for the
// pinned fixtures.
func compactJSON(data []byte) ([]byte, error) {
	var output bytes.Buffer
	if err := json.Compact(&output, data); err != nil {
		return nil, err
	}
	return output.Bytes(), nil
}

// decodeMapStrict decodes a JSON object while retaining numeric tokens as
// json.Number. Non-object roots, including null, are errors.
func decodeMapStrict(data []byte) (map[string]any, error) {
	var object map[string]any
	if err := decodeJSONStrict(data, &object); err != nil {
		return nil, err
	}
	if object == nil {
		return nil, errors.New("JSON root must be an object")
	}
	return object, nil
}
