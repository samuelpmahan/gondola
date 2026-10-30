// Generated file based on node.go
// Updated when compliance tests are re-run, DO NOT EDIT!

import * as $ from "@goscript/builtin/index.js"

$.registerTypePackagePath("github.com/samuelpmahan/gondola/gobi", ["gobi.Kind", "gobi.Node", "gobi.Attr", "gobi.Style", "gobi.On", "gobi.Message", "gobi.Effect"])

export type Kind = number

export class Node {
	public declare Kind: Kind

	public declare Tag: string

	public declare Key: string

	public declare Attrs: $.Slice<Attr>

	public declare On: $.Slice<On>

	public declare Kids: $.Slice<Node>

	public declare Text: string

	constructor(__goscriptValue?: boolean, Kind$?: Kind, Tag$?: string, Key$?: string, Attrs$?: $.Slice<Attr>, On$?: $.Slice<On>, Kids$?: $.Slice<Node>, Text$?: string) {
		this.Kind = Kind$ ?? 0
		this.Tag = Tag$ ?? ""
		this.Key = Key$ ?? ""
		this.Attrs = Attrs$ ?? (null! as $.Slice<Attr>)
		this.On = On$ ?? (null! as $.Slice<On>)
		this.Kids = Kids$ ?? (null! as $.Slice<Node>)
		this.Text = Text$ ?? ""
		;(this as any).__goStructValue = __goscriptValue === true
	}

	public clone(): Node {
		return new Node(true, this.Kind, this.Tag, this.Key, this.Attrs, this.On, this.Kids, this.Text)
	}

	public __goscriptAssign(source: Node): this {
		this.Kind = source.Kind
		this.Tag = source.Tag
		this.Key = source.Key
		this.Attrs = source.Attrs
		this.On = source.On
		this.Kids = source.Kids
		this.Text = source.Text
		return this
	}

	public Css(styles: $.Slice<Style>): Node {
		const n = this;
		n.Attrs = $.appendOne($.goSlice(n.Attrs, undefined, $.sliceLen(n.Attrs), $.sliceLen(n.Attrs)), new Attr(true, "style", undefined, undefined, styles))
		return (n).clone()
	}

	public Flag(name: string): Node {
		const n = this;
		n.Attrs = $.appendOne($.goSlice(n.Attrs, undefined, $.sliceLen(n.Attrs), $.sliceLen(n.Attrs)), new Attr(true, name, undefined, true))
		return (n).clone()
	}

	public Handle(event: string, message: string, arg: string): Node {
		const n = this;
		n.On = $.appendOne($.goSlice(n.On, undefined, $.sliceLen(n.On), $.sliceLen(n.On)), new On(true, event, message, arg))
		return (n).clone()
	}

	public Keyed(key: string): Node {
		const n = this;
		n.Key = key
		return (n).clone()
	}

	public Set(name: string, value: string): Node {
		const n = this;
		n.Attrs = $.appendOne($.goSlice(n.Attrs, undefined, $.sliceLen(n.Attrs), $.sliceLen(n.Attrs)), new Attr(true, name, value))
		return (n).clone()
	}

	static __typeInfo = $.registerStructType(
		"gobi.Node",
		() => new Node(),
		() => [{ name: "Css", args: [{ type: { kind: $.TypeKind.Basic, name: "unknown" } }], returns: [{ type: "gobi.Node" }], variadic: true }, { name: "Flag", args: [{ type: { kind: $.TypeKind.Basic, name: "unknown" } }], returns: [{ type: "gobi.Node" }] }, { name: "Handle", args: [{ type: { kind: $.TypeKind.Basic, name: "unknown" } }, { type: { kind: $.TypeKind.Basic, name: "unknown" } }, { type: { kind: $.TypeKind.Basic, name: "unknown" } }], returns: [{ type: "gobi.Node" }] }, { name: "Keyed", args: [{ type: { kind: $.TypeKind.Basic, name: "unknown" } }], returns: [{ type: "gobi.Node" }] }, { name: "Set", args: [{ type: { kind: $.TypeKind.Basic, name: "unknown" } }, { type: { kind: $.TypeKind.Basic, name: "unknown" } }], returns: [{ type: "gobi.Node" }] }],
		Node,
		() => [{ name: "Kind", key: "Kind", type: /* @__PURE__ */ $.basicType("uint8", "gobi.Kind") }, { name: "Tag", key: "Tag", type: /* @__PURE__ */ $.basicType("string") }, { name: "Key", key: "Key", type: /* @__PURE__ */ $.basicType("string") }, { name: "Attrs", key: "Attrs", type: /* @__PURE__ */ $.sliceType("gobi.Attr") }, { name: "On", key: "On", type: /* @__PURE__ */ $.sliceType("gobi.On") }, { name: "Kids", key: "Kids", type: /* @__PURE__ */ $.sliceType("gobi.Node") }, { name: "Text", key: "Text", type: /* @__PURE__ */ $.basicType("string") }]
	)
}

export class Attr {
	public declare Name: string

	public declare Value: string

	public declare Flag: boolean

	public declare Style: $.Slice<Style>

	constructor(__goscriptValue?: boolean, Name$?: string, Value$?: string, Flag$?: boolean, Style$?: $.Slice<Style>) {
		this.Name = Name$ ?? ""
		this.Value = Value$ ?? ""
		this.Flag = Flag$ ?? false
		this.Style = Style$ ?? (null! as $.Slice<Style>)
		;(this as any).__goStructValue = __goscriptValue === true
	}

