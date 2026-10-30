// Generated file based on counter.go
// Updated when compliance tests are re-run, DO NOT EDIT!

import * as $ from "@goscript/builtin/index.js"
import * as strconv from "@goscript/strconv/index.js"
import * as gobi from "@goscript/github.com/samuelpmahan/gondola/gobi/index.js"

$.registerTypePackagePath("github.com/samuelpmahan/gondola/counter", ["counter.State"])

export class State {
	public declare Count: number

	constructor(__goscriptValue?: boolean, Count$?: number) {
		this.Count = Count$ ?? 0
		;(this as any).__goStructValue = __goscriptValue === true
	}

	public clone(): State {
		return new State(true, this.Count)
	}

	public __goscriptAssign(source: State): this {
		this.Count = source.Count
		return this
	}

	static __typeInfo = $.registerStructType(
		"counter.State",
		() => new State(),
		() => [],
		State,
		() => [{ name: "Count", key: "Count", type: /* @__PURE__ */ $.basicType("float64") }]
	)
}

export function Init(): State {
	return new State(true)
}

export function Update(s: State, m: gobi.Message): [State, $.Slice<gobi.Effect>] {
	switch (m.Name) {
		case "add":
		{
			s.Count++
			break
		}
		case "reset":
		{
			s.Count = 0
			break
		}
	}
	return [s, null]
}

export function View(s: State): gobi.Node {
	let label = gobi.El("p", $.arrayToSlice<gobi.Node>([gobi.Txt("Count: "), gobi.Txt(strconv.FormatFloat(s.Count, 102, -1, 64))]))
	let add = $.markAsStructValue($.cloneStructValue($.markAsStructValue($.cloneStructValue(gobi.El("button", $.arrayToSlice<gobi.Node>([gobi.Txt("+")])))).Set("class", "add"))).Handle("click", "add", "")
	let reset = $.markAsStructValue($.cloneStructValue(gobi.El("button", $.arrayToSlice<gobi.Node>([gobi.Txt("Reset")])))).Handle("click", "reset", "")
	if (s.Count == 0) {
		reset = reset.__goscriptAssign($.markAsStructValue($.cloneStructValue(reset)).Flag("disabled"))
	}
	return $.markAsStructValue($.cloneStructValue(gobi.El("div", $.arrayToSlice<gobi.Node>([label, add, reset])))).Set("class", "counter")
}
