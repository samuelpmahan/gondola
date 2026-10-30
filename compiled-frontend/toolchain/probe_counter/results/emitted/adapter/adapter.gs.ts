// Generated file based on adapter.go
// Updated when compliance tests are re-run, DO NOT EDIT!

import * as $ from "@goscript/builtin/index.js"
import * as semantics from "@goscript/github.com/samuelpmahan/gondola/compiled-frontend/toolchain/probe_counter/semantics/index.js"
import * as counter from "@goscript/github.com/samuelpmahan/gondola/counter/index.js"
import * as gobi from "@goscript/github.com/samuelpmahan/gondola/gobi/index.js"

export function CounterInit(): counter.State {
	return counter.Init()
}

export function CounterUpdate(state: counter.State, message: gobi.Message): [counter.State, $.Slice<gobi.Effect>] {
	return counter.Update((state).clone(), message)
}

export function CounterView(state: counter.State): gobi.Node {
	return counter.View(state)
}

export function SemanticMutate(snapshot: semantics.Snapshot): semantics.Snapshot {
	return semantics.Mutate((snapshot).clone())
}

export function SemanticAppendThenMutate(snapshot: semantics.Snapshot): semantics.Snapshot {
	return semantics.AppendThenMutate((snapshot).clone())
}

export function IntegerWidthsValue(): semantics.IntegerWidths {
	return semantics.IntegerWidthsValue()
}

export function IntegerWidthsAfterOverflow(): semantics.IntegerWidths {
	return semantics.IncrementIntegerWidths(semantics.IntegerWidthsAtMax())
}

export function NodeSetFork(): [gobi.Node, gobi.Node, gobi.Node] {
	let base = $.markAsStructValue($.cloneStructValue(gobi.El("div", null))).Set("class", "base")
	let left = $.markAsStructValue($.cloneStructValue(base)).Set("id", "left")
	let right = $.markAsStructValue($.cloneStructValue(base)).Set("id", "right")
	return [base, left, right]
}
