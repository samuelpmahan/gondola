package adapter

import (
	"github.com/samuelpmahan/gondola/compiled-frontend/toolchain/probe_counter/semantics"
	"github.com/samuelpmahan/gondola/counter"
	"github.com/samuelpmahan/gondola/gobi"
)

func CounterInit() counter.State {
	return counter.Init()
}

func CounterUpdate(state counter.State, message gobi.Message) (counter.State, []gobi.Effect) {
	return counter.Update(state, message)
}

func CounterView(state counter.State) gobi.Node {
	return counter.View(state)
}

func SemanticMutate(snapshot semantics.Snapshot) semantics.Snapshot {
	return semantics.Mutate(snapshot)
}

func SemanticAppendThenMutate(snapshot semantics.Snapshot) semantics.Snapshot {
	return semantics.AppendThenMutate(snapshot)
}

func IntegerWidthsValue() semantics.IntegerWidths {
	return semantics.IntegerWidthsValue()
}

func IntegerWidthsAfterOverflow() semantics.IntegerWidths {
	return semantics.IncrementIntegerWidths(semantics.IntegerWidthsAtMax())
}

func NodeSetFork() (gobi.Node, gobi.Node, gobi.Node) {
	base := gobi.El("div").Set("class", "base")
	left := base.Set("id", "left")
	right := base.Set("id", "right")
	return base, left, right
}
