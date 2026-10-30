package rendercontract

import (
	"encoding/json"
	"fmt"
	"reflect"
	"strings"
	"testing"

	"github.com/samuelpmahan/gondola/gobi"
	"github.com/samuelpmahan/gondola/inputbinding"
)

const validSnapshotJSON = `{"state":{"ready":true},"tree":{"Kind":1,"Tag":"div","Key":"root","Attrs":[],"On":[],"Kids":[{"Kind":1,"Tag":"input","Key":"name","Attrs":[{"Name":"type","Value":"text","Flag":false,"Style":null},{"Name":"value","Value":"initial","Flag":false,"Style":[]}],"On":[],"Kids":null,"Text":""}],"Text":""},"bindings":[{"Path":"0","Event":"input","Message":"change","Source":"target.value"}],"messages":[]}`

func TestDefaultManifestAdvertisesTheBoundedV1Surface(t *testing.T) {
	gotJSON, err := json.Marshal(DefaultManifest())
	if err != nil {
		t.Fatal(err)
	}
	var got map[string]any
	if err := json.Unmarshal(gotJSON, &got); err != nil {
		t.Fatal(err)
	}
	want := map[string]any{
		"protocol":          "gobi.keyed-renderer",
		"version":           float64(1),
		"capabilities":      []any{"keyed-update", "controlled-input", "disabled-controls", "logical-focus", "failure-notification"},
		"methods":           []any{"update", "snapshot", "domSnapshot", "click", "focusState", "restoreFocus", "unmount"},
		"tags":              []any{"div", "p", "input", "button"},
		"attributes":        []any{"class", "type", "value", "aria-label", "disabled"},
		"events":            []any{"click", "input"},
		"nodeKinds":         []any{float64(1), float64(2)},
		"messageBlankRunes": "\t\n\v\f\r \u0085\u00a0\u1680\u2000\u2001\u2002\u2003\u2004\u2005\u2006\u2007\u2008\u2009\u200a\u2028\u2029\u202f\u205f\u3000\ufeff",
		"keyPattern":        "^[A-Za-z][A-Za-z0-9-]{0,63}$",
		"maxDepth":          float64(64),
		"maxNodes":          float64(4096),
	}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("manifest = %#v, want %#v", got, want)
	}
}

func TestValidateSnapshotUsesTheManifestBlankRuneSetForMessages(t *testing.T) {
	base, err := ParseSnapshot([]byte(validSnapshotJSON))
	if err != nil {
		t.Fatal(err)
	}
	manifest := DefaultManifest()
	for _, blank := range manifest.MessageBlankRunes {
		for _, field := range []string{"handler", "binding"} {
			got := base
			got.Tree = cloneNode(base.Tree)
			got.Bindings = append([]inputbinding.Binding(nil), base.Bindings...)
			got.Messages = append([]gobi.Message{}, base.Messages...)
			if field == "handler" {
				got.Tree.On = []gobi.On{{Event: "click", Message: string(blank)}}
			} else {
				got.Bindings[0].Message = string(blank)
			}
			if err := ValidateSnapshot(got); err == nil {
				t.Errorf("accepted a blank %s Message containing U+%04X", field, blank)
			}
		}
	}

	for _, field := range []string{"handler", "binding"} {
		got := base
		got.Tree = cloneNode(base.Tree)
		got.Bindings = append([]inputbinding.Binding(nil), base.Bindings...)
		if field == "handler" {
			got.Tree.On = []gobi.On{{Event: "click", Message: "\u200b"}}
		} else {
			got.Bindings[0].Message = "\u200b"
		}
		if err := ValidateSnapshot(got); err != nil {
			t.Errorf("rejected nonblank %s Message containing U+200B: %v", field, err)
		}
	}
}

