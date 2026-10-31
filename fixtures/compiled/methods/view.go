package methods

import (
	"strconv"

	"github.com/samuelpmahan/gondola/gobi"
)

func View(state State) gobi.Node {
	return state.ComposeView()
}

func (state State) ComposeView() gobi.Node {
	parentLabel := gobi.El("p", gobi.Txt("Parent: "), gobi.Txt(strconv.FormatFloat(state.Parent.Count, 'f', -1, 64)))
	parentAdd := gobi.El("button", gobi.Txt("Parent +")).Keyed("parent-add").Handle("click", "parentAdd", "")
	parentReset := gobi.El("button", gobi.Txt("Parent Reset")).Keyed("parent-reset").Handle("click", "parentReset", "")
	if state.Parent.Count == 0 {
		parentReset = parentReset.Flag("disabled")
	}
	parent := gobi.El("div", parentLabel, parentAdd, parentReset).Keyed("parent").Set("class", "parent-counter")

	childLabel := gobi.El("p", gobi.Txt("Child: "), gobi.Txt(strconv.FormatFloat(state.Child.Count, 'f', -1, 64)))
	childAdd := gobi.El("button", gobi.Txt("Child +")).Keyed("child-add").Handle("click", "childAdd", "")
	childReset := gobi.El("button", gobi.Txt("Child Reset")).Keyed("child-reset").Handle("click", "childReset", "")
	if state.ReadOnly {
		childAdd = childAdd.Flag("disabled")
		childReset = childReset.Flag("disabled")
	} else if state.Child.Count == 0 {
		childReset = childReset.Flag("disabled")
	}
	child := gobi.El("div", childLabel, childAdd, childReset).Keyed("child").Set("class", "child-counter")

	lockLabel := "Lock child"
	if state.ReadOnly {
		lockLabel = "Unlock child"
	}
	lock := gobi.El("button", gobi.Txt(lockLabel)).Keyed("readonly-toggle").Handle("click", "toggleReadOnly", "")
	saved := gobi.El("p", gobi.Txt("Saved child: "), gobi.Txt(strconv.FormatFloat(state.SavedChild, 'f', -1, 64)))
	capture := gobi.El("button", gobi.Txt("Capture child")).Keyed("capture-child").Handle("click", "captureChild", "")
	publish := gobi.El("button", gobi.Txt("Publish saved to parent")).Keyed("publish-saved").Handle("click", "publishSaved", "")

	return gobi.El("div", parent, child, lock, saved, capture, publish).Keyed("methods").Set("class", "method-composition")
}
