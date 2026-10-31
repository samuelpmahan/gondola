package build

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"path"
	"strings"

	"github.com/samuelpmahan/gondola/compilercontract"
)

// DecodeRequest parses exactly one closed BuildRequest JSON object and validates
// its required v1 fields.
func DecodeRequest(data []byte) (compilercontract.BuildRequest, error) {
	if err := validateBuildRequestObject(data); err != nil {
		return compilercontract.BuildRequest{}, fmt.Errorf("decode build request: %w", err)
	}
	decoder := json.NewDecoder(bytes.NewReader(data))
	decoder.DisallowUnknownFields()
	var request compilercontract.BuildRequest
	if err := decoder.Decode(&request); err != nil {
		return compilercontract.BuildRequest{}, fmt.Errorf("decode build request: %w", err)
	}
	if err := ValidateRequest(request); err != nil {
		return compilercontract.BuildRequest{}, err
	}
	return request, nil
}

func validateBuildRequestObject(data []byte) error {
	decoder := json.NewDecoder(bytes.NewReader(data))
	first, err := decoder.Token()
	if err != nil {
		return err
	}
	opening, ok := first.(json.Delim)
	if !ok || opening != '{' {
		return fmt.Errorf("build request must be a JSON object")
	}
	fields := []string{"schema", "sourceRoot", "entryPackages", "backend", "outputDir"}
	allowed := make(map[string]bool, len(fields))
	for _, field := range fields {
		allowed[field] = true
	}
	seen := make(map[string]bool, len(allowed))
	for decoder.More() {
		token, err := decoder.Token()
		if err != nil {
			return err
		}
		key, ok := token.(string)
		if !ok {
			return fmt.Errorf("build request object key is not a string")
		}
		if seen[key] {
			return fmt.Errorf("duplicate build request field %q", key)
		}
		seen[key] = true
		if !allowed[key] {
			return fmt.Errorf("unknown build request field %q", key)
		}
		var value json.RawMessage
		if err := decoder.Decode(&value); err != nil {
			return err
		}
	}
	closing, err := decoder.Token()
	if err != nil {
		return err
	}
	closeDelim, ok := closing.(json.Delim)
	if !ok || closeDelim != '}' {
		return fmt.Errorf("build request object is not closed")
	}
	for _, field := range fields {
		if !seen[field] {
			return fmt.Errorf("missing required build request field %q", field)
		}
	}
	var trailing any
	if err := decoder.Decode(&trailing); err != io.EOF {
		if err == nil {
			return fmt.Errorf("trailing JSON value")
		}
		return fmt.Errorf("trailing request data: %w", err)
	}
	return nil
}

// ValidateRequest checks the exact supported build profile before any compiler
// or output work begins.
func ValidateRequest(request compilercontract.BuildRequest) error {
	if request.Schema != compilercontract.BuildRequestSchema {
		return fmt.Errorf("unsupported build request schema %q", request.Schema)
	}
	if strings.TrimSpace(request.SourceRoot) == "" {
		return fmt.Errorf("sourceRoot is required")
	}
	if len(request.EntryPackages) == 0 {
		return fmt.Errorf("entryPackages must contain at least one package")
	}
	seen := make(map[string]bool, len(request.EntryPackages))
	for index, entry := range request.EntryPackages {
		entry = strings.TrimSpace(entry)
		if entry == "" {
			return fmt.Errorf("entryPackages[%d] must be non-empty", index)
		}
		canonical := path.Clean(strings.ReplaceAll(entry, "\\", "/"))
		if seen[canonical] {
			return fmt.Errorf("entryPackages contains duplicate package %q", entry)
		}
		seen[canonical] = true
	}
	if request.Backend != "react" && request.Backend != "dom" {
		return fmt.Errorf("unsupported backend %q", request.Backend)
	}
	if strings.TrimSpace(request.OutputDir) == "" {
		return fmt.Errorf("outputDir is required")
	}
	return nil
}
