// Package rendercontract defines and validates the v1 bounded keyed-renderer
// snapshot exchanged by Go applications and browser renderers.
package rendercontract

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"math"
	"regexp"
	"strconv"
	"strings"
	"unicode/utf8"

	"github.com/samuelpmahan/gondola/gobi"
	"github.com/samuelpmahan/gondola/inputbinding"
)

const (
	Protocol          = "gobi.keyed-renderer"
	Version           = 1
	MaxDepth          = 64
	MaxNodes          = 4096
	KeyPattern        = "^[A-Za-z][A-Za-z0-9-]{0,63}$"
	messageBlankRunes = "\t\n\v\f\r \u0085\u00a0\u1680\u2000\u2001\u2002\u2003\u2004\u2005\u2006\u2007\u2008\u2009\u200a\u2028\u2029\u202f\u205f\u3000\ufeff"
)

var keyToken = regexp.MustCompile(KeyPattern)

// Manifest is the Go-owned admission document for the keyed renderer v1
// surface. JSON field names are part of the wire contract.
type Manifest struct {
	Protocol          string   `json:"protocol"`
	Version           int      `json:"version"`
	Capabilities      []string `json:"capabilities"`
	Methods           []string `json:"methods"`
	Tags              []string `json:"tags"`
	Attributes        []string `json:"attributes"`
	Events            []string `json:"events"`
	NodeKinds         []int    `json:"nodeKinds"`
	MessageBlankRunes string   `json:"messageBlankRunes"`
	KeyPattern        string   `json:"keyPattern"`
	MaxDepth          int      `json:"maxDepth"`
	MaxNodes          int      `json:"maxNodes"`
}

// Snapshot carries application state opaquely alongside its rendered Gobi
// tree, dynamic bindings, and ordered application messages.
type Snapshot struct {
	State    json.RawMessage        `json:"state"`
	Tree     gobi.Node              `json:"tree"`
	Bindings []inputbinding.Binding `json:"bindings"`
	Messages []gobi.Message         `json:"messages"`
}

// DefaultManifest returns the immutable v1 renderer contract as fresh slices.
func DefaultManifest() Manifest {
	return Manifest{
		Protocol: Protocol,
		Version:  Version,
		Capabilities: []string{
			"keyed-update",
			"controlled-input",
			"disabled-controls",
			"logical-focus",
			"failure-notification",
		},
		Methods: []string{
			"update",
			"snapshot",
			"domSnapshot",
			"click",
			"focusState",
			"restoreFocus",
			"unmount",
		},
		Tags:              []string{"div", "p", "input", "button"},
		Attributes:        []string{"class", "type", "value", "aria-label", "disabled"},
		Events:            []string{"click", "input"},
		NodeKinds:         []int{int(gobi.Element), int(gobi.Text)},
		MessageBlankRunes: messageBlankRunes,
		KeyPattern:        KeyPattern,
		MaxDepth:          MaxDepth,
		MaxNodes:          MaxNodes,
	}
}

// ParseSnapshot strictly decodes one complete JSON snapshot, rejecting
// duplicate/unknown/missing fields and then applying the v1 tree rules.
func ParseSnapshot(raw []byte) (Snapshot, error) {
	if !utf8.Valid(raw) {
		return Snapshot{}, contractError("snapshot is not valid UTF-8")
	}
	if err := rejectDuplicateJSONFields(raw); err != nil {
		return Snapshot{}, err
	}
	if err := validateSnapshotShape(raw); err != nil {
		return Snapshot{}, err
	}

	var snapshot Snapshot
	if err := json.Unmarshal(raw, &snapshot); err != nil {
		return Snapshot{}, contractError("decode snapshot: %v", err)
	}
	if err := ValidateSnapshot(snapshot); err != nil {
		return Snapshot{}, err
	}
	return snapshot, nil
}

