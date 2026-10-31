// Generated file based on build.go
// Updated when compliance tests are re-run, DO NOT EDIT!

import * as $ from "@goscript/builtin/index.js"

$.registerTypePackagePath("github.com/samuelpmahan/gondola/gobi", ["gobi.App", "gobi.Component", "gobi.File", "gobi.Backend", "gobi.Step", "gobi.Script", "gobi.Tick", "gobi.Trace", "gobi.Oracle", "gobi.Level", "gobi.Diff"])

export type Backend = {
	Emit(app: App): [$.Slice<File>, $.GoError]
	Name(): string
}

$.registerInterfaceType(
	"gobi.Backend",
	null,
	[{ name: "Emit", args: [{ type: { kind: $.TypeKind.Basic, name: "unknown" } }], returns: [{ type: /* @__PURE__ */ $.sliceType("gobi.File") }, { type: "error" }] }, { name: "Name", args: [], returns: [{ type: /* @__PURE__ */ $.basicType("string") }] }]
);

export type Oracle = {
	Name(): string
	Play(app: App, script: Script): [Trace, $.GoError]
}

$.registerInterfaceType(
	"gobi.Oracle",
	null,
	[{ name: "Name", args: [], returns: [{ type: /* @__PURE__ */ $.basicType("string") }] }, { name: "Play", args: [{ type: { kind: $.TypeKind.Basic, name: "unknown" } }, { type: { kind: $.TypeKind.Basic, name: "unknown" } }], returns: [{ type: "gobi.Trace" }, { type: "error" }] }]
);

export type Level = number

export class App {
	public declare Module: string

	public declare Root: string

	public declare Components: $.Slice<Component>

	constructor(__goscriptValue?: boolean, Module$?: string, Root$?: string, Components$?: $.Slice<Component>) {
		this.Module = Module$ ?? ""
		this.Root = Root$ ?? ""
		this.Components = Components$ ?? (null! as $.Slice<Component>)
		;(this as any).__goStructValue = __goscriptValue === true
	}

	public clone(): App {
		return new App(true, this.Module, this.Root, this.Components)
	}

	public __goscriptAssign(source: App): this {
		this.Module = source.Module
		this.Root = source.Root
		this.Components = source.Components
		return this
	}

	static __typeInfo = $.registerStructType(
		"gobi.App",
		() => new App(),
		() => [],
		App,
		() => [{ name: "Module", key: "Module", type: /* @__PURE__ */ $.basicType("string") }, { name: "Root", key: "Root", type: /* @__PURE__ */ $.basicType("string") }, { name: "Components", key: "Components", type: /* @__PURE__ */ $.sliceType("gobi.Component") }]
	)
}

export class Component {
	public declare Package: string

	public declare State: string

	public declare Messages: $.Slice<string>

	public declare Uses: $.Slice<string>

	constructor(__goscriptValue?: boolean, Package$?: string, State$?: string, Messages$?: $.Slice<string>, Uses$?: $.Slice<string>) {
		this.Package = Package$ ?? ""
		this.State = State$ ?? ""
		this.Messages = Messages$ ?? (null! as $.Slice<string>)
		this.Uses = Uses$ ?? (null! as $.Slice<string>)
		;(this as any).__goStructValue = __goscriptValue === true
	}

	public clone(): Component {
		return new Component(true, this.Package, this.State, this.Messages, this.Uses)
	}

	public __goscriptAssign(source: Component): this {
		this.Package = source.Package
		this.State = source.State
		this.Messages = source.Messages
		this.Uses = source.Uses
		return this
	}

	static __typeInfo = $.registerStructType(
		"gobi.Component",
		() => new Component(),
		() => [],
		Component,
		() => [{ name: "Package", key: "Package", type: /* @__PURE__ */ $.basicType("string") }, { name: "State", key: "State", type: /* @__PURE__ */ $.basicType("string") }, { name: "Messages", key: "Messages", type: /* @__PURE__ */ $.sliceType(/* @__PURE__ */ $.basicType("string")) }, { name: "Uses", key: "Uses", type: /* @__PURE__ */ $.sliceType(/* @__PURE__ */ $.basicType("string")) }]
	)
}

export class File {
	public declare Path: string

	public declare Bytes: $.Slice<number>

	constructor(__goscriptValue?: boolean, Path$?: string, Bytes$?: $.Slice<number>) {
		this.Path = Path$ ?? ""
		this.Bytes = Bytes$ ?? (null! as $.Slice<number>)
		;(this as any).__goStructValue = __goscriptValue === true
	}

