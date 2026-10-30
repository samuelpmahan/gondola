package main

import (
	"bytes"
	"encoding/json"
	"flag"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"

	"github.com/samuelpmahan/gondola/compiled-frontend/analyze"
	"github.com/samuelpmahan/gondola/compilercontract"
)

const maxSafe = "9007199254740991"

type probeCase struct {
	name       string
	fieldType  string
	prelude    string
	updateBody string
	helper     string
	target     string
	targetLast bool
	rejectCode string
	expectSafe bool
	optional   bool
}

type caseResult struct {
	Name              string                        `json:"name"`
	ExpectedReject    bool                          `json:"expectedReject"`
	ExpectedAccept    bool                          `json:"expectedAccept"`
	Accepted          bool                          `json:"accepted"`
	Target            string                        `json:"target"`
	TargetSpanMatched bool                          `json:"targetSpanMatched"`
	Diagnostics       []compilercontract.Diagnostic `json:"diagnostics"`
	FalseAccept       bool                          `json:"falseAccept"`
	FalseReject       bool                          `json:"falseReject"`
	Optional          bool                          `json:"optional"`
}

func main() {
	mode := flag.String("mode", "pre", "pre records observations; post asserts rejection")
	flag.Parse()
	if *mode != "pre" && *mode != "post" {
		fatalf("unknown mode %q", *mode)
	}
	root, err := os.Getwd()
	if err != nil {
		fatalf("getwd: %v", err)
	}
	module := readModulePath(filepath.Join(root, "go.mod"))
	base := filepath.Join(root, "coordination", "reviews", "numeric")
	tmpRoot, err := os.MkdirTemp(base, "fixture-scratch-")
	if err != nil {
		fatalf("create temporary source fixtures: %v", err)
	}
	defer os.RemoveAll(tmpRoot)

	cases := []probeCase{
		{name: "mutation_invalidates_guard", fieldType: "int64", updateBody: "if s.Count < " + maxSafe + " {\n\t\ts.Count = " + maxSafe + "\n\t\ts.Count++\n\t}", target: "s.Count++"},
		{name: "upper_guard_large_compound_add", fieldType: "int64", updateBody: "if s.Count < " + maxSafe + " {\n\t\ts.Count += " + maxSafe + "\n\t}", target: "s.Count += " + maxSafe},
		{name: "if_else_guard_leak", fieldType: "int64", updateBody: "if s.Count < " + maxSafe + " {\n\t\ts.Count++\n\t} else {\n\t\ts.Count++\n\t}", target: "s.Count++", targetLast: true},
		{name: "multi_case_or_guard", fieldType: "int64", updateBody: "switch {\n\tcase s.Count < " + maxSafe + ", true:\n\t\ts.Count++\n\t}", target: "s.Count++"},
		{name: "inclusive_max_safe_increment", fieldType: "int64", updateBody: "if s.Count <= " + maxSafe + " {\n\t\ts.Count++\n\t}", target: "s.Count++"},
		{name: "loop_inclusive_bound", fieldType: "int64", updateBody: "for i := int64(0); i <= " + maxSafe + "; i++ {\n\t}", target: "i++"},
		{name: "signed_negative_operand", fieldType: "int64", updateBody: "if s.Count < " + maxSafe + " {\n\t\ts.Count += -1\n\t}", target: "s.Count += -1"},
		{name: "lower_guard_large_compound_sub", fieldType: "int64", updateBody: "if s.Count > -" + maxSafe + " {\n\t\ts.Count -= " + maxSafe + "\n\t}", target: "s.Count -= " + maxSafe},
		{name: "int8_declared_width", fieldType: "int8", updateBody: "if s.Count < 127 {\n\t\ts.Count += 127\n\t}", target: "s.Count += 127"},
		{name: "int32_declared_width", fieldType: "int32", updateBody: "if s.Count < 2147483647 {\n\t\ts.Count += 2147483647\n\t}", target: "s.Count += 2147483647"},
		{name: "unsafe_helper_numeric_parameter", fieldType: "int64", helper: "func bump(v int64) int64 { if v > 0 { v -= -" + maxSafe + " }; return v }", updateBody: "s.Count = bump(s.Count)", target: "v -= -" + maxSafe},
		{name: "unsafe_constant_identifier", fieldType: "int64", prelude: "const TooLarge int64 = 9007199254740992", updateBody: "s.Count = TooLarge", target: "TooLarge", targetLast: true},
		{name: "safe_constant_guard_control", fieldType: "int64", prelude: "const MaxSafe int64 = " + maxSafe, updateBody: "if s.Count < MaxSafe {\n\t\ts.Count++\n\t}", target: "s.Count++", expectSafe: true},
		{name: "mutable_package_global_fails_closed", fieldType: "int64", prelude: "var Shared int64", updateBody: "Shared++", target: "Shared int64", rejectCode: "source.package-global"},
		{name: "init_function_fails_closed", fieldType: "int64", updateBody: "", helper: "func init() {}", target: "func init() {}", rejectCode: "source.init-function"},
		{name: "safe_upper_guard_control", fieldType: "int64", updateBody: "if s.Count < " + maxSafe + " {\n\t\ts.Count++\n\t}", target: "s.Count++", expectSafe: true},
		{name: "safe_lower_guard_control", fieldType: "int64", updateBody: "if s.Count > 0 {\n\t\ts.Count--\n\t}", target: "s.Count--", expectSafe: true},
		{name: "safe_int8_width_control", fieldType: "int8", updateBody: "if s.Count < 127 {\n\t\ts.Count++\n\t}", target: "s.Count++", expectSafe: true},
		{name: "safe_int32_width_control", fieldType: "int32", updateBody: "if s.Count < 2147483647 {\n\t\ts.Count++\n\t}", target: "s.Count++", expectSafe: true},
		{name: "safe_compound_add_control", fieldType: "int64", updateBody: "if s.Count < " + maxSafe + " {\n\t\ts.Count += 1\n\t}", target: "s.Count += 1", expectSafe: true, optional: true},
		{name: "exact_lower_boundary_control", fieldType: "int64", updateBody: "if s.Count > -" + maxSafe + " {\n\t\ts.Count--\n\t}", target: "s.Count--", expectSafe: true},
		{name: "cross_function_safe_numeric_parameter", fieldType: "int64", helper: "func bump(v int64) int64 { return v + 1 }", updateBody: "if s.Count < 9007199254740990 {\n\t\ts.Count = bump(s.Count)\n\t}", target: "v + 1", expectSafe: true, optional: true},
	}

	entries := make([]string, 0, len(cases))
	sources := make(map[string]string, len(cases))
	for _, item := range cases {
		dir := filepath.Join(tmpRoot, item.name)
		if err := os.MkdirAll(dir, 0o755); err != nil {
			fatalf("mkdir fixture %s: %v", item.name, err)
		}
		source := sourceFor(item)
		if err := os.WriteFile(filepath.Join(dir, "app.go"), []byte(source), 0o600); err != nil {
			fatalf("write fixture %s: %v", item.name, err)
		}
		entry := module + "/coordination/reviews/numeric/" + filepath.Base(tmpRoot) + "/" + item.name
		entries = append(entries, entry)
		sources[item.name] = source
	}

	program, loadDiagnostics := analyze.LoadSources(root, entries)
	result := analyze.Analyze(program, compilercontract.AnalyzeOptions{EntryPackages: entries})
	allDiagnostics := append(append([]compilercontract.Diagnostic{}, loadDiagnostics...), result.Diagnostics...)
	results := make([]caseResult, 0, len(cases))
	failed := false
	for _, item := range cases {
		source := sources[item.name]
		start := strings.Index(source, item.target)
		if item.targetLast {
			start = strings.LastIndex(source, item.target)
		}
		if start < 0 {
			fatalf("target %q missing in case %s", item.target, item.name)
		}
		end := start + len(item.target)
		wantPath := filepath.ToSlash(filepath.Join("coordination/reviews/numeric", filepath.Base(tmpRoot), item.name, "app.go"))
		var caseDiagnostics []compilercontract.Diagnostic
		spanMatched := false
		for _, diagnostic := range allDiagnostics {
			if diagnostic.Span.File == wantPath {
				caseDiagnostics = append(caseDiagnostics, diagnostic)
				wantCode := item.rejectCode
				if wantCode == "" {
					wantCode = "analyze.numeric-profile"
				}
				if diagnostic.Code == wantCode && diagnostic.Span.StartByte <= start && diagnostic.Span.EndByte >= end {
					spanMatched = true
				}
			}
		}
		accepted := !spanMatched
		probe := caseResult{
			Name: item.name, ExpectedReject: !item.expectSafe && !item.optional,
			ExpectedAccept: item.expectSafe, Accepted: accepted,
			Target: item.target, TargetSpanMatched: spanMatched,
			Diagnostics: caseDiagnostics,
			FalseAccept: !item.expectSafe && !item.optional && accepted,
			FalseReject: item.expectSafe && !accepted, Optional: item.optional,
		}
		results = append(results, probe)
		if *mode == "post" && item.expectSafe && !item.optional && !accepted {
			failed = true
		}
		if *mode == "post" && !item.expectSafe && !item.optional && !spanMatched {
			failed = true
		}
	}

	encoding := checkEncoderBoundary(root, tmpRoot)
	if *mode == "post" && (!encoding.NativeIntMaxAccepted || encoding.NativeIntMaxText != maxSafe || encoding.NativeIntAboveMaxAccepted || !encoding.NativeIntMinAccepted || encoding.NativeIntMinText != "-"+maxSafe || encoding.NativeIntBelowMinAccepted || !encoding.NativeUintMaxAccepted || encoding.NativeUintMaxText != maxSafe || encoding.NativeUintAboveMaxAccepted || !encoding.NativeInt64FullWidthAccepted || encoding.NativeInt64FullWidthText != "9223372036854775807" || !encoding.NativeUint64FullWidthAccepted || encoding.NativeUint64FullWidthText != "18446744073709551615" || !encoding.JSIntMaxAccepted || encoding.JSIntMaxText != maxSafe || encoding.JSIntAboveMaxAccepted || !encoding.JSIntMinAccepted || encoding.JSIntMinText != "-"+maxSafe || encoding.JSIntBelowMinAccepted || !encoding.JSUintMaxAccepted || encoding.JSUintMaxText != maxSafe || encoding.JSUintAboveMaxAccepted || !encoding.JSInt64FullWidthAccepted || encoding.JSInt64FullWidthText != "9223372036854775807" || !encoding.JSUint64FullWidthAccepted || encoding.JSUint64FullWidthText != "18446744073709551615") {
		failed = true
	}
	fourFixturePositive := checkPositiveFixtures(root)
	if *mode == "post" && fourFixturePositive["ok"] != true {
		failed = true
	}
	writeJSON(map[string]any{
		"mode":                *mode,
		"sourceRoot":          root,
		"cases":               results,
		"loadDiagnostics":     loadDiagnostics,
		"analysisDiagnostics": result.Diagnostics,
		"encoderBoundary":     encoding,
		"fourFixturePositive": fourFixturePositive,
	})
	if failed {
		os.Exit(2)
	}
}