// ValidateSnapshot applies the finite v1 HTML, keyed-tree, and binding rules
// to a decoded snapshot. Node depth is measured from root depth zero.
func ValidateSnapshot(snapshot Snapshot) error {
	if err := validateState(snapshot.State); err != nil {
		return err
	}
	if snapshot.Bindings == nil {
		return contractError("snapshot.bindings must be a non-null array")
	}
	if snapshot.Messages == nil {
		return contractError("snapshot.messages must be a non-null array")
	}

	keys := make(map[string]struct{})
	nodes := 0
	if err := validateNode(snapshot.Tree, "", 0, &nodes, keys); err != nil {
		return err
	}
	if err := validateBindingMessages(snapshot.Bindings); err != nil {
		return err
	}
	if err := inputbinding.Validate(inputbinding.View{Tree: snapshot.Tree, Bindings: snapshot.Bindings}); err != nil {
		return contractError("invalid input bindings: %v", err)
	}
	return nil
}

func validateNode(node gobi.Node, path string, depth int, count *int, keys map[string]struct{}) error {
	where := path
	if where == "" {
		where = "<root>"
	}
	if depth > MaxDepth {
		return contractError("Node at %s exceeds maximum depth %d", where, MaxDepth)
	}
	*count++
	if *count > MaxNodes {
		return contractError("snapshot exceeds maximum node count %d", MaxNodes)
	}

	if node.Kind == gobi.Text {
		if node.Tag != "" || node.Key != "" || len(node.Attrs) != 0 || len(node.On) != 0 || len(node.Kids) != 0 {
			return contractError("text Node at %s cannot have a tag, key, attributes, handlers or children", where)
		}
		return nil
	}
	if node.Kind != gobi.Element {
		return contractError("unsupported Node.Kind %d at %s", node.Kind, where)
	}
	if !contains([]string{"div", "p", "input", "button"}, node.Tag) {
		return contractError("unsupported HTML element %q at %s", node.Tag, where)
	}
	if node.Text != "" {
		return contractError("element Text at %s must be empty", where)
	}
	if node.Key == "" || !keyToken.MatchString(node.Key) {
		return contractError("element key at %s must match %s", where, KeyPattern)
	}
	if _, exists := keys[node.Key]; exists {
		return contractError("duplicate element key %q", node.Key)
	}
	keys[node.Key] = struct{}{}

	if err := validateAttributes(node, where); err != nil {
		return err
	}
	if err := validateHandlers(node, where); err != nil {
		return err
	}
	if node.Tag == "input" {
		if len(node.Kids) != 0 {
			return contractError("void HTML element <input> at %s cannot have children", where)
		}
		if countAttribute(node, "type") != 1 || !hasStringAttribute(node, "type", "text") {
			return contractError("input at %s must declare exactly one type=\"text\" attribute", where)
		}
	}
	for index, child := range node.Kids {
		childPath := fmt.Sprintf("%d", index)
		if path != "" {
			childPath = path + "/" + childPath
		}
		if err := validateNode(child, childPath, depth+1, count, keys); err != nil {
			return err
		}
	}
	return nil
}

func validateAttributes(node gobi.Node, path string) error {
	seen := make(map[string]struct{}, len(node.Attrs))
	for _, attr := range node.Attrs {
		name := strings.ToLower(attr.Name)
		if !contains([]string{"class", "type", "value", "aria-label", "disabled"}, attr.Name) {
			return contractError("unsupported attribute %q at %s", attr.Name, path)
		}
		if _, exists := seen[name]; exists {
			return contractError("duplicate attribute %q at %s", attr.Name, path)
		}
		seen[name] = struct{}{}
		if len(attr.Style) != 0 {
			return contractError("structured styles are unsupported at %s", path)
		}
		if attr.Name == "disabled" {
			if !attr.Flag || attr.Value != "" {
				return contractError("disabled at %s must be a true flag", path)
			}
			if node.Tag != "button" && node.Tag != "input" {
				return contractError("disabled is only supported on button or input at %s", path)
			}
			continue
		}
		if attr.Flag {
			return contractError("attribute %q at %s must have a string Value only", attr.Name, path)
		}
		if (attr.Name == "value" || attr.Name == "type") && node.Tag != "input" {
			return contractError("attribute %q is only supported on input at %s", attr.Name, path)
		}
	}
	return nil
}

