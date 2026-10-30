package compilercontract

import (
	"fmt"
	"path"
	"regexp"
	"strconv"
	"strings"
	"unicode/utf8"

	"github.com/samuelpmahan/gondola/gobi"
)

var safeNamePattern = regexp.MustCompile(`^[A-Za-z_][A-Za-z0-9_.:/-]*$`)
var htmlTagPattern = regexp.MustCompile(`^[a-z][a-z0-9-]*$`)
var attrPattern = regexp.MustCompile(`^[a-z][a-z0-9:_-]*$`)
var supportedEvents = map[string]bool{
	"click": true, "dblclick": true, "input": true, "change": true, "submit": true, "reset": true,
	"select": true, "keydown": true, "keyup": true, "keypress": true, "mouseenter": true, "mouseleave": true,
	"mousedown": true, "mouseup": true, "mousemove": true, "focus": true, "blur": true, "scroll": true,
	"wheel": true, "touchstart": true, "touchend": true, "pointerdown": true, "pointerup": true, "load": true,
	"error": true, "contextmenu": true,
}

func ValidateAppIR(app AppIR) []Diagnostic {
	var out []Diagnostic
	add := func(code, message string, span Span) {
		out = append(out, Diagnostic{Code: code, Severity: "error", Message: message, Span: span, Related: []Span{}})
	}
	if app.Schema != AppIRSchema {
		add("app.schema", fmt.Sprintf("schema must be %q", AppIRSchema), Span{})
	}
	if app.PackagePath == "" {
		add("app.package", "packagePath is required", Span{})
	}
	if app.Components == nil || app.Symbols == nil || app.Types == nil {
		add("app.arrays", "components, symbols, and types must be non-null arrays", Span{})
		return out
	}
	types, err := indexTypes(app.Types)
	if err != nil {
		add("app.types", err.Error(), Span{})
	}
	for _, info := range app.Types {
		if !validJSRepresentation(info) {
			add("app.js-representation", fmt.Sprintf("type %q has unprobed or incompatible jsRepresentation %q", info.ID, info.JSRepresentation), Span{})
		}
	}
	if err := validateSliceRepresentations(app.Types); err != nil {
		add("app.js-representation", err.Error(), Span{})
	}
	symbols := make(map[SymbolID]Symbol, len(app.Symbols))
	for _, symbol := range app.Symbols {
		if symbol.ID == "" || !safeNamePattern.MatchString(string(symbol.ID)) {
			add("app.symbol-id", fmt.Sprintf("invalid symbol ID %q", symbol.ID), symbol.Span)
		}
		if _, exists := symbols[symbol.ID]; exists {
			add("app.symbol-duplicate", fmt.Sprintf("duplicate symbol ID %q", symbol.ID), symbol.Span)
		}
		symbols[symbol.ID] = symbol
		if symbol.PackagePath == "" || symbol.Name == "" {
			add("app.symbol", fmt.Sprintf("symbol %q requires packagePath and name", symbol.ID), symbol.Span)
		}
		if err := validateSpan(symbol.Span); err != nil {
			add("app.span", fmt.Sprintf("symbol %q: %v", symbol.ID, err), symbol.Span)
		}
		if symbol.Signature.Params == nil || symbol.Signature.Results == nil || symbol.Calls == nil {
			add("app.symbol-arrays", fmt.Sprintf("symbol %q params, results, and calls must be non-null arrays", symbol.ID), symbol.Span)
		}
		for _, typeID := range append(append([]TypeID{}, symbol.Signature.Params...), symbol.Signature.Results...) {
			if _, ok := types[typeID]; !ok {
				add("app.symbol-type", fmt.Sprintf("symbol %q refers to unknown type %q", symbol.ID, typeID), symbol.Span)
			}
		}
		seenCalls := map[SymbolID]bool{}
		for _, target := range symbol.Calls {
			if seenCalls[target] {
				add("app.call-duplicate", fmt.Sprintf("symbol %q repeats call target %q", symbol.ID, target), symbol.Span)
			}
			seenCalls[target] = true
			if _, ok := symbols[target]; !ok {
				// References may precede the target symbol in the ordered list. Check
				// after indexing all symbols below.
			}
		}
	}
	for _, symbol := range app.Symbols {
		for _, target := range symbol.Calls {
			if _, ok := symbols[target]; !ok {
				add("app.call-target", fmt.Sprintf("symbol %q calls missing AppIR symbol %q", symbol.ID, target), symbol.Span)
			}
		}
	}
	if len(app.Components) == 0 {
		add("app.components", "AppIR must contain at least one component", Span{})
	}
	componentIDs := map[string]bool{}
	roleIDs := map[SymbolID]bool{}
	validCapabilities := map[Capability]bool{
		CapabilityViewNode: true, CapabilityBindingValue: true, CapabilityBindingChecked: true,
		CapabilityEffectRequest: true, CapabilitySafeInteger: true, CapabilityFloat64: true,
	}
	for _, component := range app.Components {
		span := Span{}
		if component.ID == "" || component.PackagePath == "" || component.StateType == "" || component.MessageType == "" {
			add("app.component", "component requires id, packagePath, stateType, and messageType", span)
		}
		if componentIDs[component.ID] {
			add("app.component-duplicate", fmt.Sprintf("duplicate component ID %q", component.ID), span)
		}
		componentIDs[component.ID] = true
		for _, role := range []struct {
			name string
			id   SymbolID
		}{{"Init", component.Init}, {"Update", component.Update}, {"View", component.View}} {
			symbol, ok := symbols[role.id]
			if !ok {
				add("app.component-role", fmt.Sprintf("component %q has missing %s symbol %q", component.ID, role.name, role.id), span)
				continue
			}
			if symbol.PackagePath != component.PackagePath || symbol.Name != role.name {
				add("app.component-role", fmt.Sprintf("component %q %s role does not identify its package-level %s", component.ID, role.name, role.name), symbol.Span)
			}
			if roleIDs[role.id] {
				add("app.component-role-duplicate", fmt.Sprintf("symbol %q is reused as a component role", role.id), symbol.Span)
			}
			roleIDs[role.id] = true
		}
		state, stateOK := types[component.StateType]
		message, messageOK := types[component.MessageType]
		if !stateOK || state.Kind != KindStruct {
			add("app.state-type", fmt.Sprintf("component %q stateType must be a declared struct", component.ID), span)
		}
		if !messageOK || message.Kind != KindStruct {
			add("app.message-type", fmt.Sprintf("component %q messageType must be a declared struct", component.ID), span)
		}
		if init, ok := symbols[component.Init]; ok && (len(init.Signature.Params) != 0 || !equalTypes(init.Signature.Results, []TypeID{component.StateType})) {
			add("app.init-signature", fmt.Sprintf("component %q Init must be func() %s", component.ID, component.StateType), init.Span)
		}
		if update, ok := symbols[component.Update]; ok {
			if len(update.Signature.Params) != 2 || update.Signature.Params[0] != component.StateType || update.Signature.Params[1] != component.MessageType || len(update.Signature.Results) != 2 || update.Signature.Results[0] != component.StateType {
				add("app.update-signature", fmt.Sprintf("component %q Update must accept state and message and return state and effects", component.ID), update.Span)
			} else if effectSlice, ok := types[update.Signature.Results[1]]; !ok || effectSlice.Kind != KindSlice {
				add("app.update-effects", fmt.Sprintf("component %q Update effects result must be a slice", component.ID), update.Span)
			}
		}
		if view, ok := symbols[component.View]; ok && (len(view.Signature.Params) != 1 || view.Signature.Params[0] != component.StateType || len(view.Signature.Results) != 1) {
			add("app.view-signature", fmt.Sprintf("component %q View must accept state and return one view value", component.ID), view.Span)
		}
		if component.Capabilities == nil {
			add("app.capabilities", fmt.Sprintf("component %q capabilities must be a non-null array", component.ID), span)
		}
		seen := map[Capability]bool{}
		for _, capability := range component.Capabilities {
			if !validCapabilities[capability] {
				add("app.capability", fmt.Sprintf("component %q has unknown capability %q", component.ID, capability), span)
			}
			if seen[capability] {
				add("app.capability-duplicate", fmt.Sprintf("component %q repeats capability %q", component.ID, capability), span)
			}
			seen[capability] = true
		}
		if !seen[CapabilityViewNode] {
			add("app.capability-view", fmt.Sprintf("component %q must declare view.node", component.ID), span)
		}
	}
	return out
}