func TestValidateSnapshotRejectsWhitespaceOutsideJSONWhitespaceAroundState(t *testing.T) {
	base, err := ParseSnapshot([]byte(validSnapshotJSON))
	if err != nil {
		t.Fatal(err)
	}
	for _, whitespace := range []string{"\u00a0", "\v", "\f", "\u0085", "\u2000", "\ufeff"} {
		snapshot := base
		snapshot.State = json.RawMessage(whitespace + `{"opaque":true}`)
		if err := ValidateSnapshot(snapshot); err == nil {
			t.Errorf("ValidateSnapshot accepted non-JSON leading whitespace U+%04X", []rune(whitespace)[0])
		}
	}
}

func TestValidateSnapshotAcceptsRFCJSONWhitespaceAroundState(t *testing.T) {
	base, err := ParseSnapshot([]byte(validSnapshotJSON))
	if err != nil {
		t.Fatal(err)
	}
	base.State = json.RawMessage(" \t\r\n{\"opaque\":true} \t\r\n")
	if err := ValidateSnapshot(base); err != nil {
		t.Fatalf("RFC JSON whitespace around state was rejected: %v", err)
	}
}

func TestParseSnapshotAcceptsTheExistingGoWireShape(t *testing.T) {
	got, err := ParseSnapshot([]byte(validSnapshotJSON))
	if err != nil {
		t.Fatal(err)
	}
	if string(got.State) != `{"ready":true}` {
		t.Fatalf("state = %s", got.State)
	}
	if got.Tree.Tag != "div" || got.Tree.Kids[0].Tag != "input" || got.Tree.Kids[0].Key != "name" {
		t.Fatalf("tree was not decoded with Go field names: %#v", got.Tree)
	}
	if len(got.Bindings) != 1 || got.Bindings[0] != (inputbinding.Binding{Path: "0", Event: "input", Message: "change", Source: inputbinding.TargetValue}) {
		t.Fatalf("bindings = %#v", got.Bindings)
	}
	if got.Messages == nil {
		t.Fatal("empty messages array became nil")
	}
}

func TestParseSnapshotRejectsMalformedEnvelopeAndDuplicateKeys(t *testing.T) {
	tests := []struct {
		name string
		raw  string
	}{
		{"missing envelope field", `{"state":{},"tree":{"Kind":2,"Tag":"","Key":"","Attrs":null,"On":null,"Kids":null,"Text":"x"},"bindings":[]}`},
		{"extra envelope field", strings.TrimSuffix(validSnapshotJSON, "}") + `,"extra":true}`},
		{"duplicate envelope field", strings.Replace(validSnapshotJSON, `"state":{"ready":true}`, `"state":{"ready":true},"state":{"ready":false}`, 1)},
		{"duplicate state field", strings.Replace(validSnapshotJSON, `"ready":true`, `"ready":true,"ready":false`, 1)},
		{"trailing JSON", validSnapshotJSON + ` {}`},
		{"malformed JSON", strings.Replace(validSnapshotJSON, `"ready":true`, `"ready":`, 1)},
		{"null state", strings.Replace(validSnapshotJSON, `"state":{"ready":true}`, `"state":null`, 1)},
		{"array state", strings.Replace(validSnapshotJSON, `"state":{"ready":true}`, `"state":[]`, 1)},
		{"null tree", strings.Replace(validSnapshotJSON, `"tree":{`, `"tree":null`, 1)},
		{"capitalized envelope alias", strings.Replace(validSnapshotJSON, `"state":`, `"State":`, 1)},
		{"lowercase Node alias", strings.Replace(validSnapshotJSON, `"Kind":1`, `"kind":1`, 1)},
		{"null bindings", strings.Replace(validSnapshotJSON, `"bindings":[`, `"bindings":null`, 1)},
		{"null messages", strings.Replace(validSnapshotJSON, `"messages":[]`, `"messages":null`, 1)},
		{"null node kind", strings.Replace(validSnapshotJSON, `"Kind":1`, `"Kind":null`, 1)},
		{"missing node field", strings.Replace(validSnapshotJSON, `,"Text":""}`, `}`, 1)},
		{"extra node field", strings.Replace(validSnapshotJSON, `"Key":"root"`, `"Key":"root","extra":0`, 1)},
		{"null node tag", strings.Replace(validSnapshotJSON, `"Tag":"div"`, `"Tag":null`, 1)},
		{"null attribute flag", strings.Replace(validSnapshotJSON, `"Flag":false`, `"Flag":null`, 1)},
		{"duplicate nested attr field", strings.Replace(validSnapshotJSON, `"Name":"type"`, `"Name":"type","Name":"type"`, 1)},
		{"binding primitive null", strings.Replace(validSnapshotJSON, `"Message":"change"`, `"Message":null`, 1)},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if _, err := ParseSnapshot([]byte(tt.raw)); err == nil {
				t.Fatalf("ParseSnapshot accepted %s", tt.name)
			}
		})
	}
}