func validateHandlers(node gobi.Node, path string) error {
	seen := make(map[string]struct{}, len(node.On))
	for _, handler := range node.On {
		if handler.Event != "click" || messageIsBlank(handler.Message) {
			return contractError("Node.On at %s must contain a non-empty click Event and Message", path)
		}
		if _, exists := seen[handler.Event]; exists {
			return contractError("duplicate Node.On event %q at %s", handler.Event, path)
		}
		seen[handler.Event] = struct{}{}
	}
	return nil
}

func validateBindingMessages(bindings []inputbinding.Binding) error {
	for i, binding := range bindings {
		if messageIsBlank(binding.Message) {
			return contractError("binding %d has a blank message name", i)
		}
	}
	return nil
}

func messageIsBlank(value string) bool {
	for _, r := range value {
		if !strings.ContainsRune(messageBlankRunes, r) {
			return false
		}
	}
	return true
}

func validateState(raw json.RawMessage) error {
	trimmed := trimJSONWhitespace(raw)
	if len(trimmed) == 0 {
		return contractError("snapshot.state is required")
	}
	if err := rejectDuplicateJSONFields(trimmed); err != nil {
		return contractError("invalid snapshot.state: %v", err)
	}
	decoder := json.NewDecoder(bytes.NewReader(trimmed))
	decoder.UseNumber()
	var value any
	if err := decoder.Decode(&value); err != nil {
		return contractError("invalid snapshot.state: %v", err)
	}
	if _, ok := value.(map[string]any); !ok || value == nil {
		return contractError("snapshot.state must be a JSON object")
	}
	if err := ensureDecoderEOF(decoder); err != nil {
		return contractError("invalid snapshot.state: %v", err)
	}
	if err := validateJSONValue(value, "snapshot.state"); err != nil {
		return err
	}
	return nil
}

func trimJSONWhitespace(raw []byte) []byte {
	start := 0
	end := len(raw)
	for start < end && isJSONWhitespace(raw[start]) {
		start++
	}
	for start < end && isJSONWhitespace(raw[end-1]) {
		end--
	}
	return raw[start:end]
}

func isJSONWhitespace(value byte) bool {
	return value == ' ' || value == '\t' || value == '\r' || value == '\n'
}

func validateJSONValue(value any, description string) error {
	switch item := value.(type) {
	case nil, bool, string:
		return nil
	case json.Number:
		number, err := strconv.ParseFloat(string(item), 64)
		if err != nil || math.IsNaN(number) || math.IsInf(number, 0) {
			return contractError("%s cannot contain a non-finite number", description)
		}
	case []any:
		for _, child := range item {
			if err := validateJSONValue(child, description); err != nil {
				return err
			}
		}
	case map[string]any:
		for _, child := range item {
			if err := validateJSONValue(child, description); err != nil {
				return err
			}
		}
	default:
		return contractError("%s must contain only JSON values", description)
	}
	return nil
}

func validateSnapshotShape(raw []byte) error {
	root, err := objectFields(raw, "snapshot", "state", "tree", "bindings", "messages")
	if err != nil {
		return err
	}
	if err := validateState(root["state"]); err != nil {
		return err
	}
	if err := validateNodeShape(root["tree"], "<root>"); err != nil {
		return err
	}
	if err := validateStrictArray(root["bindings"], "snapshot.bindings", func(item json.RawMessage, index int) error {
		where := fmt.Sprintf("Binding %d", index)
		fields, err := objectFields(item, where, "Path", "Event", "Message", "Source")
		if err != nil {
			return err
		}
		for _, name := range []string{"Path", "Event", "Message", "Source"} {
			if err := requireString(fields[name], where+"."+name); err != nil {
				return err
			}
		}
		return nil
	}); err != nil {
		return err
	}
	if err := validateStrictArray(root["messages"], "snapshot.messages", func(item json.RawMessage, index int) error {
		where := fmt.Sprintf("Message %d", index)
		fields, err := objectFields(item, where, "Name", "Arg")
		if err != nil {
			return err
		}
		if err := requireString(fields["Name"], where+".Name"); err != nil {
			return err
		}
		return requireString(fields["Arg"], where+".Arg")
	}); err != nil {
		return err
	}
	return nil
}

