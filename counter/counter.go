// Package counter is the smallest Gobi component: by convention a package with Init, Update and View.
package counter

import (
	"strconv"

	"github.com/samuelpmahan/gondola/gobi"
)

type State struct{ Count float64 }

func Init() State { return State{} }

func Update(s State, m gobi.Message) (State, []gobi.Effect) {
	switch m.Name {
	case "add":
		s.Count++
	case "reset":
		s.Count = 0
	}
	return s, nil
}

func View(s State) gobi.Node {
	label := gobi.El("p", gobi.Txt("Count: "), gobi.Txt(strconv.FormatFloat(s.Count, 'f', -1, 64)))
	add := gobi.El("button", gobi.Txt("+")).Set("class", "add").Handle("click", "add", "")
	reset := gobi.El("button", gobi.Txt("Reset")).Handle("click", "reset", "")
	if s.Count == 0 {
		reset = reset.Flag("disabled")
	}
	return gobi.El("div", label, add, reset).Set("class", "counter")
}