func validJSRepresentation(info TypeInfo) bool {
	switch info.Kind {
	case KindBool, KindString:
		return info.JSRepresentation == JSDirect
	case KindInt, KindUint:
		if info.Bits != 64 {
			return info.JSRepresentation == JSNumber
		}
		switch string(info.ID) {
		case "int64", "uint64":
			return info.JSRepresentation == JSBigInt
		case "int", "uint":
			return info.JSRepresentation == JSNumber
		default:
			return info.JSRepresentation == JSNumber || info.JSRepresentation == JSBigInt
		}
	case KindFloat64:
		return info.JSRepresentation == JSNumber
	case KindStruct:
		return info.JSRepresentation == JSClass
	case KindArray:
		return info.JSRepresentation == JSArray
	case KindSlice:
		return info.JSRepresentation == JSSliceWrapper || info.JSRepresentation == JSArrayOrSlice ||
			info.JSRepresentation == JSFloat64ArrayOrSlice || info.JSRepresentation == JSArray || info.JSRepresentation == JSFloat64Array
	default:
		return false
	}
}

func validateSliceRepresentations(types []TypeInfo) error {
	index := make(map[TypeID]TypeInfo, len(types))
	for _, info := range types {
		index[info.ID] = info
	}
	for _, info := range types {
		if info.Kind != KindSlice {
			continue
		}
		elem, ok := index[info.ElemType]
		if !ok {
			continue
		}
		floatElement := elem.Kind == KindFloat64
		switch info.JSRepresentation {
		case JSFloat64Array, JSFloat64ArrayOrSlice:
			if !floatElement {
				return fmt.Errorf("slice type %q has float64 array representation but element type %q is not float64", info.ID, info.ElemType)
			}
		case JSArray, JSArrayOrSlice:
			if floatElement {
				return fmt.Errorf("slice type %q requires float64-array representation", info.ID)
			}
		}
	}
	return nil
}

