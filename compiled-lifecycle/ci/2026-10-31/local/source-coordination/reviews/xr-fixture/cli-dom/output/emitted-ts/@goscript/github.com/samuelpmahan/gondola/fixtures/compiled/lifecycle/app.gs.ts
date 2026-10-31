// Generated file based on app.go
// Updated when compliance tests are re-run, DO NOT EDIT!

import * as $ from "@goscript/builtin/index.js"
import * as strconv from "@goscript/strconv/index.js"
import * as counter from "@goscript/github.com/samuelpmahan/gondola/counter/index.js"
import * as gobi from "@goscript/github.com/samuelpmahan/gondola/gobi/index.js"

$.registerTypePackagePath("github.com/samuelpmahan/gondola/fixtures/compiled/lifecycle", ["lifecycle.NodeState", "lifecycle.State"])

export class NodeState {
	public declare ID: string

	public declare ParentID: string

	public declare Generation: bigint

	public declare RequestID: bigint

	public declare Alive: boolean

	public declare Requested: boolean

	public declare Pending: boolean

	public declare Token: string

	public declare Reply: string

	public declare Counter: counter.State

	constructor(__goscriptValue?: boolean, ID$?: string, ParentID$?: string, Generation$?: bigint, RequestID$?: bigint, Alive$?: boolean, Requested$?: boolean, Pending$?: boolean, Token$?: string, Reply$?: string, Counter$?: counter.State) {
		this.ID = ID$ ?? ""
		this.ParentID = ParentID$ ?? ""
		this.Generation = Generation$ ?? 0n
		this.RequestID = RequestID$ ?? 0n
		this.Alive = Alive$ ?? false
		this.Requested = Requested$ ?? false
		this.Pending = Pending$ ?? false
		this.Token = Token$ ?? ""
		this.Reply = Reply$ ?? ""
		this.Counter = Counter$ ?? new counter.State(true)
		;(this as any).__goStructValue = __goscriptValue === true
	}

	public clone(): NodeState {
		return new NodeState(true, this.ID, this.ParentID, this.Generation, this.RequestID, this.Alive, this.Requested, this.Pending, this.Token, this.Reply, this.Counter.clone())
	}

	public __goscriptAssign(source: NodeState): this {
		this.ID = source.ID
		this.ParentID = source.ParentID
		this.Generation = source.Generation
		this.RequestID = source.RequestID
		this.Alive = source.Alive
		this.Requested = source.Requested
		this.Pending = source.Pending
		this.Token = source.Token
		this.Reply = source.Reply
		this.Counter.__goscriptAssign(source.Counter)
		return this
	}

	static __typeInfo = $.registerStructType(
		"lifecycle.NodeState",
		() => new NodeState(),
		() => [],
		NodeState,
		() => [{ name: "ID", key: "ID", type: /* @__PURE__ */ $.basicType("string") }, { name: "ParentID", key: "ParentID", type: /* @__PURE__ */ $.basicType("string") }, { name: "Generation", key: "Generation", type: /* @__PURE__ */ $.basicType("uint64") }, { name: "RequestID", key: "RequestID", type: /* @__PURE__ */ $.basicType("uint64") }, { name: "Alive", key: "Alive", type: /* @__PURE__ */ $.basicType("bool") }, { name: "Requested", key: "Requested", type: /* @__PURE__ */ $.basicType("bool") }, { name: "Pending", key: "Pending", type: /* @__PURE__ */ $.basicType("bool") }, { name: "Token", key: "Token", type: /* @__PURE__ */ $.basicType("string") }, { name: "Reply", key: "Reply", type: /* @__PURE__ */ $.basicType("string") }, { name: "Counter", key: "Counter", type: "counter.State" }]
	)
}

export class State {
	public declare Parent: NodeState

	public declare Child: NodeState

	public declare Grandchild: NodeState

	public declare Sibling: NodeState

	public declare NextRequestID: bigint

