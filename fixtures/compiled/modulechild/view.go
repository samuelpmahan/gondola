package modulechild

import (
	"strconv"

	"github.com/samuelpmahan/gondola/counter"
	"github.com/samuelpmahan/gondola/gobi"
)

func View(state State) gobi.Node {
	locked := "Unlocked"
	if state.Locked {
		locked = "Locked"
	}
	counterView := counter.View(state.Counter)
	if state.Locked {
		counterView.Kids[1] = counterView.Kids[1].Flag("disabled")
	}
	return gobi.El("section",
		gobi.El("p", gobi.Txt("Step: "), gobi.Txt(strconv.Itoa(state.Step)), gobi.Txt("; "), gobi.Txt(locked), gobi.Txt("; input revision: "), gobi.Txt(strconv.Itoa(state.InputRevision))).Set("class", "module-child-input"),
		gobi.El("p", gobi.Txt("Child publication count: "), gobi.Txt(strconv.FormatFloat(state.Counter.Count, 'f', -1, 64))).Set("class", "module-child-publication"),
		counterView,
	).Set("class", "compiled-module-child").Keyed("module-child")
}
