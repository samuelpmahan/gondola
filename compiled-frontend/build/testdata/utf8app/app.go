package utf8app

import "github.com/samuelpmahan/gondola/gobi"

type State struct {
	Text string
}

func Init() State {
	return State{Text: "Init café 東京 🙂 −"}
}

func Update(state State, message gobi.Message) (State, []gobi.Effect) {
	state.Text = message.Name + "|" + message.Arg
	return state, []gobi.Effect{}
}

func View(state State) gobi.Node {
	button := gobi.El("button", gobi.Txt("Button é東京🙂−"))
	button = button.Set("aria-label", "Café 東京")
	button = button.Css(gobi.S("content", "Crème brûlée 🙂"))
	button = button.Handle("click", "保存🙂", "値 é")
	return gobi.El("main", gobi.Txt(state.Text), button).
		Set("data-label", "根🙂").
		Keyed("根🙂")
}