	constructor(__goscriptValue?: boolean, Parent$?: NodeState, Child$?: NodeState, Grandchild$?: NodeState, Sibling$?: NodeState, NextRequestID$?: bigint) {
		this.Parent = Parent$ ?? new NodeState(true)
		this.Child = Child$ ?? new NodeState(true)
		this.Grandchild = Grandchild$ ?? new NodeState(true)
		this.Sibling = Sibling$ ?? new NodeState(true)
		this.NextRequestID = NextRequestID$ ?? 0n
		;(this as any).__goStructValue = __goscriptValue === true
	}

	public clone(): State {
		return new State(true, this.Parent.clone(), this.Child.clone(), this.Grandchild.clone(), this.Sibling.clone(), this.NextRequestID)
	}

	public __goscriptAssign(source: State): this {
		this.Parent.__goscriptAssign(source.Parent)
		this.Child.__goscriptAssign(source.Child)
		this.Grandchild.__goscriptAssign(source.Grandchild)
		this.Sibling.__goscriptAssign(source.Sibling)
		this.NextRequestID = source.NextRequestID
		return this
	}

	static __typeInfo = $.registerStructType(
		"lifecycle.State",
		() => new State(),
		() => [],
		State,
		() => [{ name: "Parent", key: "Parent", type: "lifecycle.NodeState" }, { name: "Child", key: "Child", type: "lifecycle.NodeState" }, { name: "Grandchild", key: "Grandchild", type: "lifecycle.NodeState" }, { name: "Sibling", key: "Sibling", type: "lifecycle.NodeState" }, { name: "NextRequestID", key: "NextRequestID", type: /* @__PURE__ */ $.basicType("uint64") }]
	)
}

export const maxSafeID: bigint = 9007199254740991n

export function Init(): State {
	return new State(true, (() => { const __goscriptLiteralField0 = counter.Init(); return new NodeState(true, "parent", "", 1n, undefined, true, undefined, undefined, undefined, undefined, __goscriptLiteralField0) })(), (() => { const __goscriptLiteralField1 = counter.Init(); return new NodeState(true, "child", "parent", 1n, undefined, true, undefined, undefined, undefined, undefined, __goscriptLiteralField1) })(), (() => { const __goscriptLiteralField2 = counter.Init(); return new NodeState(true, "grandchild", "child", 1n, undefined, true, undefined, undefined, undefined, undefined, __goscriptLiteralField2) })(), (() => { const __goscriptLiteralField3 = counter.Init(); return new NodeState(true, "sibling", "", 1n, undefined, true, undefined, undefined, undefined, undefined, __goscriptLiteralField3) })())
}

export function Update(state: State, message: gobi.Message): [State, $.Slice<gobi.Effect>] {
	switch (message.Name) {
		case "addParent":
		{
			if (state.Parent.Alive) {
				let __goscriptTuple0: any = counter.Update((state.Parent.Counter).clone(), new gobi.Message(true, "add"))
				state.Parent.Counter.__goscriptAssign(__goscriptTuple0[0])
			}
			break
		}
		case "addChild":
		{
			if (state.Child.Alive) {
				let __goscriptTuple1: any = counter.Update((state.Child.Counter).clone(), new gobi.Message(true, "add"))
				state.Child.Counter.__goscriptAssign(__goscriptTuple1[0])
			}
			break
		}
		case "addGrandchild":
		{
			if (state.Grandchild.Alive) {
				let __goscriptTuple2: any = counter.Update((state.Grandchild.Counter).clone(), new gobi.Message(true, "add"))
				state.Grandchild.Counter.__goscriptAssign(__goscriptTuple2[0])
			}
			break
		}
		case "addSibling":
		{
			if (state.Sibling.Alive) {
				let __goscriptTuple3: any = counter.Update((state.Sibling.Counter).clone(), new gobi.Message(true, "add"))
				state.Sibling.Counter.__goscriptAssign(__goscriptTuple3[0])
			}
			break
		}
		case "requestParent":
		{
			return requestParent((state).clone())
			break
		}
		case "requestChild":
		{
			return requestChild((state).clone())
			break
		}
		case "requestGrandchild":
		{
			return requestGrandchild((state).clone())
			break
		}
		case "requestSibling":
		{
			return requestSibling((state).clone())
			break
		}
		case "removeParent":
		{
			return removeParent((state).clone())
			break
		}
		case "remountParent":
		{
			return remountParent((state).clone())
			break
		}
		case "complete":
		{
			return complete((state).clone(), message.Arg)
			break
		}
	}
	return [state, $.arrayToSlice<gobi.Effect>([])]
}