func sourceFor(item probeCase) string {
	helper := ""
	if item.helper != "" {
		helper = item.helper + "\n"
	}
	prelude := ""
	if item.prelude != "" {
		prelude = item.prelude + "\n"
	}
	return "package probe\n\ntype State struct { Count " + item.fieldType + " }\ntype Message struct { Name, Arg string }\ntype Effect struct { Kind, Name, Arg, Reply string }\ntype Node struct { Tag string }\n\n" + prelude +
		"func Init() State { return State{} }\n" +
		"func Update(s State, m Message) (State, []Effect) {\n\t" + strings.ReplaceAll(item.updateBody, "\n", "\n\t") + "\n\treturn s, nil\n}\n" +
		"func View(s State) Node { return Node{} }\n" + helper
}

type encoderBoundary struct {
	NativeIntMaxAccepted          bool   `json:"nativeIntMaxAccepted"`
	NativeIntMaxText              string `json:"nativeIntMaxText"`
	NativeIntAboveMaxAccepted     bool   `json:"nativeIntAboveMaxAccepted"`
	NativeIntAboveMaxText         string `json:"nativeIntAboveMaxText"`
	NativeIntMinAccepted          bool   `json:"nativeIntMinAccepted"`
	NativeIntMinText              string `json:"nativeIntMinText"`
	NativeIntBelowMinAccepted     bool   `json:"nativeIntBelowMinAccepted"`
	NativeUintMaxAccepted         bool   `json:"nativeUintMaxAccepted"`
	NativeUintMaxText             string `json:"nativeUintMaxText"`
	NativeUintAboveMaxAccepted    bool   `json:"nativeUintAboveMaxAccepted"`
	NativeUintAboveMaxText        string `json:"nativeUintAboveMaxText"`
	NativeInt64FullWidthAccepted  bool   `json:"nativeInt64FullWidthAccepted"`
	NativeInt64FullWidthText      string `json:"nativeInt64FullWidthText"`
	NativeUint64FullWidthAccepted bool   `json:"nativeUint64FullWidthAccepted"`
	NativeUint64FullWidthText     string `json:"nativeUint64FullWidthText"`
	JSIntMaxAccepted              bool   `json:"jsIntMaxAccepted"`
	JSIntMaxText                  string `json:"jsIntMaxText"`
	JSIntAboveMaxAccepted         bool   `json:"jsIntAboveMaxAccepted"`
	JSIntMinAccepted              bool   `json:"jsIntMinAccepted"`
	JSIntMinText                  string `json:"jsIntMinText"`
	JSIntBelowMinAccepted         bool   `json:"jsIntBelowMinAccepted"`
	JSUintMaxAccepted             bool   `json:"jsUintMaxAccepted"`
	JSUintMaxText                 string `json:"jsUintMaxText"`
	JSUintAboveMaxAccepted        bool   `json:"jsUintAboveMaxAccepted"`
	JSInt64FullWidthAccepted      bool   `json:"jsInt64FullWidthAccepted"`
	JSInt64FullWidthText          string `json:"jsInt64FullWidthText"`
	JSUint64FullWidthAccepted     bool   `json:"jsUint64FullWidthAccepted"`
	JSUint64FullWidthText         string `json:"jsUint64FullWidthText"`
	JSNodeOutput                  string `json:"jsNodeOutput"`
}

