// conformance-fixtures emits app-independent positive and negative snapshots
// for the Go-owned keyed renderer contract.
package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"os"

	"github.com/samuelpmahan/gondola/gobi"
	"github.com/samuelpmahan/gondola/inputbinding"
	"github.com/samuelpmahan/gondola/rendercontract"
)

type fixture struct {
	Name          string  `json:"name"`
	Category      string  `json:"category"`
	Admission     string  `json:"admission"`
	ExpectedValid bool    `json:"expectedValid"`
	ExpectedHTML  *string `json:"expectedHTML"`
	Raw           string  `json:"raw"`
}

type bundle struct {
	Manifest rendercontract.Manifest `json:"manifest"`
	Fixtures []fixture               `json:"fixtures"`
}

func main() {
	fixtures, err := generateFixtures()
	if err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
	encoder := json.NewEncoder(os.Stdout)
	encoder.SetIndent("", "  ")
	if err := encoder.Encode(bundle{Manifest: rendercontract.DefaultManifest(), Fixtures: fixtures}); err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
}

func generateFixtures() ([]fixture, error) {
	items := make([]fixture, 0, 24)
	addSnapshot := func(name, category string, snapshot rendercontract.Snapshot, expected bool) error {
		raw, err := json.Marshal(snapshot)
		if err != nil {
			return fmt.Errorf("marshal fixture %q: %w", name, err)
		}
		item := fixture{Name: name, Category: category, Admission: "snapshot", ExpectedValid: expected, Raw: string(raw)}
		if expected {
			expectedHTML := gobi.HTML(snapshot.Tree)
			item.ExpectedHTML = &expectedHTML
		}
		if err := verifyExpected(item); err != nil {
			return err
		}
		items = append(items, item)
		return nil
	}
	addRaw := func(name, category, admission string, raw string, expected bool) error {
		item := fixture{Name: name, Category: category, Admission: admission, ExpectedValid: expected, Raw: raw}
		if err := verifyExpected(item); err != nil {
			return err
		}
		items = append(items, item)
		return nil
	}

	controlled := controlledSnapshot("typed text <&> café 😀")
	if err := addSnapshot("valid-controlled-keyed-view", "valid", controlled, true); err != nil {
		return nil, err
	}
	if err := addSnapshot("valid-root-text", "valid", snapshot(gobi.Txt("root text <&>"), nil), true); err != nil {
		return nil, err
	}
	if err := addSnapshot("valid-empty-text", "valid", snapshot(gobi.Txt(""), nil), true); err != nil {
		return nil, err
	}
	if err := addSnapshot("valid-adjacent-text-nodes", "valid", snapshot(gobi.El("div",
		gobi.Txt("left <&>"), gobi.Txt(""), gobi.Txt(" right"),
	).Keyed("root"), nil), true); err != nil {
		return nil, err
	}
	if err := addSnapshot("valid-keyed-sibling-reorder", "valid", snapshot(
		gobi.El("div",
			gobi.El("p", gobi.Txt("first")).Keyed("row-a"),
			gobi.El("p", gobi.Txt("second")).Keyed("row-b"),
			gobi.El("p", gobi.Txt("third")).Keyed("row-c"),
		).Keyed("root"), nil), true); err != nil {
		return nil, err
	}
	if err := addSnapshot("valid-max-depth-boundary", "valid", snapshot(depthTree(rendercontract.MaxDepth), nil), true); err != nil {
		return nil, err
	}
	if err := addSnapshot("valid-max-node-boundary", "valid", snapshot(nodeCountTree(rendercontract.MaxNodes), nil), true); err != nil {
		return nil, err
	}

	// Structural JSON schema failures that remain ordinary JSON objects can be
	// checked by both the native parser and JS manifest-driven admission.
	baseRaw, err := json.Marshal(controlled)
	if err != nil {
		return nil, err
	}
	var fields map[string]json.RawMessage
	if err := json.Unmarshal(baseRaw, &fields); err != nil {
		return nil, err
	}
	delete(fields, "messages")
	if err := addRaw("schema-missing-envelope-field", "schema", "snapshot", marshalRaw(fields), false); err != nil {
		return nil, err
	}
	if err := json.Unmarshal(baseRaw, &fields); err != nil {
		return nil, err
	}
	fields["extra"] = json.RawMessage(`true`)
	if err := addRaw("schema-extra-envelope-field", "schema", "snapshot", marshalRaw(fields), false); err != nil {
		return nil, err
	}
	if err := json.Unmarshal(baseRaw, &fields); err != nil {
		return nil, err
	}
	fields["State"] = fields["state"]
	delete(fields, "state")
	if err := addRaw("schema-case-mismatched-envelope-field", "schema", "snapshot", marshalRaw(fields), false); err != nil {
		return nil, err
	}
	for _, item := range []struct {
		name  string
		field string
	}{
		{name: "schema-null-bindings", field: "bindings"},
		{name: "schema-null-messages", field: "messages"},
		{name: "schema-null-tree", field: "tree"},
	} {
		if err := json.Unmarshal(baseRaw, &fields); err != nil {
			return nil, err
		}
		fields[item.field] = json.RawMessage(`null`)
		if err := addRaw(item.name, "schema", "snapshot", marshalRaw(fields), false); err != nil {
			return nil, err
		}
	}
	if err := addRaw("schema-null-node-kind", "schema", "snapshot", string(bytes.Replace(baseRaw, []byte(`"Kind":1`), []byte(`"Kind":null`), 1)), false); err != nil {
		return nil, err
	}
	if err := addRaw("schema-missing-node-field", "schema", "snapshot", string(bytes.Replace(baseRaw, []byte(`,"Text":""}`), []byte(`}`), 1)), false); err != nil {
		return nil, err
	}
	if err := addRaw("schema-null-state", "schema", "snapshot", string(bytes.Replace(baseRaw, []byte(`"state":{"fixture":"keyed-renderer"}`), []byte(`"state":null`), 1)), false); err != nil {
		return nil, err
	}

	if err := addSnapshot("binding-unsupported-event", "binding", invalidBinding(controlled, func(binding *inputbinding.Binding) { binding.Event = "change" }), false); err != nil {
		return nil, err
	}
	if err := addSnapshot("binding-wrong-source", "binding", invalidBinding(controlled, func(binding *inputbinding.Binding) { binding.Source = "current.value" }), false); err != nil {
		return nil, err
	}
	if err := addSnapshot("binding-target-is-not-input", "binding", rendercontract.Snapshot{
		State: objectState(), Tree: gobi.El("div", gobi.El("p").Keyed("copy")).Keyed("root"),
		Bindings: []inputbinding.Binding{{Path: "0", Event: "input", Message: "edit", Source: inputbinding.TargetValue}}, Messages: []gobi.Message{},
	}, false); err != nil {
		return nil, err
	}
	missingValue := controlledSnapshot("draft")
	missingValue.Tree.Kids[0].Attrs = missingValue.Tree.Kids[0].Attrs[:1]
	if err := addSnapshot("binding-missing-controlled-value", "binding", missingValue, false); err != nil {
		return nil, err
	}
	duplicateBinding := controlled
	duplicateBinding.Bindings = append(append([]inputbinding.Binding{}, controlled.Bindings...), controlled.Bindings[0])
	if err := addSnapshot("binding-duplicate-path-event", "binding", duplicateBinding, false); err != nil {
		return nil, err
	}
	for _, item := range []struct {
		name  string
		value string
	}{
		{name: "u0085-only", value: "\u0085"},
		{name: "ufeff-only", value: "\ufeff"},
	} {
		handlerSnapshot := controlledSnapshot("fixture value")
		handlerSnapshot.Tree.Kids[1].On[0].Message = item.value
		if err := addSnapshot("message-handler-"+item.name, "message", handlerSnapshot, false); err != nil {
			return nil, err
		}
		bindingSnapshot := controlledSnapshot("fixture value")
		bindingSnapshot.Bindings[0].Message = item.value
		if err := addSnapshot("message-binding-"+item.name, "message", bindingSnapshot, false); err != nil {
			return nil, err
		}
	}

	if err := addSnapshot("keys-duplicate-global-key", "keys", snapshot(gobi.El("div",
		gobi.El("p").Keyed("shared"), gobi.El("button").Keyed("shared"),
	).Keyed("root"), nil), false); err != nil {
		return nil, err
	}
	if err := addSnapshot("keys-invalid-character", "keys", snapshot(gobi.El("p").Keyed("bad_key"), nil), false); err != nil {
		return nil, err
	}
	if err := addSnapshot("keys-missing-element-key", "keys", snapshot(gobi.El("p"), nil), false); err != nil {
		return nil, err
	}
	if err := addSnapshot("kind-fragment-outside-v1", "kind", snapshot(gobi.Frag(gobi.El("p").Keyed("child")), nil), false); err != nil {
		return nil, err
	}
	if err := addSnapshot("kind-unknown-node-kind", "kind", snapshot(gobi.Node{Kind: gobi.Kind(9)}, nil), false); err != nil {
		return nil, err
	}
	if err := addSnapshot("kind-style-attribute-outside-v1", "kind", snapshot(gobi.El("div").Keyed("root").Css(gobi.S("color", "red")), nil), false); err != nil {
		return nil, err
	}
	if err := addSnapshot("depth-over-limit", "depth", snapshot(depthTree(rendercontract.MaxDepth+1), nil), false); err != nil {
		return nil, err
	}
	if err := addSnapshot("nodes-over-limit", "nodes", snapshot(nodeCountTree(rendercontract.MaxNodes+1), nil), false); err != nil {
		return nil, err
	}

	// JSON text failures have no equivalent browser object; keep them separate
	// from snapshots passed to JS admission.
	if err := addRaw("raw-json-only-duplicate-envelope-key", "schema", "raw-json-only", duplicateFieldRaw(controlled), false); err != nil {
		return nil, err
	}
	if err := addRaw("raw-json-only-malformed-json", "schema", "raw-json-only", `{"state":`, false); err != nil {
		return nil, err
	}
	if err := addRaw("raw-json-only-trailing-json", "schema", "raw-json-only", string(baseRaw)+` {}`, false); err != nil {
		return nil, err
	}
	return items, nil
}