func validateNodeShape(raw json.RawMessage, path string) error {
	fields, err := objectFields(raw, "Node at "+path, "Kind", "Tag", "Key", "Attrs", "On", "Kids", "Text")
	if err != nil {
		return err
	}
	if err := requireInteger(fields["Kind"], "Node.Kind at "+path); err != nil {
		return err
	}
	for _, name := range []string{"Tag", "Key", "Text"} {
		if err := requireString(fields[name], "Node."+name+" at "+path); err != nil {
			return err
		}
	}
	if err := validateNullableArray(fields["Attrs"], "Node.Attrs at "+path, func(item json.RawMessage, index int) error {
		where := fmt.Sprintf("Attr at %s[%d]", path, index)
		attr, err := objectFields(item, where, "Name", "Value", "Flag", "Style")
		if err != nil {
			return err
		}
		if err := requireString(attr["Name"], where+".Name"); err != nil {
			return err
		}
		if err := requireString(attr["Value"], where+".Value"); err != nil {
			return err
		}
		if err := requireBoolean(attr["Flag"], where+".Flag"); err != nil {
			return err
		}
		return validateNullableArray(attr["Style"], where+".Style", func(style json.RawMessage, styleIndex int) error {
			styleWhere := fmt.Sprintf("Style at %s[%d]", where, styleIndex)
			fields, err := objectFields(style, styleWhere, "Property", "Value")
			if err != nil {
				return err
			}
			if err := requireString(fields["Property"], styleWhere+".Property"); err != nil {
				return err
			}
			return requireString(fields["Value"], styleWhere+".Value")
		})
	}); err != nil {
		return err
	}
	if err := validateNullableArray(fields["On"], "Node.On at "+path, func(item json.RawMessage, index int) error {
		where := fmt.Sprintf("Node.On at %s[%d]", path, index)
		handler, err := objectFields(item, where, "Event", "Message", "Arg")
		if err != nil {
			return err
		}
		for _, name := range []string{"Event", "Message", "Arg"} {
			if err := requireString(handler[name], where+"."+name); err != nil {
				return err
			}
		}
		return nil
	}); err != nil {
		return err
	}
	return validateNullableArray(fields["Kids"], "Node.Kids at "+path, func(item json.RawMessage, index int) error {
		childPath := strconv.Itoa(index)
		if path != "<root>" {
			childPath = path + "/" + childPath
		}
		return validateNodeShape(item, childPath)
	})
}

func validateStrictArray(raw json.RawMessage, description string, visit func(json.RawMessage, int) error) error {
	trimmed := bytes.TrimSpace(raw)
	if len(trimmed) == 0 || trimmed[0] != '[' {
		return contractError("%s must be a non-null array", description)
	}
	return visitArray(trimmed, description, visit)
}

func validateNullableArray(raw json.RawMessage, description string, visit func(json.RawMessage, int) error) error {
	trimmed := bytes.TrimSpace(raw)
	if bytes.Equal(trimmed, []byte("null")) {
		return nil
	}
	if len(trimmed) == 0 || trimmed[0] != '[' {
		return contractError("%s must be an array or null", description)
	}
	return visitArray(trimmed, description, visit)
}

func visitArray(raw json.RawMessage, description string, visit func(json.RawMessage, int) error) error {
	var items []json.RawMessage
	if err := json.Unmarshal(raw, &items); err != nil {
		return contractError("%s must be an array: %v", description, err)
	}
	for index, item := range items {
		if err := visit(item, index); err != nil {
			return err
		}
	}
	return nil
}

func objectFields(raw json.RawMessage, description string, expected ...string) (map[string]json.RawMessage, error) {
	var fields map[string]json.RawMessage
	if err := json.Unmarshal(raw, &fields); err != nil || fields == nil {
		return nil, contractError("%s must be an object", description)
	}
	if len(fields) != len(expected) {
		return nil, contractError("%s must contain exactly %s", description, strings.Join(expected, ", "))
	}
	wanted := make(map[string]struct{}, len(expected))
	for _, key := range expected {
		wanted[key] = struct{}{}
		if _, exists := fields[key]; !exists {
			return nil, contractError("%s must contain exactly %s", description, strings.Join(expected, ", "))
		}
	}
	for key := range fields {
		if _, exists := wanted[key]; !exists {
			return nil, contractError("%s contains unsupported field %q", description, key)
		}
	}
	return fields, nil
}

