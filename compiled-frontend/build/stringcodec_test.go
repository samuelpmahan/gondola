package build

import (
	"encoding/json"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"

	"github.com/samuelpmahan/gondola/compilercontract"
)

func TestBuildGoScriptStringBoundariesRoundTripUnicode(t *testing.T) {
	root := repositoryRoot(t)
	fixtureRoot, err := os.MkdirTemp(filepath.Join(root, "fixtures", "compiled"), "utf8boundary-")
	if err != nil {
		t.Fatal(err)
	}
	defer os.RemoveAll(fixtureRoot)
	fixtureBytes, err := os.ReadFile(filepath.Join(moduleDir(), "build", "testdata", "utf8app", "app.go"))
	if err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(fixtureRoot, "app.go"), fixtureBytes, 0o600); err != nil {
		t.Fatal(err)
	}
	relativeFixture, err := filepath.Rel(root, fixtureRoot)
	if err != nil {
		t.Fatal(err)
	}
	entry := "github.com/samuelpmahan/gondola/" + filepath.ToSlash(relativeFixture)
	output := filepath.Join(t.TempDir(), "compiled")
	result := Build(compilercontract.BuildRequest{
		Schema:        compilercontract.BuildRequestSchema,
		SourceRoot:    root,
		EntryPackages: []string{entry},
		Backend:       "react",
		OutputDir:     output,
	})
	if !result.OK {
		_, _, _, stageErr := produce(compilercontract.BuildRequest{
			Schema: compilercontract.BuildRequestSchema, SourceRoot: root, EntryPackages: []string{entry}, Backend: "react", OutputDir: output,
		}, t.TempDir())
		t.Fatalf("Unicode fixture build failed: diagnostics=%#v stageError=%v", result.Diagnostics, stageErr)
	}
	if err := os.RemoveAll(fixtureRoot); err != nil {
		t.Fatalf("remove temporary Go fixture: %v", err)
	}
	if len(result.Apps) != 1 || len(result.Apps[0].Components) != 1 {
		t.Fatalf("unexpected build app shape: %#v", result.Apps)
	}
	var manifest buildManifest
	manifestBytes, err := os.ReadFile(filepath.Join(output, "buildmanifest.json"))
	if err != nil {
		t.Fatal(err)
	}
	if err := json.Unmarshal(manifestBytes, &manifest); err != nil {
		t.Fatal(err)
	}
	if len(manifest.Apps) != 1 {
		t.Fatalf("manifest apps = %d, want one", len(manifest.Apps))
	}
	app := manifest.Apps[0]
	modulePath := filepath.Join(output, filepath.FromSlash(app.Module))
	encoderPath := filepath.Join(output, filepath.FromSlash(app.Encoder))
	testScript := filepath.Join(t.TempDir(), "unicode-boundary.mjs")
	const script = `import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";

const app = await import(pathToFileURL(process.argv[2]).href);
const encoder = await import(pathToFileURL(process.argv[3]).href);
const component = app.gobiCompiled.appIR.components[0];
const symbols = app.gobiCompiled.symbols;
const asGoBytes = (text) => String.fromCharCode(...new TextEncoder().encode(text));
const list = (value) => value === null ? [] : Array.isArray(value)
  ? value
  : value.backing.slice(value.offset, value.offset + value.length);
const initialText = "Init café 東京 🙂 −";
const nextText = "操作🙂|值 é";

const state = symbols[component.init]();
assert.equal(state.Text, asGoBytes(initialText), "GoScript state keeps Go UTF-8 byte-string representation");
const originalBytes = state.Text;
const view = symbols[component.view](state);
assert.equal(state.Text, originalBytes, "View boundary conversion does not mutate application state");
assert.equal(view.constructor.name, "_Node");
assert.equal(view.__goStructValue, true);
assert.equal(view.Tag, "main");
assert.equal(view.Key, "根🙂");
const kids = list(view.Kids);
assert.equal(kids[0].Text, initialText);
assert.equal(kids[1].constructor.name, "_Node");
assert.equal(kids[1].Text, "");
const attrs = list(kids[1].Attrs);
assert.equal(attrs.find((item) => item.Name === "aria-label").Value, "Café 東京");
const style = attrs.find((item) => item.Name === "style");
assert.deepEqual(list(style.Style).map((item) => [item.Property, item.Value]), [["content", "Crème brûlée 🙂"]]);
const handler = list(kids[1].On)[0];
assert.deepEqual([handler.Event, handler.Message, handler.Arg], ["click", "保存🙂", "値 é"]);
assert.equal(list(kids[1].Kids)[0].Text, "Button é東京🙂−");

const stateValue = encoder.gobiEncodeState(state, component.stateType);
assert.equal(stateValue.fields.find((field) => field.name === "Text").value.string, initialText);
const [next, effects] = symbols[component.update](state, { Name: "操作🙂", Arg: "值 é" });
assert.deepEqual(list(effects), []);
assert.equal(next.Text, asGoBytes(nextText), "incoming JS text is encoded before GoScript Update");
assert.equal(encoder.gobiEncodeState(next, component.stateType).fields.find((field) => field.name === "Text").value.string, nextText);
assert.equal(list(symbols[component.view](next).Kids)[0].Text, nextText);

const invalid = state.clone();
invalid.Text = String.fromCharCode(0xc3, 0x28);
assert.throws(() => encoder.gobiEncodeState(invalid, component.stateType), /invalid UTF-8/);
assert.throws(() => symbols[component.view](invalid), /invalid UTF-8/);
assert.throws(() => symbols[component.update](state, { Name: "\ud800", Arg: "valid" }), /well-formed Unicode/);
console.log("GoScript string boundary round-trip passed");
`
	if err := os.WriteFile(testScript, []byte(script), 0o600); err != nil {
		t.Fatal(err)
	}
	command := exec.Command(nodeExecutable(), testScript, modulePath, encoderPath)
	command.Dir = root
	outputBytes, err := command.CombinedOutput()
	if err != nil {
		t.Fatalf("generated GoScript string boundary failed: %v\n%s", err, outputBytes)
	}
	if got := string(outputBytes); !strings.HasSuffix(got, "GoScript string boundary round-trip passed\n") {
		t.Fatalf("unexpected boundary check output %q", got)
	}
}