func verifyExpected(item fixture) error {
	_, err := rendercontract.ParseSnapshot([]byte(item.Raw))
	actual := err == nil
	if actual != item.ExpectedValid {
		return fmt.Errorf("fixture %q expected valid=%t but rendercontract returned valid=%t: %v", item.Name, item.ExpectedValid, actual, err)
	}
	return nil
}

func snapshot(tree gobi.Node, bindings []inputbinding.Binding) rendercontract.Snapshot {
	if bindings == nil {
		bindings = []inputbinding.Binding{}
	}
	return rendercontract.Snapshot{State: objectState(), Tree: tree, Bindings: bindings, Messages: []gobi.Message{}}
}

func objectState() json.RawMessage { return json.RawMessage(`{"fixture":"keyed-renderer"}`) }

func controlledSnapshot(value string) rendercontract.Snapshot {
	input := gobi.El("input").Keyed("draft-field").Set("type", "text").Set("value", value)
	button := gobi.El("button", gobi.Txt("Save")).Keyed("save").Set("aria-label", "Save & continue").Flag("disabled").Handle("click", "save", "literal")
	view := gobi.El("div", input, button).Keyed("root")
	return rendercontract.Snapshot{
		State: objectState(), Tree: view,
		Bindings: []inputbinding.Binding{{Path: "0", Event: "input", Message: "draft.changed", Source: inputbinding.TargetValue}},
		Messages: []gobi.Message{{Name: "save", Arg: "literal"}},
	}
}