func TestParseSnapshotPreservesOrdinaryNullNodeSlices(t *testing.T) {
	raw := `{"state":{},"tree":{"Kind":2,"Tag":"","Key":"","Attrs":null,"On":null,"Kids":null,"Text":"hello"},"bindings":[],"messages":[]}`
	got, err := ParseSnapshot([]byte(raw))
	if err != nil {
		t.Fatal(err)
	}
	if got.Tree.Attrs != nil || got.Tree.On != nil || got.Tree.Kids != nil {
		t.Fatalf("null node slices were not preserved: %#v", got.Tree)
	}
}

func TestValidateSnapshotAcceptsBoundedKeyedInputTree(t *testing.T) {
	snapshot, err := ParseSnapshot([]byte(validSnapshotJSON))
	if err != nil {
		t.Fatal(err)
	}
	if err := ValidateSnapshot(snapshot); err != nil {
		t.Fatal(err)
	}
}

func TestValidateSnapshotRejectsUnsupportedTreeShapes(t *testing.T) {
	valid, err := ParseSnapshot([]byte(validSnapshotJSON))
	if err != nil {
		t.Fatal(err)
	}
	tests := []struct {
		name string
		edit func(*Snapshot)
	}{
		{"fragment kind", func(s *Snapshot) { s.Tree.Kind = gobi.Fragment }},
		{"unsupported kind", func(s *Snapshot) { s.Tree.Kind = 9 }},
		{"unsupported tag", func(s *Snapshot) { s.Tree.Tag = "section" }},
		{"element text", func(s *Snapshot) { s.Tree.Text = "unexpected" }},
		{"duplicate key", func(s *Snapshot) { s.Tree.Kids = append(s.Tree.Kids, s.Tree.Kids[0]) }},
		{"invalid key token", func(s *Snapshot) { s.Tree.Key = "bad key" }},
		{"text key", func(s *Snapshot) { s.Tree = gobi.Node{Kind: gobi.Text, Key: "text-key", Text: "x"} }},
		{"unsupported attr", func(s *Snapshot) { s.Tree.Attrs = []gobi.Attr{{Name: "id", Value: "x"}} }},
		{"duplicate attr", func(s *Snapshot) {
			s.Tree.Attrs = []gobi.Attr{{Name: "class", Value: "a"}, {Name: "class", Value: "b"}}
		}},
		{"structured style", func(s *Snapshot) {
			s.Tree.Attrs = []gobi.Attr{{Name: "class", Style: []gobi.Style{{Property: "color", Value: "red"}}}}
		}},
		{"bad disabled flag", func(s *Snapshot) { s.Tree.Attrs = []gobi.Attr{{Name: "disabled", Value: "yes", Flag: true}} }},
		{"value on non-input", func(s *Snapshot) { s.Tree.Attrs = []gobi.Attr{{Name: "value", Value: "x"}} }},
		{"non-click literal handler", func(s *Snapshot) { s.Tree.On = []gobi.On{{Event: "input", Message: "change"}} }},
		{"blank literal message", func(s *Snapshot) { s.Tree.On = []gobi.On{{Event: "click", Message: "  "}} }},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := valid
			got.Tree = cloneNode(valid.Tree)
			got.Bindings = append([]inputbinding.Binding(nil), valid.Bindings...)
			tt.edit(&got)
			if err := ValidateSnapshot(got); err == nil {
				t.Fatalf("ValidateSnapshot accepted %s", tt.name)
			}
		})
	}
}

