package compilercontract

import (
	"fmt"
	"github.com/samuelpmahan/gondola/gobi"
)

type EffectKind string

const EffectKindRequest EffectKind = "fixture.request"

type Action struct {
	Path  string `json:"path"`
	Event string `json:"event"`
	Value string `json:"value"`
}
type MessageValue struct {
	Name string `json:"name"`
	Arg  string `json:"arg"`
}
type EffectValue struct {
	Kind  string `json:"kind"`
	Name  string `json:"name"`
	Arg   string `json:"arg"`
	Reply string `json:"reply"`
}
type NodeRecord struct {
	Kind  gobi.Kind       `json:"kind"`
	Tag   string          `json:"tag"`
	Key   string          `json:"key"`
	Attrs []AttrRecord    `json:"attrs"`
	On    []HandlerRecord `json:"on"`
	Kids  []NodeRecord    `json:"kids"`
	Text  string          `json:"text"`
}

type AttrRecord struct {
	Name  string        `json:"name"`
	Value string        `json:"value"`
	Flag  bool          `json:"flag"`
	Style []StyleRecord `json:"style"`
}
type StyleRecord struct {
	Property string `json:"property"`
	Value    string `json:"value"`
}
type HandlerRecord struct {
	Event   string `json:"event"`
	Message string `json:"message"`
	Arg     string `json:"arg"`
}
type EffectRequest struct {
	DispatchID  string      `json:"dispatchId"`
	EffectIndex uint64      `json:"effectIndex"`
	Effect      EffectValue `json:"effect"`
}
type EffectCompletion struct {
	DispatchID  string       `json:"dispatchId"`
	EffectIndex uint64       `json:"effectIndex"`
	Message     MessageValue `json:"message"`
}
type DOMControl struct {
	Path     string `json:"path"`
	Key      string `json:"key"`
	Tag      string `json:"tag"`
	Type     string `json:"type"`
	Value    string `json:"value"`
	Checked  bool   `json:"checked"`
	Disabled bool   `json:"disabled"`
}
type DOMSnapshot struct {
	Normalization string       `json:"normalization"`
	HTML          string       `json:"html"`
	Controls      []DOMControl `json:"controls"`
}
type Tick struct {
	Index            uint64             `json:"index"`
	Action           *Action            `json:"action"`
	Message          *MessageValue      `json:"message"`
	DispatchID       *string            `json:"dispatchId"`
	State            Value              `json:"state"`
	RequestedEffects []EffectRequest    `json:"requestedEffects"`
	CompletedEffects []EffectCompletion `json:"completedEffects"`
	View             ViewRecord         `json:"view"`
	DOM              *DOMSnapshot       `json:"dom"`
}
type Trace struct {
	Schema string `json:"schema"`
	AppID  string `json:"appId"`
	Ticks  []Tick `json:"ticks"`
}
type HostStep struct {
	Request    EffectRequest `json:"request"`
	Completion *MessageValue `json:"completion"`
}
type HostScript struct {
	Schema string     `json:"schema"`
	Steps  []HostStep `json:"steps"`
}

func NodeRecordFromGobi(node gobi.Node) NodeRecord {
	out := NodeRecord{Kind: node.Kind, Tag: node.Tag, Key: node.Key, Text: node.Text}
	if node.Attrs != nil {
		out.Attrs = make([]AttrRecord, len(node.Attrs))
		for i, attr := range node.Attrs {
			out.Attrs[i] = AttrRecord{Name: attr.Name, Value: attr.Value, Flag: attr.Flag}
			if attr.Style != nil {
				out.Attrs[i].Style = make([]StyleRecord, len(attr.Style))
				for j, style := range attr.Style {
					out.Attrs[i].Style[j] = StyleRecord{Property: style.Property, Value: style.Value}
				}
			}
		}
	}
	if node.On != nil {
		out.On = make([]HandlerRecord, len(node.On))
		for i, h := range node.On {
			out.On[i] = HandlerRecord{Event: h.Event, Message: h.Message, Arg: h.Arg}
		}
	}
	if node.Kids != nil {
		out.Kids = make([]NodeRecord, len(node.Kids))
		for i, kid := range node.Kids {
			out.Kids[i] = NodeRecordFromGobi(kid)
		}
	}
	return out
}

func (record NodeRecord) GobiNode() gobi.Node {
	node := gobi.Node{Kind: record.Kind, Tag: record.Tag, Key: record.Key, Text: record.Text}
	if record.Attrs != nil {
		node.Attrs = make([]gobi.Attr, len(record.Attrs))
		for i, attr := range record.Attrs {
			node.Attrs[i] = gobi.Attr{Name: attr.Name, Value: attr.Value, Flag: attr.Flag}
			if attr.Style != nil {
				node.Attrs[i].Style = make([]gobi.Style, len(attr.Style))
				for j, style := range attr.Style {
					node.Attrs[i].Style[j] = gobi.Style{Property: style.Property, Value: style.Value}
				}
			}
		}
	}
	if record.On != nil {
		node.On = make([]gobi.On, len(record.On))
		for i, h := range record.On {
			node.On[i] = gobi.On{Event: h.Event, Message: h.Message, Arg: h.Arg}
		}
	}
	if record.Kids != nil {
		node.Kids = make([]gobi.Node, len(record.Kids))
		for i, kid := range record.Kids {
			node.Kids[i] = kid.GobiNode()
		}
	}
	return node
}