func checkEncoderBoundary(root, tmpRoot string) encoderBoundary {
	types := []compilercontract.TypeInfo{
		{ID: "int", Kind: compilercontract.KindInt, Bits: 64, JSRepresentation: compilercontract.JSNumber},
		{ID: "uint", Kind: compilercontract.KindUint, Bits: 64, JSRepresentation: compilercontract.JSNumber},
		{ID: "int64", Kind: compilercontract.KindInt, Bits: 64, JSRepresentation: compilercontract.JSBigInt},
		{ID: "uint64", Kind: compilercontract.KindUint, Bits: 64, JSRepresentation: compilercontract.JSBigInt},
	}
	encodeNative := func(value any, typeID compilercontract.TypeID) (string, bool) {
		encoded, err := compilercontract.EncodeValue(value, typeID, types)
		if err != nil {
			return "", false
		}
		return *encoded.Integer, true
	}
	nativeIntMax, nativeIntMaxOK := encodeNative(int(9007199254740991), "int")
	nativeIntAbove, nativeIntAboveOK := encodeNative(int(9007199254740992), "int")
	nativeIntMin, nativeIntMinOK := encodeNative(int(-9007199254740991), "int")
	_, nativeIntBelowOK := encodeNative(int(-9007199254740992), "int")
	nativeUintMax, nativeUintMaxOK := encodeNative(uint(9007199254740991), "uint")
	nativeUintAbove, nativeUintAboveOK := encodeNative(uint(9007199254740992), "uint")
	nativeInt64Max, nativeInt64MaxOK := encodeNative(int64(9223372036854775807), "int64")
	nativeUint64Max, nativeUint64MaxOK := encodeNative(^uint64(0), "uint64")
	module, err := compilercontract.GenerateValueEncoder(types)
	if err != nil {
		fatalf("GenerateValueEncoder: %v", err)
	}
	modulePath := filepath.Join(tmpRoot, "encoder.mjs")
	checkPath := filepath.Join(tmpRoot, "encoder-check.mjs")
	if err := os.WriteFile(modulePath, []byte(module), 0o600); err != nil {
		fatalf("write encoder module: %v", err)
	}
	check := `import { gobiEncodeState } from "./encoder.mjs";
const attempt = (run) => { try { return {accepted:true, value:run()}; } catch { return {accepted:false}; } };
const result = {
  intMax:attempt(()=>gobiEncodeState(9007199254740991,"int").integer),
  intAboveMax:attempt(()=>gobiEncodeState(9007199254740992,"int").integer),
  intMin:attempt(()=>gobiEncodeState(-9007199254740991,"int").integer),
  intBelowMin:attempt(()=>gobiEncodeState(-9007199254740992,"int").integer),
  uintMax:attempt(()=>gobiEncodeState(9007199254740991,"uint").integer),
  uintAboveMax:attempt(()=>gobiEncodeState(9007199254740992,"uint").integer),
  int64FullWidth:attempt(()=>gobiEncodeState(9223372036854775807n,"int64").integer),
  uint64FullWidth:attempt(()=>gobiEncodeState(18446744073709551615n,"uint64").integer),
};
console.log(JSON.stringify(result));
`
	if err := os.WriteFile(checkPath, []byte(check), 0o600); err != nil {
		fatalf("write encoder check: %v", err)
	}
	node := os.Getenv("GONDOLA_NODE_BIN")
	if node == "" {
		node = "/tmp/gondola-node22/node_modules/node/bin/node"
	}
	command := exec.Command(node, checkPath)
	command.Dir = tmpRoot
	var output, stderr bytes.Buffer
	command.Stdout = &output
	command.Stderr = &stderr
	err = command.Run()
	if err != nil {
		fatalf("run generated encoder at numeric boundary: %v: stdout=%s stderr=%s", err, output.String(), stderr.String())
	}
	var js map[string]struct {
		Accepted bool   `json:"accepted"`
		Value    string `json:"value"`
	}
	if err := json.Unmarshal(output.Bytes(), &js); err != nil {
		fatalf("parse generated encoder output %q: %v", output.String(), err)
	}
	return encoderBoundary{
		NativeIntMaxAccepted: nativeIntMaxOK, NativeIntMaxText: nativeIntMax,
		NativeIntAboveMaxAccepted: nativeIntAboveOK, NativeIntAboveMaxText: nativeIntAbove,
		NativeIntMinAccepted: nativeIntMinOK, NativeIntMinText: nativeIntMin,
		NativeIntBelowMinAccepted: nativeIntBelowOK,
		NativeUintMaxAccepted:     nativeUintMaxOK, NativeUintMaxText: nativeUintMax,
		NativeUintAboveMaxAccepted: nativeUintAboveOK, NativeUintAboveMaxText: nativeUintAbove,
		NativeInt64FullWidthAccepted: nativeInt64MaxOK, NativeInt64FullWidthText: nativeInt64Max,
		NativeUint64FullWidthAccepted: nativeUint64MaxOK, NativeUint64FullWidthText: nativeUint64Max,
		JSIntMaxAccepted: js["intMax"].Accepted, JSIntMaxText: js["intMax"].Value,
		JSIntAboveMaxAccepted: js["intAboveMax"].Accepted,
		JSIntMinAccepted:      js["intMin"].Accepted, JSIntMinText: js["intMin"].Value,
		JSIntBelowMinAccepted: js["intBelowMin"].Accepted,
		JSUintMaxAccepted:     js["uintMax"].Accepted, JSUintMaxText: js["uintMax"].Value,
		JSUintAboveMaxAccepted:   js["uintAboveMax"].Accepted,
		JSInt64FullWidthAccepted: js["int64FullWidth"].Accepted, JSInt64FullWidthText: js["int64FullWidth"].Value,
		JSUint64FullWidthAccepted: js["uint64FullWidth"].Accepted, JSUint64FullWidthText: js["uint64FullWidth"].Value,
		JSNodeOutput: strings.TrimSpace(output.String()),
	}
}