func ValidateTrace(trace Trace, app AppIR) []Diagnostic {
	var out []Diagnostic
	add := func(code, message string, tick uint64) {
		out = append(out, Diagnostic{Code: code, Severity: "error", Message: message, Span: Span{}, Related: []Span{}})
	}
	for _, diagnostic := range ValidateAppIR(app) {
		out = append(out, diagnostic)
	}
	if trace.Schema != TraceSchema {
		add("trace.schema", fmt.Sprintf("schema must be %q", TraceSchema), 0)
	}
	if trace.AppID == "" {
		add("trace.app-id", "appId is required", 0)
	}
	if trace.Ticks == nil {
		add("trace.ticks", "ticks must be a non-null array", 0)
		return out
	}
	if len(trace.Ticks) == 0 {
		add("trace.empty", "trace must contain its init tick", 0)
		return out
	}
	component := Component{}
	if len(app.Components) != 0 {
		component = app.Components[0]
	}
	type requestKey struct {
		dispatch string
		index    uint64
	}
	requests := make(map[requestKey]EffectRequest)
	completed := make(map[requestKey]bool)
	requestOrder := make([]requestKey, 0)
	dispatchCount := uint64(0)
	for i, tick := range trace.Ticks {
		if tick.Index != uint64(i) {
			add("trace.tick-index", fmt.Sprintf("tick at position %d has index %d", i, tick.Index), uint64(i))
		}
		if tick.RequestedEffects == nil || tick.CompletedEffects == nil || tick.View.Bindings == nil {
			add("trace.required-arrays", fmt.Sprintf("tick %d protocol arrays must not be null", i), uint64(i))
		}
		if tick.DOM != nil && tick.DOM.Controls == nil {
			add("trace.dom-controls", fmt.Sprintf("tick %d DOM controls must not be null", i), uint64(i))
		}
		if err := ValidateValue(tick.State, app.Types); err != nil {
			add("trace.state", fmt.Sprintf("tick %d state: %v", i, err), uint64(i))
		} else if tick.State.TypeID != component.StateType {
			add("trace.state-type", fmt.Sprintf("tick %d state has type %q, want %q", i, tick.State.TypeID, component.StateType), uint64(i))
		}
		if err := validateNode(tick.View.Tree, 0); err != nil {
			add("trace.tree", fmt.Sprintf("tick %d tree: %v", i, err), uint64(i))
		}
		for j, binding := range tick.View.Bindings {
			if binding.Message == "" || (binding.Source != TargetValue && binding.Source != TargetChecked) || !supportedEvents[binding.Event] {
				add("trace.binding", fmt.Sprintf("tick %d binding %d is invalid", i, j), uint64(i))
			} else if err := validateBinding(tick.View, binding); err != nil {
				add("trace.binding", fmt.Sprintf("tick %d binding %d: %v", i, j, err), uint64(i))
			}
		}
		if tick.DOM != nil && tick.DOM.Normalization != "outerHTML-v1" {
			add("trace.dom-normalization", fmt.Sprintf("tick %d has unsupported DOM normalization %q", i, tick.DOM.Normalization), uint64(i))
		}
		if tick.DOM != nil {
			for j, control := range tick.DOM.Controls {
				if control.Tag == "" || !validUTF8String(control.Path) || !validUTF8String(control.Value) {
					add("trace.dom-control", fmt.Sprintf("tick %d DOM control %d has invalid fields", i, j), uint64(i))
				}
			}
		}
		if i == 0 {
			if tick.Action != nil || tick.Message != nil || tick.DispatchID != nil {
				add("trace.init-envelope", "init tick must have null action, message, and dispatchId", 0)
			}
		} else if tick.Action == nil {
			if tick.Message == nil || tick.DispatchID == nil {
				add("trace.reply-envelope", fmt.Sprintf("reply tick %d must include message and dispatchId", i), uint64(i))
			}
		} else if (tick.Message == nil) != (tick.DispatchID == nil) {
			add("trace.action-envelope", fmt.Sprintf("tick %d dispatch requires both message and dispatchId", i), uint64(i))
		}
		if tick.Action != nil && (!supportedEvents[tick.Action.Event] || !validUTF8String(tick.Action.Path) || !validUTF8String(tick.Action.Event) || !validUTF8String(tick.Action.Value)) {
			add("trace.action", fmt.Sprintf("tick %d attempted action has invalid event or string", i), uint64(i))
		}
		if tick.DispatchID != nil {
			dispatchCount++
			expected := fmt.Sprintf("dispatch-%04d", dispatchCount)
			if *tick.DispatchID != expected {
				add("trace.dispatch-id", fmt.Sprintf("tick %d has dispatchId %q, want %q", i, *tick.DispatchID, expected), uint64(i))
			}
		}
		for j, request := range tick.RequestedEffects {
			if tick.DispatchID == nil || request.DispatchID != *tick.DispatchID || request.EffectIndex != uint64(j) {
				add("trace.effect-request-link", fmt.Sprintf("tick %d request %d has invalid dispatch/effect index", i, j), uint64(i))
			}
			if request.Effect.Kind != string(EffectKindRequest) || request.Effect.Name != "lookup" || request.Effect.Reply != "complete" {
				add("trace.effect-kind", fmt.Sprintf("tick %d request %d has unsupported effect descriptor", i, j), uint64(i))
			}
			key := requestKey{request.DispatchID, request.EffectIndex}
			if requests[key].DispatchID != "" {
				add("trace.effect-duplicate", fmt.Sprintf("tick %d duplicates request %s/%d", i, request.DispatchID, request.EffectIndex), uint64(i))
			} else {
				requestOrder = append(requestOrder, key)
			}
			requests[key] = request
		}
		for j, completion := range tick.CompletedEffects {
			key := requestKey{completion.DispatchID, completion.EffectIndex}
			request, ok := requests[key]
			if !ok || completed[key] {
				add("trace.effect-completion-link", fmt.Sprintf("tick %d completion %d has missing or repeated request", i, j), uint64(i))
				continue
			}
			if tick.Action != nil || tick.DispatchID == nil || tick.Message == nil || *tick.Message != completion.Message {
				add("trace.effect-completion-envelope", fmt.Sprintf("tick %d completion %d does not match its delivered message", i, j), uint64(i))
			}
			if request.Effect.Reply != completion.Message.Name {
				add("trace.effect-reply", fmt.Sprintf("tick %d completion %d has message %q, want %q", i, j, completion.Message.Name, request.Effect.Reply), uint64(i))
			}
			completed[key] = true
		}
		if tick.Message != nil && (tick.Message.Name == "" || !validUTF8String(tick.Message.Name) || !validUTF8String(tick.Message.Arg)) {
			add("trace.message", fmt.Sprintf("tick %d has invalid message", i), uint64(i))
		}
	}
	for _, key := range requestOrder {
		request := requests[key]
		if request.Effect.Reply != "" && !completed[key] {
			add("trace.effect-incomplete", fmt.Sprintf("request %s/%d has no completion", key.dispatch, key.index), uint64(len(trace.Ticks)-1))
		}
	}
	return out
}