type ViewRecord struct {
	Tree     NodeRecord `json:"tree"`
	Bindings []Binding  `json:"bindings"`
}

func ViewRecordFromView(view View) ViewRecord {
	bindings := view.Bindings
	if bindings == nil {
		bindings = []Binding{}
	} else {
		copyOfBindings := make([]Binding, len(bindings))
		copy(copyOfBindings, bindings)
		bindings = copyOfBindings
	}
	return ViewRecord{Tree: NodeRecordFromGobi(view.Tree), Bindings: bindings}
}

func MessageFromGobi(message gobi.Message) MessageValue {
	return MessageValue{Name: message.Name, Arg: message.Arg}
}

func EffectFromGobi(effect gobi.Effect) EffectValue {
	return EffectValue{Kind: effect.Kind, Name: effect.Name, Arg: effect.Arg, Reply: effect.Reply}
}

func NewTrace(appID string) Trace {
	return Trace{Schema: TraceSchema, AppID: appID, Ticks: []Tick{}}
}

func NewView(tree gobi.Node, bindings ...Binding) View {
	copied := make([]Binding, len(bindings))
	copy(copied, bindings)
	return View{Tree: tree, Bindings: copied}
}

func AppendTick(trace *Trace, tick Tick) error {
	if trace == nil {
		return fmt.Errorf("nil trace")
	}
	if trace.Schema != TraceSchema {
		return fmt.Errorf("trace schema must be %q", TraceSchema)
	}
	if trace.AppID == "" {
		return fmt.Errorf("trace appId is empty")
	}
	if trace.Ticks == nil {
		return fmt.Errorf("trace ticks must be a non-null array")
	}
	if tick.Index != uint64(len(trace.Ticks)) {
		return fmt.Errorf("tick index %d is not next index %d", tick.Index, len(trace.Ticks))
	}
	if tick.RequestedEffects == nil {
		tick.RequestedEffects = []EffectRequest{}
	}
	if tick.CompletedEffects == nil {
		tick.CompletedEffects = []EffectCompletion{}
	}
	if tick.View.Bindings == nil {
		tick.View.Bindings = []Binding{}
	}
	if tick.DOM != nil && tick.DOM.Controls == nil {
		tick.DOM.Controls = []DOMControl{}
	}
	trace.Ticks = append(trace.Ticks, tick)
	return nil
}

func ValidateHostScript(script HostScript, requests []EffectRequest, completions []EffectCompletion) []Diagnostic {
	diagnostics := make([]Diagnostic, 0)
	add := func(code, msg string) {
		diagnostics = append(diagnostics, Diagnostic{Code: code, Severity: "error", Message: msg, Related: []Span{}})
	}
	if script.Schema != HostScriptSchema {
		add("host.schema", "host script schema must be "+HostScriptSchema)
	}
	if script.Steps == nil {
		add("host.steps", "host steps must be a non-null array")
	}
	if requests == nil {
		add("host.requests", "observed requests must be a non-null array")
	}
	if completions == nil {
		add("host.completions", "observed completions must be a non-null array")
	}
	if script.Steps == nil || requests == nil || completions == nil {
		return diagnostics
	}
	if len(script.Steps) != len(requests) {
		add("host.request-count", fmt.Sprintf("host has %d steps for %d requests", len(script.Steps), len(requests)))
	}
	expectedCompletions := make([]EffectCompletion, 0)
	for i, step := range script.Steps {
		req := step.Request
		if req.Effect.Kind != string(EffectKindRequest) || req.Effect.Name != "lookup" || req.Effect.Reply != "complete" {
			add("host.effect-kind", fmt.Sprintf("step %d has unsupported effect descriptor", i))
		}
		if req.DispatchID == "" {
			add("host.dispatch-id", fmt.Sprintf("step %d has empty dispatchId", i))
		}
		if i < len(requests) && req != requests[i] {
			add("host.request-order", fmt.Sprintf("step %d request does not exactly match observed request", i))
		}
		if req.Effect.Reply == "" {
			if step.Completion != nil {
				add("host.unexpected-completion", fmt.Sprintf("step %d has a completion for a fire-and-forget effect", i))
			}
		} else {
			if step.Completion == nil {
				add("host.missing-completion", fmt.Sprintf("step %d is missing its completion message", i))
				continue
			}
			if step.Completion.Name != req.Effect.Reply {
				add("host.reply-name", fmt.Sprintf("step %d reply name %q does not match effect reply %q", i, step.Completion.Name, req.Effect.Reply))
			}
			expectedCompletions = append(expectedCompletions, EffectCompletion{DispatchID: req.DispatchID, EffectIndex: req.EffectIndex, Message: *step.Completion})
		}
	}
	if len(expectedCompletions) != len(completions) {
		add("host.completion-count", fmt.Sprintf("host script expects %d completions but observed %d", len(expectedCompletions), len(completions)))
	}
	limit := len(expectedCompletions)
	if len(completions) < limit {
		limit = len(completions)
	}
	for i := 0; i < limit; i++ {
		if expectedCompletions[i] != completions[i] {
			add("host.completion-order", fmt.Sprintf("completion %d does not match expected request/reply", i))
		}
	}
	return diagnostics
}
