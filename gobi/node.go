// Package gobi is the interface Go application code is written against. A screen is a value (Node), a user action is
// a value (Message) and a side effect is a value (Effect). Nothing here calls a method through a Go interface, so
// goscript can compile it to synchronous TypeScript (PORTING.md rule 2).
package gobi

// Kind says what a Node is.
type Kind uint8

const (
	Element  Kind = iota + 1 // a tag such as div, with attributes, handlers and children
	Text                     // a run of text
	Fragment                 // children with no wrapping element
)

// Node is one piece of a screen, the same idea as a React element: plain data, built fresh by every View.
// Attribute names are the DOM's own (class, stroke-width), never a framework's (className, strokeWidth); each backend
// maps them. Attrs stay in the order View wrote them, because React writes them out in that order.
type Node struct {
	Kind  Kind
	Tag   string
	Key   string // identity among siblings: state stays with the key when siblings move
	Attrs []Attr
	On    []On
	Kids  []Node
	Text  string
}

// Attr is one attribute. A Flag attribute is present or absent (disabled); otherwise Value is written as text.
type Attr struct {
	Name  string
	Value string
	Flag  bool
	Style []Style // set only for the style attribute
}

// Style is one CSS declaration, with its unit written out ("12px"), so no backend guesses units.
type Style struct{ Property, Value string }

// On wires a DOM event to a Message: when Event fires on this Node, the runtime sends Message{Name, Arg} to Update.
type On struct{ Event, Message, Arg string }

// Message is what Update receives: a name the component declares and one text argument.
type Message struct{ Name, Arg string }

// Effect is a side effect Update asks for; the backend performs it and may answer with a Message.
type Effect struct{ Kind, Name, Arg, Reply string }

// El builds an element. Txt builds text. Frag builds a fragment.
func El(tag string, kids ...Node) Node { return Node{Kind: Element, Tag: tag, Kids: kids} }
func Txt(text string) Node             { return Node{Kind: Text, Text: text} }
func Frag(kids ...Node) Node           { return Node{Kind: Fragment, Kids: kids} }

// Set, Flag, Css, Keyed and Handle return a copy with one more attribute, flag, style, key or handler.
func (n Node) Set(name, value string) Node {
	n.Attrs = append(n.Attrs[:len(n.Attrs):len(n.Attrs)], Attr{Name: name, Value: value})
	return n
}
func (n Node) Flag(name string) Node {
	n.Attrs = append(n.Attrs[:len(n.Attrs):len(n.Attrs)], Attr{Name: name, Flag: true})
	return n
}
func (n Node) Css(styles ...Style) Node {
	n.Attrs = append(n.Attrs[:len(n.Attrs):len(n.Attrs)], Attr{Name: "style", Style: styles})
	return n
}
func (n Node) Keyed(key string) Node { n.Key = key; return n }
func (n Node) Handle(event, message, arg string) Node {
	n.On = append(n.On[:len(n.On):len(n.On)], On{event, message, arg})
	return n
}

// S builds one style declaration.
func S(property, value string) Style { return Style{Property: property, Value: value} }
