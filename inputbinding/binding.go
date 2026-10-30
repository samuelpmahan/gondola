// Package inputbinding describes browser input values that are carried alongside
// a Gobi tree. The sidecar keeps dynamic event values separate from gobi.On's
// fixed literal argument.
package inputbinding

import (
	"fmt"
	"strconv"
	"strings"

	"github.com/samuelpmahan/gondola/gobi"
)

// Source names the DOM value read for a binding.
type Source string

const (
	// TargetValue reads the current value property of the event target.
	TargetValue Source = "target.value"
)

// Binding connects an event at a tree path to an application message.
type Binding struct {
	Path    string
	Event   string
	Message string
	Source  Source
}

// View pairs a Gobi tree with its explicit dynamic input bindings.
type View struct {
	Tree     gobi.Node
	Bindings []Binding
}

// Validate checks that every binding has an unambiguous target and uses the
// bounded input semantics implemented by this package.
func Validate(view View) error {
	seen := make(map[string]struct{}, len(view.Bindings))
	for i, binding := range view.Bindings {
		if binding.Path != "" {
			if _, err := pathIndexes(binding.Path); err != nil {
				return fmt.Errorf("binding %d: %w", i, err)
			}
		}
		key := binding.Path + "\x00" + binding.Event
		if _, exists := seen[key]; exists {
			return fmt.Errorf("duplicate binding for path %q and event %q", binding.Path, binding.Event)
		}
		seen[key] = struct{}{}

		if binding.Event != "input" {
			return fmt.Errorf("binding %d uses unsupported event %q", i, binding.Event)
		}
		if binding.Source != TargetValue {
			return fmt.Errorf("binding %d uses unsupported source %q", i, binding.Source)
		}
		if strings.TrimSpace(binding.Message) == "" {
			return fmt.Errorf("binding %d has an empty message name", i)
		}

		target, err := nodeAtPath(view.Tree, binding.Path)
		if err != nil {
			return fmt.Errorf("binding %d: %w", i, err)
		}
		if target.Kind != gobi.Element || target.Tag != "input" {
			return fmt.Errorf("binding %d target at path %q must be an input element", i, binding.Path)
		}
		if countAttrs(target, "type") != 1 || !hasTextAttribute(target, "type", "text") {
			return fmt.Errorf("binding %d target at path %q must have exactly one type=text attribute", i, binding.Path)
		}
		if countAttrs(target, "value") != 1 || !hasValueAttribute(target, "value") {
			return fmt.Errorf("binding %d target at path %q must have exactly one value attribute", i, binding.Path)
		}

		for _, handler := range target.On {
			if handler.Event == binding.Event {
				return fmt.Errorf("binding %d collides with literal %q handler at path %q", i, binding.Event, binding.Path)
			}
		}
	}
	return nil
}

// Resolve maps a step to the declared dynamic binding or to an unchanged
// literal gobi.On handler. The Value field is used only by TargetValue.
func Resolve(view View, step gobi.Step) (gobi.Message, error) {
	if err := Validate(view); err != nil {
		return gobi.Message{}, fmt.Errorf("invalid inputbinding view: %w", err)
	}
	target, err := nodeAtPath(view.Tree, step.Path)
	if err != nil {
		return gobi.Message{}, err
	}
	for _, binding := range view.Bindings {
		if binding.Path == step.Path && binding.Event == step.Event {
			switch binding.Source {
			case TargetValue:
				return gobi.Message{Name: binding.Message, Arg: step.Value}, nil
			default:
				// Validate currently makes this unreachable. Keep the resolver
				// defensive if the supported source set grows in the future.
				return gobi.Message{}, fmt.Errorf("unsupported input source %q", binding.Source)
			}
		}
	}

	var match *gobi.On
	for i := range target.On {
		if target.On[i].Event != step.Event {
			continue
		}
		if match != nil {
			return gobi.Message{}, fmt.Errorf("ambiguous literal %q handlers at path %q", step.Event, step.Path)
		}
		match = &target.On[i]
	}
	if match == nil {
		return gobi.Message{}, fmt.Errorf("no %q handler or binding at path %q", step.Event, step.Path)
	}
	return gobi.Message{Name: match.Message, Arg: match.Arg}, nil
}

func nodeAtPath(root gobi.Node, path string) (gobi.Node, error) {
	if path == "" {
		return root, nil
	}
	indexes, err := pathIndexes(path)
	if err != nil {
		return gobi.Node{}, err
	}
	current := root
	for _, index := range indexes {
		if index >= len(current.Kids) {
			return gobi.Node{}, fmt.Errorf("child index %d out of range in path %q", index, path)
		}
		current = current.Kids[index]
	}
	return current, nil
}

func pathIndexes(path string) ([]int, error) {
	if path == "" {
		return nil, nil
	}
	parts := strings.Split(path, "/")
	indexes := make([]int, 0, len(parts))
	for _, part := range parts {
		if part == "" {
			return nil, fmt.Errorf("invalid child path %q", path)
		}
		index, err := strconv.Atoi(part)
		if err != nil || index < 0 || strconv.Itoa(index) != part {
			return nil, fmt.Errorf("invalid child index %q in path %q", part, path)
		}
		indexes = append(indexes, index)
	}
	return indexes, nil
}

func countAttrs(node gobi.Node, name string) int {
	count := 0
	for _, attr := range node.Attrs {
		if attr.Name == name {
			count++
		}
	}
	return count
}

func hasTextAttribute(node gobi.Node, name, value string) bool {
	for _, attr := range node.Attrs {
		if attr.Name == name {
			return !attr.Flag && attr.Value == value && len(attr.Style) == 0
		}
	}
	return false
}

func hasValueAttribute(node gobi.Node, name string) bool {
	for _, attr := range node.Attrs {
		if attr.Name == name {
			return !attr.Flag && len(attr.Style) == 0
		}
	}
	return false
}