	public clone(): File {
		return new File(true, this.Path, this.Bytes)
	}

	public __goscriptAssign(source: File): this {
		this.Path = source.Path
		this.Bytes = source.Bytes
		return this
	}

	static __typeInfo = $.registerStructType(
		"gobi.File",
		() => new File(),
		() => [],
		File,
		() => [{ name: "Path", key: "Path", type: /* @__PURE__ */ $.basicType("string") }, { name: "Bytes", key: "Bytes", type: /* @__PURE__ */ $.sliceType(/* @__PURE__ */ $.basicType("uint8")) }]
	)
}

export class Step {
	public declare Path: string

	public declare Event: string

	public declare Value: string

	constructor(__goscriptValue?: boolean, Path$?: string, Event$?: string, Value$?: string) {
		this.Path = Path$ ?? ""
		this.Event = Event$ ?? ""
		this.Value = Value$ ?? ""
		;(this as any).__goStructValue = __goscriptValue === true
	}

	public clone(): Step {
		return new Step(true, this.Path, this.Event, this.Value)
	}

	public __goscriptAssign(source: Step): this {
		this.Path = source.Path
		this.Event = source.Event
		this.Value = source.Value
		return this
	}

	static __typeInfo = $.registerStructType(
		"gobi.Step",
		() => new Step(),
		() => [],
		Step,
		() => [{ name: "Path", key: "Path", type: /* @__PURE__ */ $.basicType("string") }, { name: "Event", key: "Event", type: /* @__PURE__ */ $.basicType("string") }, { name: "Value", key: "Value", type: /* @__PURE__ */ $.basicType("string") }]
	)
}

export class Script {
	public declare Seed: bigint

	public declare Steps: $.Slice<Step>

	constructor(__goscriptValue?: boolean, Seed$?: bigint, Steps$?: $.Slice<Step>) {
		this.Seed = Seed$ ?? 0n
		this.Steps = Steps$ ?? (null! as $.Slice<Step>)
		;(this as any).__goStructValue = __goscriptValue === true
	}

	public clone(): Script {
		return new Script(true, this.Seed, this.Steps)
	}

	public __goscriptAssign(source: Script): this {
		this.Seed = source.Seed
		this.Steps = source.Steps
		return this
	}

	static __typeInfo = $.registerStructType(
		"gobi.Script",
		() => new Script(),
		() => [],
		Script,
		() => [{ name: "Seed", key: "Seed", type: /* @__PURE__ */ $.basicType("uint64") }, { name: "Steps", key: "Steps", type: /* @__PURE__ */ $.sliceType("gobi.Step") }]
	)
}

export class Tick {
	public declare Index: number

	public declare Step: Step

	public declare State: string

	public declare Tree: string

	public declare DOM: string

	public declare Pixels: string

	public declare Mutations: number

	constructor(__goscriptValue?: boolean, Index$?: number, Step$?: Step, State$?: string, Tree$?: string, DOM$?: string, Pixels$?: string, Mutations$?: number) {
		this.Index = Index$ ?? 0
		this.Step = Step$ ?? new Step(true)
		this.State = State$ ?? ""
		this.Tree = Tree$ ?? ""
		this.DOM = DOM$ ?? ""
		this.Pixels = Pixels$ ?? ""
		this.Mutations = Mutations$ ?? 0
		;(this as any).__goStructValue = __goscriptValue === true
	}

	public clone(): Tick {
		return new Tick(true, this.Index, this.Step.clone(), this.State, this.Tree, this.DOM, this.Pixels, this.Mutations)
	}

	public __goscriptAssign(source: Tick): this {
		this.Index = source.Index
		this.Step.__goscriptAssign(source.Step)
		this.State = source.State
		this.Tree = source.Tree
		this.DOM = source.DOM
		this.Pixels = source.Pixels
		this.Mutations = source.Mutations
		return this
	}

	static __typeInfo = $.registerStructType(
		"gobi.Tick",
		() => new Tick(),
		() => [],
		Tick,
		() => [{ name: "Index", key: "Index", type: /* @__PURE__ */ $.basicType("int") }, { name: "Step", key: "Step", type: "gobi.Step" }, { name: "State", key: "State", type: /* @__PURE__ */ $.basicType("string") }, { name: "Tree", key: "Tree", type: /* @__PURE__ */ $.basicType("string") }, { name: "DOM", key: "DOM", type: /* @__PURE__ */ $.basicType("string") }, { name: "Pixels", key: "Pixels", type: /* @__PURE__ */ $.basicType("string") }, { name: "Mutations", key: "Mutations", type: /* @__PURE__ */ $.basicType("int") }]
	)
}