func TestValidateSnapshotEnforcesInputAndBindingRules(t *testing.T) {
	valid, err := ParseSnapshot([]byte(validSnapshotJSON))
	if err != nil {
		t.Fatal(err)
	}
	tests := []struct {
		name string
		edit func(*Snapshot)
	}{
		{"noncanonical path", func(s *Snapshot) { s.Bindings[0].Path = "00" }},
		{"unsupported source", func(s *Snapshot) { s.Bindings[0].Source = "target.checked" }},
		{"missing value", func(s *Snapshot) { s.Tree.Kids[0].Attrs = s.Tree.Kids[0].Attrs[:1] }},
		{"binding collision", func(s *Snapshot) { s.Tree.Kids[0].On = []gobi.On{{Event: "input", Message: "other"}} }},
		{"duplicate binding", func(s *Snapshot) { s.Bindings = append(s.Bindings, s.Bindings[0]) }},
		{"null bindings", func(s *Snapshot) { s.Bindings = nil }},
		{"null messages", func(s *Snapshot) { s.Messages = nil }},
		{"non-object state", func(s *Snapshot) { s.State = json.RawMessage(`[]`) }},
		{"non-finite state number", func(s *Snapshot) { s.State = json.RawMessage(`{"n":1e999}`) }},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := valid
			got.Tree = cloneNode(valid.Tree)
			got.Bindings = append([]inputbinding.Binding(nil), valid.Bindings...)
			got.Messages = append([]gobi.Message{}, valid.Messages...)
			tt.edit(&got)
			if err := ValidateSnapshot(got); err == nil {
				t.Fatalf("ValidateSnapshot accepted %s", tt.name)
			}
		})
	}
}

func TestValidateSnapshotUsesRootDepthZeroAndNodeLimit(t *testing.T) {
	if err := ValidateSnapshot(Snapshot{State: json.RawMessage(`{}`), Tree: elementChain(65), Bindings: []inputbinding.Binding{}, Messages: []gobi.Message{}}); err != nil {
		t.Fatalf("depth 64 should be accepted: %v", err)
	}
	if err := ValidateSnapshot(Snapshot{State: json.RawMessage(`{}`), Tree: elementChain(66), Bindings: []inputbinding.Binding{}, Messages: []gobi.Message{}}); err == nil {
		t.Fatal("accepted a node at depth 65")
	}

	makeWide := func(textNodes int) Snapshot {
		kids := make([]gobi.Node, textNodes)
		for i := range kids {
			kids[i] = gobi.Node{Kind: gobi.Text, Text: "x"}
		}
		return Snapshot{State: json.RawMessage(`{}`), Tree: gobi.Node{Kind: gobi.Element, Tag: "div", Key: "root", Kids: kids}, Bindings: []inputbinding.Binding{}, Messages: []gobi.Message{}}
	}
	if err := ValidateSnapshot(makeWide(4095)); err != nil {
		t.Fatalf("4096 nodes should be accepted: %v", err)
	}
	if err := ValidateSnapshot(makeWide(4096)); err == nil {
		t.Fatal("accepted 4097 nodes")
	}
}

func cloneNode(node gobi.Node) gobi.Node {
	copy := node
	copy.Attrs = append([]gobi.Attr(nil), node.Attrs...)
	copy.On = append([]gobi.On(nil), node.On...)
	copy.Kids = make([]gobi.Node, len(node.Kids))
	for i := range node.Kids {
		copy.Kids[i] = cloneNode(node.Kids[i])
	}
	return copy
}

func elementChain(count int) gobi.Node {
	node := gobi.Node{Kind: gobi.Element, Tag: "div", Key: fmt.Sprintf("k%d", count-1)}
	for i := count - 2; i >= 0; i-- {
		key := fmt.Sprintf("k%d", i)
		node = gobi.Node{Kind: gobi.Element, Tag: "div", Key: key, Kids: []gobi.Node{node}}
	}
	return node
}