export function requestParent(state: State): [State, $.Slice<gobi.Effect>] {
	if (!state.Parent.Alive || state.Parent.Requested) {
		return [state, $.arrayToSlice<gobi.Effect>([])]
	}
	if (state.NextRequestID < 9007199254740991n) {
		state.NextRequestID++
		state.Parent.Requested = true
		state.Parent.Pending = true
		state.Parent.RequestID = state.NextRequestID
		state.Parent.Token = tokenFor("parent", state.Parent.Generation, state.Parent.RequestID)
		return [(state).clone(), $.arrayToSlice<gobi.Effect>([requestEffect(state.Parent.Token)])]
	}
	return [state, $.arrayToSlice<gobi.Effect>([])]
}

export function requestChild(state: State): [State, $.Slice<gobi.Effect>] {
	if (!state.Child.Alive || state.Child.Requested) {
		return [state, $.arrayToSlice<gobi.Effect>([])]
	}
	if (state.NextRequestID < 9007199254740991n) {
		state.NextRequestID++
		state.Child.Requested = true
		state.Child.Pending = true
		state.Child.RequestID = state.NextRequestID
		state.Child.Token = tokenFor("child", state.Child.Generation, state.Child.RequestID)
		return [(state).clone(), $.arrayToSlice<gobi.Effect>([requestEffect(state.Child.Token)])]
	}
	return [state, $.arrayToSlice<gobi.Effect>([])]
}

export function requestGrandchild(state: State): [State, $.Slice<gobi.Effect>] {
	if (!state.Grandchild.Alive || state.Grandchild.Requested) {
		return [state, $.arrayToSlice<gobi.Effect>([])]
	}
	if (state.NextRequestID < 9007199254740991n) {
		state.NextRequestID++
		state.Grandchild.Requested = true
		state.Grandchild.Pending = true
		state.Grandchild.RequestID = state.NextRequestID
		state.Grandchild.Token = tokenFor("grandchild", state.Grandchild.Generation, state.Grandchild.RequestID)
		return [(state).clone(), $.arrayToSlice<gobi.Effect>([requestEffect(state.Grandchild.Token)])]
	}
	return [state, $.arrayToSlice<gobi.Effect>([])]
}

export function requestSibling(state: State): [State, $.Slice<gobi.Effect>] {
	if (!state.Sibling.Alive || state.Sibling.Requested) {
		return [state, $.arrayToSlice<gobi.Effect>([])]
	}
	if (state.NextRequestID < 9007199254740991n) {
		state.NextRequestID++
		state.Sibling.Requested = true
		state.Sibling.Pending = true
		state.Sibling.RequestID = state.NextRequestID
		state.Sibling.Token = tokenFor("sibling", state.Sibling.Generation, state.Sibling.RequestID)
		return [(state).clone(), $.arrayToSlice<gobi.Effect>([requestEffect(state.Sibling.Token)])]
	}
	return [state, $.arrayToSlice<gobi.Effect>([])]
}