export class Trace {
	public declare Implementation: string

	public declare Ticks: $.Slice<Tick>

	constructor(__goscriptValue?: boolean, Implementation$?: string, Ticks$?: $.Slice<Tick>) {
		this.Implementation = Implementation$ ?? ""
		this.Ticks = Ticks$ ?? (null! as $.Slice<Tick>)
		;(this as any).__goStructValue = __goscriptValue === true
	}

	public clone(): Trace {
		return new Trace(true, this.Implementation, this.Ticks)
	}

	public __goscriptAssign(source: Trace): this {
		this.Implementation = source.Implementation
		this.Ticks = source.Ticks
		return this
	}

	static __typeInfo = $.registerStructType(
		"gobi.Trace",
		() => new Trace(),
		() => [],
		Trace,
		() => [{ name: "Implementation", key: "Implementation", type: /* @__PURE__ */ $.basicType("string") }, { name: "Ticks", key: "Ticks", type: /* @__PURE__ */ $.sliceType("gobi.Tick") }]
	)
}

export class Diff {
	public declare Tick: number

	public declare Part: string

	public declare Want: string

	public declare Got: string

	public declare Found: boolean

	constructor(__goscriptValue?: boolean, Tick$?: number, Part$?: string, Want$?: string, Got$?: string, Found$?: boolean) {
		this.Tick = Tick$ ?? 0
		this.Part = Part$ ?? ""
		this.Want = Want$ ?? ""
		this.Got = Got$ ?? ""
		this.Found = Found$ ?? false
		;(this as any).__goStructValue = __goscriptValue === true
	}

	public clone(): Diff {
		return new Diff(true, this.Tick, this.Part, this.Want, this.Got, this.Found)
	}

	public __goscriptAssign(source: Diff): this {
		this.Tick = source.Tick
		this.Part = source.Part
		this.Want = source.Want
		this.Got = source.Got
		this.Found = source.Found
		return this
	}

	static __typeInfo = $.registerStructType(
		"gobi.Diff",
		() => new Diff(),
		() => [],
		Diff,
		() => [{ name: "Tick", key: "Tick", type: /* @__PURE__ */ $.basicType("int") }, { name: "Part", key: "Part", type: /* @__PURE__ */ $.basicType("string") }, { name: "Want", key: "Want", type: /* @__PURE__ */ $.basicType("string") }, { name: "Got", key: "Got", type: /* @__PURE__ */ $.basicType("string") }, { name: "Found", key: "Found", type: /* @__PURE__ */ $.basicType("bool") }]
	)
}

export const SameTree: Level = 1

export const SameDOM: Level = 2

export const SamePixels: Level = 3

export function Compare(golden: Trace, candidate: Trace, level: Level): Diff {
	if ($.sliceLen(golden.Ticks) != $.sliceLen(candidate.Ticks)) {
		return new Diff(true, -1, "Ticks", undefined, undefined, true)
	}
	for (let __goscriptRangeTarget1 = golden.Ticks, __goscriptRangeWindow0 = $.sliceRange(__goscriptRangeTarget1), i = 0; i < __goscriptRangeWindow0.length; i++) {
		let g = ((__goscriptRangeWindow0.backing[__goscriptRangeWindow0.offset + i] as Tick)).clone()
		let c = ($.plainSliceIndex(candidate.Ticks!, i)).clone()
		let parts: $.Slice<string[]> = $.arrayToSlice<string[]>([$.arrayValue(["Tree", g.Tree, c.Tree])])
		if (level >= 2) {
			parts = $.appendOne(parts, $.arrayValue(["DOM", g.DOM, c.DOM]))
		}
		if (level >= 3) {
			parts = $.appendOne(parts, $.arrayValue(["Pixels", g.Pixels, c.Pixels]))
		}
		for (let __goscriptRangeTarget0 = parts, __goscriptRangeWindow1 = $.sliceRange(__goscriptRangeTarget0), __rangeIndex = 0; __rangeIndex < __goscriptRangeWindow1.length; __rangeIndex++) {
			let p = (__goscriptRangeWindow1.backing[__goscriptRangeWindow1.offset + __rangeIndex] as string[])
			if (!$.stringEqual(p[1], p[2])) {
				return new Diff(true, i, p[0], p[1], p[2], true)
			}
		}
	}
	return new Diff(true)
}
