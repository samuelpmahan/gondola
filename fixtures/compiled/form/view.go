package form

import (
	"strconv"

	"github.com/samuelpmahan/gondola/compilercontract"
	"github.com/samuelpmahan/gondola/gobi"
)

func View(state State) compilercontract.View {
	text := gobi.El("input").Keyed("form-draft").
		Set("type", "text").
		Set("value", state.Draft).
		Set("aria-label", "Draft")
	checked := gobi.El("input").Keyed("form-checked").
		Set("type", "checkbox").
		Set("aria-label", "Checked")
	if state.Checked {
		checked = checked.Flag("checked")
	}
	literal := gobi.El("button", gobi.Txt("Literal argument")).Keyed("form-literal").
		Handle("click", "literal", "target.value")
	save := gobi.El("button", gobi.Txt("Save")).Keyed("form-save").Handle("click", "save", "")
	if state.Draft == "" {
		save = save.Flag("disabled")
	}
	reset := gobi.El("button", gobi.Txt("Reset")).Keyed("form-reset").Handle("click", "reset", "")
	if state == (State{}) {
		reset = reset.Flag("disabled")
	}
	boundary := gobi.El("button", gobi.Txt("Boundary")).Keyed("form-boundary").Handle("click", "boundary", "")
	tree := gobi.El("div",
		text,
		checked,
		literal,
		gobi.El("p", gobi.Txt("Saved: "), gobi.Txt(state.Saved)),
		gobi.El("p", gobi.Txt("Saves: "), gobi.Txt(strconv.Itoa(state.Saves))),
		gobi.El("p", gobi.Txt("Literal: "), gobi.Txt(state.Literal)),
		save,
		reset,
		boundary,
	).Keyed("form").Set("class", "compiled-form")
	return compilercontract.NewView(tree,
		compilercontract.Binding{Path: "0", Event: "input", Message: "edit", Source: compilercontract.TargetValue},
		compilercontract.Binding{Path: "1", Event: "change", Message: "checked", Source: compilercontract.TargetChecked},
	)
}