export function removeParent(state: State): [State, $.Slice<gobi.Effect>] {
	if (!state.Parent.Alive) {
		return [state, $.arrayToSlice<gobi.Effect>([])]
	}
	let effects: $.Slice<gobi.Effect> = $.arrayToSlice<gobi.Effect>([])
	if (state.Grandchild.Pending) {
		effects = $.appendOne(effects, cancelEffect(state.Grandchild.Token))
	}
	if (state.Child.Pending) {
		effects = $.appendOne(effects, cancelEffect(state.Child.Token))
	}
	if (state.Parent.Pending) {
		effects = $.appendOne(effects, cancelEffect(state.Parent.Token))
	}
	state.Grandchild.Alive = false
	state.Grandchild.Pending = false
	state.Grandchild.Token = ""
	state.Child.Alive = false
	state.Child.Pending = false
	state.Child.Token = ""
	state.Parent.Alive = false
	state.Parent.Pending = false
	state.Parent.Token = ""
	return [state, effects]
}

export function remountParent(state: State): [State, $.Slice<gobi.Effect>] {
	if (state.Parent.Alive) {
		return [state, $.arrayToSlice<gobi.Effect>([])]
	}
	if (((state.Parent.Generation >= 9007199254740991n) || (state.Child.Generation >= 9007199254740991n)) || (state.Grandchild.Generation >= 9007199254740991n)) {
		return [state, $.arrayToSlice<gobi.Effect>([])]
	}
	if (state.Parent.Generation < 9007199254740991n) {
		state.Parent.Generation++
	}
	if (state.Child.Generation < 9007199254740991n) {
		state.Child.Generation++
	}
	if (state.Grandchild.Generation < 9007199254740991n) {
		state.Grandchild.Generation++
	}
	state.Parent.Alive = true
	state.Parent.Requested = false
	state.Parent.Pending = false
	state.Parent.RequestID = 0n
	state.Parent.Token = ""
	state.Parent.Reply = ""
	state.Parent.Counter.__goscriptAssign(counter.Init())
	state.Child.Alive = true
	state.Child.Requested = false
	state.Child.Pending = false
	state.Child.RequestID = 0n
	state.Child.Token = ""
	state.Child.Reply = ""
	state.Child.Counter.__goscriptAssign(counter.Init())
	state.Grandchild.Alive = true
	state.Grandchild.Requested = false
	state.Grandchild.Pending = false
	state.Grandchild.RequestID = 0n
	state.Grandchild.Token = ""
	state.Grandchild.Reply = ""
	state.Grandchild.Counter.__goscriptAssign(counter.Init())
	return [state, $.arrayToSlice<gobi.Effect>([])]
}

export function complete(state: State, token: string): [State, $.Slice<gobi.Effect>] {
	if ((state.Parent.Alive && state.Parent.Pending) && ($.stringEqual(state.Parent.Token, token))) {
		state.Parent.Pending = false
		state.Parent.Reply = token
	} else {
		if ((state.Child.Alive && state.Child.Pending) && ($.stringEqual(state.Child.Token, token))) {
			state.Child.Pending = false
			state.Child.Reply = token
		} else {
			if ((state.Grandchild.Alive && state.Grandchild.Pending) && ($.stringEqual(state.Grandchild.Token, token))) {
				state.Grandchild.Pending = false
				state.Grandchild.Reply = token
			} else {
				if ((state.Sibling.Alive && state.Sibling.Pending) && ($.stringEqual(state.Sibling.Token, token))) {
					state.Sibling.Pending = false
					state.Sibling.Reply = token
				}
			}
		}
	}
	return [state, $.arrayToSlice<gobi.Effect>([])]
}

export function tokenFor(scope: string, generation: bigint, requestID: bigint): string {
	return scope + ":g" + strconv.FormatUint(generation, 10) + ":r" + strconv.FormatUint(requestID, 10)
}

export function requestEffect(token: string): gobi.Effect {
	return new gobi.Effect(true, "fixture.request", "lookup", token, "complete")
}

export function cancelEffect(token: string): gobi.Effect {
	return new gobi.Effect(true, "lifecycle.cancel", "cancel", token, "")
}
