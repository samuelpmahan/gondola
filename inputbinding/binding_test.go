package inputbinding

import (
	"testing"

	"github.com/samuelpmahan/gondola/gobi"
)

func textInputView() View {
	return View{Tree: gobi.El("div",
		gobi.El("input").Set("type", "text").Set("value", "draft"),
		gobi.El("button").Handle("click", "save", "literal"),
	), Bindings: []Binding{{Path: "0", Event: "input", Message: "edit", Source: TargetValue}}}
}

func TestValidateAcceptsSupportedInputBinding(t *testing.T) {
	if err := Validate(textInputView()); err != nil {
		t.Fatalf("Validate() error = %v", err)
	}
}

func TestValidateRejectsUnsupportedOrAmbiguousBindings(t *testing.T) {
	tests := []struct {
		name   string
		mutate func(*View)
	}{
		{name: "duplicate binding", mutate: func(v *View) { v.Bindings = append(v.Bindings, v.Bindings[0]) }},
		{name: "malformed path", mutate: func(v *View) { v.Bindings[0].Path = "00" }},
		{name: "missing path", mutate: func(v *View) { v.Bindings[0].Path = "3" }},
		{name: "wrong event", mutate: func(v *View) { v.Bindings[0].Event = "change" }},
		{name: "wrong source", mutate: func(v *View) { v.Bindings[0].Source = Source("keyboard.key") }},
		{name: "empty message", mutate: func(v *View) { v.Bindings[0].Message = "" }},
		{name: "blank message", mutate: func(v *View) { v.Bindings[0].Message = " \t " }},
		{name: "not input", mutate: func(v *View) { v.Tree.Kids[0].Tag = "textarea" }},
		{name: "wrong input type", mutate: func(v *View) { v.Tree.Kids[0].Attrs[0].Value = "number" }},
		{name: "missing value", mutate: func(v *View) { v.Tree.Kids[0].Attrs = v.Tree.Kids[0].Attrs[:1] }},
		{name: "duplicate value", mutate: func(v *View) { v.Tree.Kids[0] = v.Tree.Kids[0].Set("value", "other") }},
		{name: "literal event collision", mutate: func(v *View) { v.Tree.Kids[0] = v.Tree.Kids[0].Handle("input", "other", "literal") }},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			view := textInputView()
			test.mutate(&view)
			if err := Validate(view); err == nil {
				t.Fatal("Validate() unexpectedly succeeded")
			}
		})
	}
}

func TestResolveDynamicValueAndPreservesLiteralArgument(t *testing.T) {
	view := textInputView()
	dynamic, err := Resolve(view, gobi.Step{Path: "0", Event: "input", Value: "new draft"})
	if err != nil {
		t.Fatalf("Resolve(input) error = %v", err)
	}
	if dynamic != (gobi.Message{Name: "edit", Arg: "new draft"}) {
		t.Fatalf("dynamic message = %#v", dynamic)
	}

	literal, err := Resolve(view, gobi.Step{Path: "1", Event: "click", Value: "ignored"})
	if err != nil {
		t.Fatalf("Resolve(click) error = %v", err)
	}
	if literal != (gobi.Message{Name: "save", Arg: "literal"}) {
		t.Fatalf("literal message = %#v; Resolve must keep gobi.On.Arg", literal)
	}
}

func TestResolveRejectsMissingAndMalformedTargets(t *testing.T) {
	for _, step := range []gobi.Step{
		{Path: "0/", Event: "input", Value: "x"},
		{Path: "9", Event: "input", Value: "x"},
		{Path: "0", Event: "change", Value: "x"},
	} {
		if _, err := Resolve(textInputView(), step); err == nil {
			t.Errorf("Resolve(%#v) unexpectedly succeeded", step)
		}
	}
}
