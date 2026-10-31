package build

import (
	"strings"
	"testing"

	"github.com/samuelpmahan/gondola/compilercontract"
)

func TestDecodeRequestAcceptsExactV1Request(t *testing.T) {
	got, err := DecodeRequest([]byte(`{"schema":"gobi.build-request/v1","sourceRoot":"/src","entryPackages":["./counter"],"backend":"react","outputDir":"/out"}`))
	if err != nil {
		t.Fatal(err)
	}
	if got.Schema != "gobi.build-request/v1" || got.SourceRoot != "/src" || len(got.EntryPackages) != 1 || got.EntryPackages[0] != "./counter" || got.Backend != "react" || got.OutputDir != "/out" {
		t.Fatalf("decoded request = %#v", got)
	}
}

func TestDecodeRequestAcceptsDOMBackend(t *testing.T) {
	got, err := DecodeRequest([]byte(`{"schema":"gobi.build-request/v1","sourceRoot":"/src","entryPackages":["./counter"],"backend":"dom","outputDir":"/out"}`))
	if err != nil {
		t.Fatal(err)
	}
	if got.Backend != "dom" {
		t.Fatalf("decoded backend = %q, want dom", got.Backend)
	}
}

func TestDecodeRequestRejectsUnknownFieldsAndTrailingValues(t *testing.T) {
	valid := `{"schema":"gobi.build-request/v1","sourceRoot":"/src","entryPackages":["./counter"],"backend":"react","outputDir":"/out"}`
	for name, data := range map[string]string{
		"unknown field":      strings.Replace(valid, `"backend":"react"`, `"backend":"react","extra":true`, 1),
		"trailing value":     valid + ` {}`,
		"duplicate field":    strings.Replace(valid, `"schema":"gobi.build-request/v1",`, `"schema":"gobi.build-request/v1","schema":"gobi.build-request/v1",`, 1),
		"missing sourceRoot": strings.Replace(valid, `"sourceRoot":"/src",`, ``, 1),
	} {
		t.Run(name, func(t *testing.T) {
			if _, err := DecodeRequest([]byte(data)); err == nil {
				t.Fatal("DecodeRequest accepted malformed input")
			}
		})
	}
}

func TestValidateRequestRejectsDuplicatesAndUnsupportedBackend(t *testing.T) {
	request := compilercontract.BuildRequest{Schema: "gobi.build-request/v1", SourceRoot: "/src", EntryPackages: []string{"./counter", "./counter"}, Backend: "react", OutputDir: "/out"}
	if err := ValidateRequest(request); err == nil {
		t.Fatal("ValidateRequest accepted duplicate entry package")
	}
	request.EntryPackages = []string{"./counter"}
	request.Backend = "svelte"
	if err := ValidateRequest(request); err == nil {
		t.Fatal("ValidateRequest accepted unsupported backend")
	}
}