	public clone(): Attr {
		return new Attr(true, this.Name, this.Value, this.Flag, this.Style)
	}

	public __goscriptAssign(source: Attr): this {
		this.Name = source.Name
		this.Value = source.Value
		this.Flag = source.Flag
		this.Style = source.Style
		return this
	}

	static __typeInfo = $.registerStructType(
		"gobi.Attr",
		() => new Attr(),
		() => [],
		Attr,
		() => [{ name: "Name", key: "Name", type: /* @__PURE__ */ $.basicType("string") }, { name: "Value", key: "Value", type: /* @__PURE__ */ $.basicType("string") }, { name: "Flag", key: "Flag", type: /* @__PURE__ */ $.basicType("bool") }, { name: "Style", key: "Style", type: /* @__PURE__ */ $.sliceType("gobi.Style") }]
	)
}

export class Style {
	public declare Property: string

	public declare Value: string

	constructor(__goscriptValue?: boolean, Property$?: string, Value$?: string) {
		this.Property = Property$ ?? ""
		this.Value = Value$ ?? ""
		;(this as any).__goStructValue = __goscriptValue === true
	}

	public clone(): Style {
		return new Style(true, this.Property, this.Value)
	}

	public __goscriptAssign(source: Style): this {
		this.Property = source.Property
		this.Value = source.Value
		return this
	}

	static __typeInfo = $.registerStructType(
		"gobi.Style",
		() => new Style(),
		() => [],
		Style,
		() => [{ name: "Property", key: "Property", type: /* @__PURE__ */ $.basicType("string") }, { name: "Value", key: "Value", type: /* @__PURE__ */ $.basicType("string") }]
	)
}

export class On {
	public declare Event: string

	public declare Message: string

	public declare Arg: string

	constructor(__goscriptValue?: boolean, Event$?: string, Message$?: string, Arg$?: string) {
		this.Event = Event$ ?? ""
		this.Message = Message$ ?? ""
		this.Arg = Arg$ ?? ""
		;(this as any).__goStructValue = __goscriptValue === true
	}

	public clone(): On {
		return new On(true, this.Event, this.Message, this.Arg)
	}

	public __goscriptAssign(source: On): this {
		this.Event = source.Event
		this.Message = source.Message
		this.Arg = source.Arg
		return this
	}

	static __typeInfo = $.registerStructType(
		"gobi.On",
		() => new On(),
		() => [],
		On,
		() => [{ name: "Event", key: "Event", type: /* @__PURE__ */ $.basicType("string") }, { name: "Message", key: "Message", type: /* @__PURE__ */ $.basicType("string") }, { name: "Arg", key: "Arg", type: /* @__PURE__ */ $.basicType("string") }]
	)
}

export class Message {
	public declare Name: string

	public declare Arg: string

	constructor(__goscriptValue?: boolean, Name$?: string, Arg$?: string) {
		this.Name = Name$ ?? ""
		this.Arg = Arg$ ?? ""
		;(this as any).__goStructValue = __goscriptValue === true
	}

	public clone(): Message {
		return new Message(true, this.Name, this.Arg)
	}

	public __goscriptAssign(source: Message): this {
		this.Name = source.Name
		this.Arg = source.Arg
		return this
	}

	static __typeInfo = $.registerStructType(
		"gobi.Message",
		() => new Message(),
		() => [],
		Message,
		() => [{ name: "Name", key: "Name", type: /* @__PURE__ */ $.basicType("string") }, { name: "Arg", key: "Arg", type: /* @__PURE__ */ $.basicType("string") }]
	)
}

export class Effect {
	public declare Kind: string

	public declare Name: string

	public declare Arg: string

	public declare Reply: string

	constructor(__goscriptValue?: boolean, Kind$?: string, Name$?: string, Arg$?: string, Reply$?: string) {
		this.Kind = Kind$ ?? ""
		this.Name = Name$ ?? ""
		this.Arg = Arg$ ?? ""
		this.Reply = Reply$ ?? ""
		;(this as any).__goStructValue = __goscriptValue === true
	}

	public clone(): Effect {
		return new Effect(true, this.Kind, this.Name, this.Arg, this.Reply)
	}

	public __goscriptAssign(source: Effect): this {
		this.Kind = source.Kind
		this.Name = source.Name
		this.Arg = source.Arg
		this.Reply = source.Reply
		return this
	}

	static __typeInfo = $.registerStructType(
		"gobi.Effect",
		() => new Effect(),
		() => [],
		Effect,
		() => [{ name: "Kind", key: "Kind", type: /* @__PURE__ */ $.basicType("string") }, { name: "Name", key: "Name", type: /* @__PURE__ */ $.basicType("string") }, { name: "Arg", key: "Arg", type: /* @__PURE__ */ $.basicType("string") }, { name: "Reply", key: "Reply", type: /* @__PURE__ */ $.basicType("string") }]
	)
}

export const Element: Kind = 1

export const Text: Kind = 2

export const Fragment: Kind = 3

export function El(tag: string, kids: $.Slice<Node>): Node {
	return new Node(true, 1, tag, undefined, undefined, undefined, kids)
}

export function Txt(text: string): Node {
	return new Node(true, 2, undefined, undefined, undefined, undefined, undefined, text)
}

export function Frag(kids: $.Slice<Node>): Node {
	return new Node(true, 3, undefined, undefined, undefined, undefined, kids)
}

export function S(property: string, value: string): Style {
	return new Style(true, property, value)
}
