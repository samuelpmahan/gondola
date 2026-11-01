package effectmodulechild

import (
	"github.com/samuelpmahan/gondola/fixtures/compiled/modulechild"
	"github.com/samuelpmahan/gondola/gobi"
)

// View reuses the established modulechild counter tree and appends the two
// lifecycle controls handled by this wrapper's Update role.
func View(state State) gobi.Node {
	root := state.CoreView()
	controls := gobi.El("section").Set("class", "effect-request-controls").Keyed("effect-request-controls")
	status := "Ready"
	if state.Pending {
		status = "Saving"
	} else if state.Reply != "" {
		status = "Saved: " + state.Reply
	}
	request := gobi.El("button", gobi.Txt("Save")).Keyed("effect-request").Handle("click", "request", "")
	if !validMountedState(state) || state.Pending {
		request = request.Flag("disabled")
	}
	cancel := gobi.El("button", gobi.Txt("Cancel")).Keyed("effect-cancel").Handle("click", "cancel", "")
	if !validMountedState(state) || !state.Pending {
		cancel = cancel.Flag("disabled")
	}
	controls.Kids = append(controls.Kids, request, cancel)
	root.Kids = append(root.Kids, controls, gobi.El("p", gobi.Txt(status)).Set("class", "effect-request-status"))
	return root
}

func (state State) CoreView() gobi.Node {
	root := modulechild.View(state.Core)
	if !validMountedState(state) {
		if len(root.Kids) > 2 && root.Kids[2].Kind == gobi.Element {
			for index := range root.Kids[2].Kids {
				if root.Kids[2].Kids[index].Tag == "button" {
					root.Kids[2].Kids[index] = root.Kids[2].Kids[index].Flag("disabled")
				}
			}
		}
	}
	return root
}
