package effect

import (
	"strconv"

	"github.com/samuelpmahan/gondola/compilercontract"
	"github.com/samuelpmahan/gondola/gobi"
)

func View(state State) compilercontract.View {
	input := gobi.El("input").Keyed("effect-input").
		Set("type", "text").Set("value", state.Input).Set("aria-label", "Request value")
	request := gobi.El("button", gobi.Txt("Request")).Keyed("effect-request").Handle("click", "request", "")
	if state.Pending || state.Input == "" {
		request = request.Flag("disabled")
	}
	tree := gobi.El("div",
		input,
		request,
		gobi.El("p", gobi.Txt("Status: "), gobi.Txt(state.Status)),
		gobi.El("p", gobi.Txt("Value: "), gobi.Txt(state.Value)),
		gobi.El("p", gobi.Txt("Requests: "), gobi.Txt(strconv.Itoa(state.Requests))),
		gobi.El("p", gobi.Txt("Completions: "), gobi.Txt(strconv.Itoa(state.Completions))),
	).Keyed("effect").Set("class", "compiled-effect")
	return compilercontract.NewView(tree,
		compilercontract.Binding{Path: "0", Event: "input", Message: "edit", Source: compilercontract.TargetValue},
	)
}