func invalidBinding(source rendercontract.Snapshot, mutate func(*inputbinding.Binding)) rendercontract.Snapshot {
	clone := source
	clone.Bindings = append([]inputbinding.Binding{}, source.Bindings...)
	mutate(&clone.Bindings[0])
	return clone
}

func depthTree(depth int) gobi.Node {
	root := gobi.El("div").Keyed("depth-0")
	cursor := &root
	for level := 1; level <= depth; level++ {
		child := gobi.El("div").Keyed(fmt.Sprintf("depth-%d", level))
		cursor.Kids = []gobi.Node{child}
		cursor = &cursor.Kids[0]
	}
	return root
}

func nodeCountTree(count int) gobi.Node {
	root := gobi.El("div").Keyed("root")
	root.Kids = make([]gobi.Node, count-1)
	for index := range root.Kids {
		root.Kids[index] = gobi.Txt(fmt.Sprintf("node-%d", index))
	}
	return root
}

func marshalRaw(value any) string {
	raw, err := json.Marshal(value)
	if err != nil {
		panic(err)
	}
	return string(raw)
}

func duplicateFieldRaw(snapshot rendercontract.Snapshot) string {
	tree, err := json.Marshal(snapshot.Tree)
	if err != nil {
		panic(err)
	}
	return fmt.Sprintf(`{"state":%s,"state":%s,"tree":%s,"bindings":[],"messages":[]}`,
		objectState(), objectState(), tree)
}