func validateNode(node NodeRecord, depth int) error {
	if depth > maxValueDepth {
		return fmt.Errorf("tree depth exceeds %d", maxValueDepth)
	}
	switch node.Kind {
	case gobi.Text:
		if node.Tag != "" || node.Key != "" || len(node.Attrs) != 0 || len(node.On) != 0 || len(node.Kids) != 0 {
			return fmt.Errorf("text node contains element fields")
		}
		if !validUTF8String(node.Text) {
			return fmt.Errorf("text node contains invalid UTF-8")
		}
		return nil
	case gobi.Fragment:
		if node.Tag != "" || node.Key != "" || node.Text != "" || len(node.Attrs) != 0 || len(node.On) != 0 {
			return fmt.Errorf("fragment node contains non-child fields")
		}
	case gobi.Element:
		if !htmlTagPattern.MatchString(node.Tag) || node.Text != "" {
			return fmt.Errorf("invalid element tag or text")
		}
		seen := map[string]bool{}
		for _, attr := range node.Attrs {
			if !attrPattern.MatchString(attr.Name) || strings.HasPrefix(strings.ToLower(attr.Name), "on") || attr.Name == "children" || attr.Name == "dangerouslysetinnerhtml" || attr.Name == "key" || attr.Name == "ref" || seen[attr.Name] {
				return fmt.Errorf("invalid or duplicate attribute %q", attr.Name)
			}
			seen[attr.Name] = true
			if !validUTF8String(attr.Value) {
				return fmt.Errorf("attribute %q contains invalid UTF-8", attr.Name)
			}
			if attr.Name != "style" && len(attr.Style) != 0 {
				return fmt.Errorf("style declarations are only valid on style attribute")
			}
			for _, style := range attr.Style {
				if style.Property == "" || !validUTF8String(style.Property) || !validUTF8String(style.Value) {
					return fmt.Errorf("style declaration has invalid fields")
				}
			}
			if attr.Name == "style" && (attr.Flag || attr.Value != "") {
				return fmt.Errorf("style attribute must use style declarations")
			}
		}
		seenEvents := map[string]bool{}
		for _, handler := range node.On {
			if !supportedEvents[handler.Event] || handler.Message == "" || !validUTF8String(handler.Message) || !validUTF8String(handler.Arg) || seenEvents[handler.Event] {
				return fmt.Errorf("invalid or duplicate event handler %q", handler.Event)
			}
			seenEvents[handler.Event] = true
		}
	default:
		return fmt.Errorf("unsupported node kind %d", node.Kind)
	}
	keys := map[string]bool{}
	for _, kid := range node.Kids {
		if kid.Kind == gobi.Element && kid.Key != "" {
			if keys[kid.Key] {
				return fmt.Errorf("duplicate sibling key %q", kid.Key)
			}
			keys[kid.Key] = true
		}
		if err := validateNode(kid, depth+1); err != nil {
			return err
		}
	}
	return nil
}