func checkPositiveFixtures(root string) map[string]any {
	entries := []string{
		"github.com/samuelpmahan/gondola/counter",
		"github.com/samuelpmahan/gondola/fixtures/compiled/form",
		"github.com/samuelpmahan/gondola/fixtures/compiled/list",
		"github.com/samuelpmahan/gondola/fixtures/compiled/effect",
	}
	program, loadDiagnostics := analyze.LoadSources(filepath.Dir(root), entries)
	if len(loadDiagnostics) != 0 {
		return map[string]any{"ok": false, "stage": "LoadSources", "diagnostics": loadDiagnostics}
	}
	result := analyze.Analyze(program, compilercontract.AnalyzeOptions{EntryPackages: entries})
	return map[string]any{"ok": len(result.Diagnostics) == 0 && len(result.Apps) == 4, "appCount": len(result.Apps), "diagnostics": result.Diagnostics}
}

func readModulePath(path string) string {
	data, err := os.ReadFile(path)
	if err != nil {
		fatalf("read go.mod: %v", err)
	}
	for _, line := range strings.Split(string(data), "\n") {
		fields := strings.Fields(line)
		if len(fields) == 2 && fields[0] == "module" {
			return fields[1]
		}
	}
	fatalf("go.mod missing module directive")
	return ""
}

func writeJSON(value any) {
	data, err := json.MarshalIndent(value, "", "  ")
	if err != nil {
		fatalf("marshal result: %v", err)
	}
	fmt.Println(string(data))
}

func fatalf(format string, args ...any) {
	fmt.Fprintf(os.Stderr, format+"\n", args...)
	os.Exit(1)
}