func requireString(raw json.RawMessage, description string) error {
	trimmed := bytes.TrimSpace(raw)
	if len(trimmed) == 0 || trimmed[0] != '"' {
		return contractError("%s must be a string", description)
	}
	var value string
	if err := json.Unmarshal(trimmed, &value); err != nil {
		return contractError("%s must be a string", description)
	}
	return nil
}

func requireBoolean(raw json.RawMessage, description string) error {
	trimmed := bytes.TrimSpace(raw)
	if !bytes.Equal(trimmed, []byte("true")) && !bytes.Equal(trimmed, []byte("false")) {
		return contractError("%s must be a boolean", description)
	}
	return nil
}

func requireInteger(raw json.RawMessage, description string) error {
	trimmed := bytes.TrimSpace(raw)
	if len(trimmed) == 0 || (trimmed[0] != '-' && (trimmed[0] < '0' || trimmed[0] > '9')) {
		return contractError("%s must be an integer", description)
	}
	var value int64
	if err := json.Unmarshal(trimmed, &value); err != nil {
		return contractError("%s must be an integer", description)
	}
	if value < 0 || value > 255 {
		return contractError("%s is outside the supported integer range", description)
	}
	return nil
}

func rejectDuplicateJSONFields(raw []byte) error {
	decoder := json.NewDecoder(bytes.NewReader(raw))
	decoder.UseNumber()
	if err := scanJSONValue(decoder); err != nil {
		return contractError("invalid JSON: %v", err)
	}
	if err := ensureDecoderEOF(decoder); err != nil {
		return contractError("invalid JSON: %v", err)
	}
	return nil
}

func scanJSONValue(decoder *json.Decoder) error {
	token, err := decoder.Token()
	if err != nil {
		return err
	}
	delim, isDelimiter := token.(json.Delim)
	if !isDelimiter {
		return nil
	}
	switch delim {
	case '{':
		seen := make(map[string]struct{})
		for decoder.More() {
			keyToken, err := decoder.Token()
			if err != nil {
				return err
			}
			key, ok := keyToken.(string)
			if !ok {
				return fmt.Errorf("object member name is not a string")
			}
			if _, exists := seen[key]; exists {
				return fmt.Errorf("duplicate object field %q", key)
			}
			seen[key] = struct{}{}
			if err := scanJSONValue(decoder); err != nil {
				return err
			}
		}
		end, err := decoder.Token()
		if err != nil {
			return err
		}
		if end != json.Delim('}') {
			return fmt.Errorf("unterminated object")
		}
	case '[':
		for decoder.More() {
			if err := scanJSONValue(decoder); err != nil {
				return err
			}
		}
		end, err := decoder.Token()
		if err != nil {
			return err
		}
		if end != json.Delim(']') {
			return fmt.Errorf("unterminated array")
		}
	default:
		return fmt.Errorf("unexpected JSON delimiter %q", delim)
	}
	return nil
}

func ensureDecoderEOF(decoder *json.Decoder) error {
	if _, err := decoder.Token(); err != io.EOF {
		if err == nil {
			return fmt.Errorf("trailing JSON value")
		}
		return err
	}
	return nil
}

func contains(values []string, wanted string) bool {
	for _, value := range values {
		if value == wanted {
			return true
		}
	}
	return false
}

func countAttribute(node gobi.Node, name string) int {
	count := 0
	for _, attr := range node.Attrs {
		if attr.Name == name {
			count++
		}
	}
	return count
}

func hasStringAttribute(node gobi.Node, name, value string) bool {
	for _, attr := range node.Attrs {
		if attr.Name == name {
			return !attr.Flag && attr.Value == value && len(attr.Style) == 0
		}
	}
	return false
}

func contractError(format string, args ...any) error {
	return fmt.Errorf("render contract: "+format, args...)
}