func validateSpan(span Span) error {
	if span.File == "" || path.IsAbs(span.File) || strings.Contains(span.File, "\\") || path.Clean(span.File) != span.File || strings.HasPrefix(span.File, "../") || span.StartByte < 0 || span.EndByte < span.StartByte {
		return fmt.Errorf("invalid source span")
	}
	return nil
}

func equalTypes(left, right []TypeID) bool {
	if len(left) != len(right) {
		return false
	}
	for i := range left {
		if left[i] != right[i] {
			return false
		}
	}
	return true
}

func validUTF8String(value string) bool {
	return utf8.ValidString(value)
}

func validateBinding(view ViewRecord, binding Binding) error {
	var path []string
	if binding.Path != "" {
		path = strings.Split(binding.Path, "/")
		for _, part := range path {
			if part == "" || (len(part) > 1 && part[0] == '0') {
				return fmt.Errorf("path %q is not canonical", binding.Path)
			}
			for _, char := range part {
				if char < '0' || char > '9' {
					return fmt.Errorf("path %q is not canonical", binding.Path)
				}
			}
		}
	}
	node := view.Tree
	for _, part := range path {
		index, err := strconv.ParseUint(part, 10, 32)
		if err != nil || int(index) >= len(node.Kids) {
			return fmt.Errorf("path %q is outside the view tree", binding.Path)
		}
		node = node.Kids[index]
	}
	if node.Kind != gobi.Element || node.Tag != "input" {
		return fmt.Errorf("target at %q must be an input element", binding.Path)
	}
	attributes := make(map[string]AttrRecord, len(node.Attrs))
	for _, attr := range node.Attrs {
		attributes[attr.Name] = attr
	}
	if binding.Source == TargetValue {
		typeAttr, hasType := attributes["type"]
		valueAttr, hasValue := attributes["value"]
		if binding.Event != "input" || !hasType || typeAttr.Value != "text" || typeAttr.Flag || !hasValue || valueAttr.Flag {
			return fmt.Errorf("target.value requires an input type=text value and input event")
		}
	} else {
		typeAttr, hasType := attributes["type"]
		if binding.Event != "change" || !hasType || typeAttr.Value != "checkbox" || typeAttr.Flag {
			return fmt.Errorf("target.checked requires an input type=checkbox and change event")
		}
		if checked, ok := attributes["checked"]; ok && (!checked.Flag || checked.Value != "") {
			return fmt.Errorf("target.checked state must use a checked flag")
		}
	}
	for _, handler := range node.On {
		if handler.Event == binding.Event {
			return fmt.Errorf("binding collides with literal %q handler", binding.Event)
		}
	}
	return nil
}
