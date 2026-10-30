//go:build js && wasm

// Package godom implements the v1 keyed renderer directly against browser DOM
// objects from Go/WASM. It deliberately contains no collection transitions.
package godom

import (
	"encoding/json"
	"fmt"
	"math"
	"strconv"
	"strings"

	"syscall/js"

	"github.com/samuelpmahan/gondola/gobi"
	"github.com/samuelpmahan/gondola/inputbinding"
	"github.com/samuelpmahan/gondola/rendercontract"
)

const errorPrefix = "keyed Go DOM: "

type listenerSet struct {
	element js.Value
	byEvent map[string]js.Func
}

// Renderer owns one mounted DOM root. All state transitions remain in the
// facade; this package only reconciles validated snapshots and dispatches
// browser event data back to it.
type Renderer struct {
	root          js.Value
	document      js.Value
	facade        js.Value
	current       rendercontract.Snapshot
	active        bool
	disposed      bool
	patching      bool
	lastError     error
	pathNodes     map[string]js.Value
	pathEls       map[string]js.Value
	orderedEls    []string
	domByKey      map[string]js.Value
	elementKey    map[string]js.Value
	pathByDOM     js.Value
	keyByDOM      js.Value
	listeners     map[string]*listenerSet
	eventBindings []inputbinding.Binding
}

// New mounts the initial facade snapshot into root after validating it. A
// failed mount removes any partial DOM and releases every installed callback.
func New(root, facade js.Value) (renderer *Renderer, err error) {
	if err := validateRoot(root); err != nil {
		return nil, err
	}
	if facade.Type() != js.TypeObject || facade.IsNull() ||
		facade.Get("init").Type() != js.TypeFunction || facade.Get("dispatch").Type() != js.TypeFunction {
		return nil, fmt.Errorf("%s facade must expose init() and dispatch()", errorPrefix)
	}
	r := &Renderer{
		root:       root,
		document:   root.Get("ownerDocument"),
		facade:     facade,
		active:     true,
		pathNodes:  map[string]js.Value{},
		pathEls:    map[string]js.Value{},
		domByKey:   map[string]js.Value{},
		elementKey: map[string]js.Value{},
		pathByDOM:  js.Global().Get("WeakMap").New(),
		keyByDOM:   js.Global().Get("WeakMap").New(),
		listeners:  map[string]*listenerSet{},
	}
	defer func() {
		if recovered := recover(); recovered != nil {
			err = fmt.Errorf("%sinitial mount failed: %v", errorPrefix, recovered)
		}
		if err != nil {
			r.disposeListeners()
			r.active = false
			r.disposed = true
			callQuiet(root, "replaceChildren")
			renderer = nil
		}
	}()

	initial, err := r.callFacadeSnapshot("init")
	if err != nil {
		return nil, fmt.Errorf("%s facade init failed: %w", errorPrefix, err)
	}
	if err := r.paint(initial); err != nil {
		return nil, fmt.Errorf("%s initial DOM mount failed: %w", errorPrefix, err)
	}
	renderer = r
	return renderer, nil
}

// Update applies one validated snapshot and restores keyed logical focus.
func (r *Renderer) Update(value js.Value) (result js.Value, err error) {
	if err = r.assertActive(); err != nil {
		return js.Undefined(), err
	}
	next, err := parseSnapshotValue(value)
	if err != nil {
		r.failClosed(err, false)
		return js.Undefined(), err
	}
	focus, _ := r.captureFocus()
	if err = r.paint(next); err != nil {
		r.failClosed(err, false)
		return js.Undefined(), fmt.Errorf("%s update failed: %w", errorPrefix, err)
	}
	r.restoreLogicalFocus(focus)
	r.lastError = nil
	return toJS(next), nil
}

// Snapshot returns the current validated application snapshot.
func (r *Renderer) Snapshot() (js.Value, error) {
	if err := r.assertActive(); err != nil {
		return js.Undefined(), err
	}
	return toJS(r.current), nil
}

// DOMSnapshot reports serialized browser HTML and disabled child-index paths.
func (r *Renderer) DOMSnapshot() (js.Value, error) {
	if err := r.assertActive(); err != nil {
		return js.Undefined(), err
	}
	disabled := make([]string, 0)
	for _, path := range r.orderedEls {
		element := r.pathEls[path]
		if element.Get("disabled").Type() == js.TypeBoolean && element.Get("disabled").Bool() {
			disabled = append(disabled, path)
		}
	}
	return toJS(struct {
		HTML     string   `json:"html"`
		Disabled []string `json:"disabled"`
	}{HTML: r.root.Get("innerHTML").String(), Disabled: disabled}), nil
}

// Click invokes the current rendered element's native click() method.
func (r *Renderer) Click(value js.Value) (js.Value, error) {
	if err := r.assertActive(); err != nil {
		return js.Undefined(), err
	}
	if value.Type() != js.TypeString {
		return js.Undefined(), fmt.Errorf("%sclick path must be a primitive string", errorPrefix)
	}
	path, err := normalizePath(value.String())
	if err != nil {
		return js.Undefined(), err
	}
	element, ok := r.pathEls[path]
	if !ok {
		return js.Undefined(), fmt.Errorf("%sno rendered element exists at child-index path %q", errorPrefix, path)
	}
	node, err := nodeAtPath(r.current.Tree, path)
	if err != nil {
		return js.Undefined(), err
	}
	if disabled(node) || (element.Get("disabled").Type() == js.TypeBoolean && element.Get("disabled").Bool()) {
		return toJS(r.current), nil
	}
	r.lastError = nil
	if err := callDOM(element, "click"); err != nil {
		return js.Undefined(), err
	}
	if r.lastError != nil {
		return js.Undefined(), r.lastError
	}
	return toJS(r.current), nil
}

// FocusState captures the active keyed text input and its selection.
func (r *Renderer) FocusState() (js.Value, error) {
	if err := r.assertActive(); err != nil {
		return js.Undefined(), err
	}
	focus, err := r.captureFocus()
	if err != nil {
		return js.Undefined(), err
	}
	if focus == nil {
		return js.Null(), nil
	}
	return toJS(focus), nil
}

// RestoreFocus restores a serialized logical focus record when its keyed input
// still exists and is enabled.
func (r *Renderer) RestoreFocus(value js.Value) (js.Value, error) {
	if err := r.assertActive(); err != nil {
		return js.Undefined(), err
	}
	focus, err := parseFocus(value)
	if err != nil {
		return js.Undefined(), err
	}
	return js.ValueOf(r.restoreLogicalFocus(focus)), nil
}

// Unmount removes listeners, releases Go callbacks, clears the root and is
// idempotent.
func (r *Renderer) Unmount() error {
	if r == nil || r.disposed {
		return nil
	}
	r.active = false
	r.disposed = true
	r.disposeListeners()
	r.pathEls = map[string]js.Value{}
	r.pathNodes = map[string]js.Value{}
	r.domByKey = map[string]js.Value{}
	r.elementKey = map[string]js.Value{}
	r.orderedEls = nil
	return callDOM(r.root, "replaceChildren")
}

func validateRoot(root js.Value) error {
	if root.Type() != js.TypeObject || root.IsNull() || root.Get("nodeType").Type() != js.TypeNumber || root.Get("nodeType").Int() != 1 ||
		root.Get("ownerDocument").Type() != js.TypeObject || root.Get("ownerDocument").IsNull() ||
		root.Get("replaceChildren").Type() != js.TypeFunction || root.Get("contains").Type() != js.TypeFunction {
		return fmt.Errorf("%sroot must be a DOM element with ownerDocument, contains(), and replaceChildren()", errorPrefix)
	}
	return nil
}

func (r *Renderer) assertActive() error {
	if r == nil || r.disposed {
		return fmt.Errorf("%srenderer has been unmounted", errorPrefix)
	}
	if !r.active {
		if r.lastError != nil {
			return fmt.Errorf("%srenderer is fenced after an error: %w", errorPrefix, r.lastError)
		}
		return fmt.Errorf("%srenderer is inactive", errorPrefix)
	}
	return nil
}

func (r *Renderer) failClosed(err error, notifyHost bool) {
	if err == nil {
		err = fmt.Errorf("%sunknown renderer failure", errorPrefix)
	}
	r.lastError = err
	r.active = false
	r.disposeListeners()
	if notifyHost && r.facade.Get("rendererFailed").Type() == js.TypeFunction {
		func() {
			defer func() { _ = recover() }()
			r.facade.Call("rendererFailed", toJS(struct {
				Error string `json:"error"`
			}{Error: err.Error()}))
		}()
	}
}

func (r *Renderer) callFacadeSnapshot(method string) (snapshot rendercontract.Snapshot, err error) {
	defer func() {
		if recovered := recover(); recovered != nil {
			err = fmt.Errorf("%s%s threw: %v", errorPrefix, method, recovered)
		}
	}()
	value := r.facade.Call(method)
	if message := returnedError(value); message != "" {
		return snapshot, fmt.Errorf("%s", message)
	}
	return parseSnapshotValue(value)
}

func parseSnapshotValue(value js.Value) (rendercontract.Snapshot, error) {
	encoded, err := stringify(value)
	if err != nil {
		return rendercontract.Snapshot{}, err
	}
	snapshot, err := rendercontract.ParseSnapshot([]byte(encoded))
	if err != nil {
		return rendercontract.Snapshot{}, fmt.Errorf("invalid snapshot: %w", err)
	}
	return snapshot, nil
}

func stringify(value js.Value) (encoded string, err error) {
	defer func() {
		if recovered := recover(); recovered != nil {
			encoded = ""
			err = fmt.Errorf("%sinput is not JSON-serializable: %v", errorPrefix, recovered)
		}
	}()
	if value.IsNull() || value.IsUndefined() {
		return "", fmt.Errorf("%sinput must be a JSON object", errorPrefix)
	}
	result := js.Global().Get("JSON").Call("stringify", value)
	if result.Type() != js.TypeString {
		return "", fmt.Errorf("%sinput is not JSON-serializable", errorPrefix)
	}
	return result.String(), nil
}

func toJS(value any) (result js.Value) {
	defer func() {
		if recover() != nil {
			result = js.Undefined()
		}
	}()
	encoded, err := json.Marshal(value)
	if err != nil {
		return js.Undefined()
	}
	return js.Global().Get("JSON").Call("parse", string(encoded))
}

func returnedError(value js.Value) string {
	if value.Type() != js.TypeObject || value.IsNull() || value.Get("error").Type() != js.TypeString {
		return ""
	}
	return value.Get("error").String()
}

func (r *Renderer) paint(next rendercontract.Snapshot) (err error) {
	defer func() {
		if recovered := recover(); recovered != nil {
			err = fmt.Errorf("DOM operation failed: %v", recovered)
		}
	}()
	previous := r.current
	previousNodes := indexNodes(previous.Tree)
	previousDOMByKey := r.domByKey
	nextPathNodes := map[string]js.Value{}
	nextPathEls := map[string]js.Value{}
	nextDomByKey := map[string]js.Value{}
	nextElementKey := map[string]js.Value{}
	nextOrderedEls := make([]string, 0)
	pathByDOM := js.Global().Get("WeakMap").New()
	keyByDOM := js.Global().Get("WeakMap").New()
	r.patching = true
	defer func() { r.patching = false }()

	var oldRootDOM js.Value
	if r.root.Get("childNodes").Get("length").Int() > 0 {
		oldRootDOM = r.root.Get("childNodes").Index(0)
	}
	var oldRoot *gobi.Node
	if previous.Tree.Kind != 0 {
		// A renderer created through New always has a snapshot. This branch also
		// lets the first paint start from an empty zero-value renderer.
		oldRoot = &previous.Tree
	}
	r.eventBindings = next.Bindings
	rootNode := r.patchNode(next.Tree, "", oldRoot, oldRootDOM, previousNodes, previousDOMByKey,
		nextPathNodes, nextPathEls, nextDomByKey, nextElementKey, &nextOrderedEls, pathByDOM, keyByDOM)
	if !sameDOMNode(r.root.Get("childNodes").Index(0), rootNode) {
		reference := js.Null()
		if r.root.Get("childNodes").Get("length").Int() > 0 {
			reference = r.root.Get("childNodes").Index(0)
		}
		r.root.Call("insertBefore", rootNode, reference)
	}
	for r.root.Get("childNodes").Get("length").Int() > 1 {
		r.root.Call("removeChild", r.root.Get("childNodes").Index(1))
	}

	for key, previousSet := range r.listeners {
		nextElement, retained := nextDomByKey[key]
		if !retained || !nextElement.Equal(previousSet.element) {
			r.removeListenerSet(key)
		}
	}
	r.current = next
	r.pathNodes = nextPathNodes
	r.pathEls = nextPathEls
	r.domByKey = nextDomByKey
	r.elementKey = nextElementKey
	r.orderedEls = nextOrderedEls
	r.pathByDOM = pathByDOM
	r.keyByDOM = keyByDOM
	r.eventBindings = nil
	return nil
}

func (r *Renderer) patchNode(node gobi.Node, path string, previousNode *gobi.Node, previousDOM js.Value,
	previousNodes map[string]gobi.Node, previousDOMByKey map[string]js.Value,
	nextPathNodes, nextPathEls, nextDomByKey, nextElementKey map[string]js.Value,
	orderedEls *[]string, pathByDOM, keyByDOM js.Value) js.Value {
	var domNode js.Value
	var oldNode gobi.Node
	var hasOld bool
	if node.Kind == gobi.Element {
		oldNode, hasOld = previousNodes[node.Key]
		previousDOM = previousDOMByKey[node.Key]
	} else if previousNode != nil {
		oldNode = *previousNode
		hasOld = true
	}
	compatible := hasOld && sameKindAndTag(node, oldNode) && isCompatibleDOM(node, previousDOM)
	if compatible {
		domNode = previousDOM
	} else if node.Kind == gobi.Text {
		domNode = r.document.Call("createTextNode", node.Text)
	} else {
		domNode = r.document.Call("createElement", node.Tag)
	}

	nextPathNodes[path] = domNode
	pathByDOM.Call("set", domNode, path)
	if node.Kind == gobi.Text {
		if domNode.Get("nodeValue").String() != node.Text {
			domNode.Set("nodeValue", node.Text)
		}
		return domNode
	}

	nextPathEls[path] = domNode
	*orderedEls = append(*orderedEls, path)
	nextDomByKey[node.Key] = domNode
	nextElementKey[node.Key] = domNode
	keyByDOM.Call("set", domNode, node.Key)
	r.patchAttributes(domNode, node, oldNode, compatible)
	r.syncListeners(node, path, domNode)

	children := make([]js.Value, len(node.Kids))
	var previousKids []gobi.Node
	if compatible {
		previousKids = oldNode.Kids
	}
	oldChildNodes := domNode.Get("childNodes")
	for index, child := range node.Kids {
		childPath := childPath(path, index)
		var previousChild *gobi.Node
		var previousChildDOM js.Value
		if index < len(previousKids) {
			previousChild = &previousKids[index]
			if index < oldChildNodes.Get("length").Int() {
				previousChildDOM = oldChildNodes.Index(index)
			}
		}
		children[index] = r.patchNode(child, childPath, previousChild, previousChildDOM, previousNodes, previousDOMByKey,
			nextPathNodes, nextPathEls, nextDomByKey, nextElementKey, orderedEls, pathByDOM, keyByDOM)
	}
	for index, childDOM := range children {
		currentLength := domNode.Get("childNodes").Get("length").Int()
		var existing js.Value
		if index < currentLength {
			existing = domNode.Get("childNodes").Index(index)
		}
		if existing.Type() == js.TypeUndefined || !existing.Equal(childDOM) {
			var reference js.Value
			if existing.Type() != js.TypeUndefined {
				reference = existing
			} else {
				reference = js.Null()
			}
			domNode.Call("insertBefore", childDOM, reference)
		}
	}
	for domNode.Get("childNodes").Get("length").Int() > len(children) {
		domNode.Call("removeChild", domNode.Get("childNodes").Index(len(children)))
	}
	return domNode
}

func isCompatibleDOM(node gobi.Node, value js.Value) bool {
	if value.Type() != js.TypeObject || value.IsNull() {
		return false
	}
	if node.Kind == gobi.Text {
		return value.Get("nodeType").Type() == js.TypeNumber && value.Get("nodeType").Int() == 3
	}
	return value.Get("nodeType").Type() == js.TypeNumber && value.Get("nodeType").Int() == 1 &&
		value.Get("localName").String() == node.Tag
}

func sameKindAndTag(next, old gobi.Node) bool {
	if next.Kind != old.Kind {
		return false
	}
	return next.Kind != gobi.Element || next.Tag == old.Tag
}

func sameDOMNode(left, right js.Value) bool {
	return left.Type() == js.TypeObject && !left.IsNull() && left.Equal(right)
}

func indexNodes(root gobi.Node) map[string]gobi.Node {
	result := map[string]gobi.Node{}
	var visit func(gobi.Node)
	visit = func(node gobi.Node) {
		if node.Kind == gobi.Element {
			result[node.Key] = node
		}
		for _, child := range node.Kids {
			visit(child)
		}
	}
	visit(root)
	return result
}

func (r *Renderer) patchAttributes(element js.Value, node, previous gobi.Node, compatible bool) {
	attrs := append([]gobi.Attr(nil), node.Attrs...)
	if node.Tag == "input" {
		ordinary := make([]gobi.Attr, 0, len(attrs))
		var typeAttr, valueAttr *gobi.Attr
		for index := range attrs {
			attr := attrs[index]
			switch attr.Name {
			case "type":
				copy := attr
				typeAttr = &copy
			case "value":
				copy := attr
				valueAttr = &copy
			default:
				ordinary = append(ordinary, attr)
			}
		}
		attrs = ordinary
		if typeAttr != nil {
			attrs = append(attrs, *typeAttr)
		}
		if valueAttr != nil {
			attrs = append(attrs, *valueAttr)
		}
	}
	nextNames := make(map[string]struct{}, len(attrs))
	for _, attr := range attrs {
		nextNames[attr.Name] = struct{}{}
	}
	existing := element.Get("attributes")
	for index := existing.Get("length").Int() - 1; index >= 0; index-- {
		attr := existing.Index(index)
		name := attr.Get("name").String()
		if _, ok := nextNames[name]; !ok {
			element.Call("removeAttribute", name)
		}
	}
	oldValue, hasOldValue := inputValue(previous)
	if !compatible {
		hasOldValue = false
	}
	for _, attr := range attrs {
		before := element.Call("getAttribute", attr.Name)
		if attr.Flag {
			if !element.Call("hasAttribute", attr.Name).Bool() {
				element.Call("setAttribute", attr.Name, "")
			}
		} else if before.IsNull() || before.String() != attr.Value {
			element.Call("setAttribute", attr.Name, attr.Value)
		}
		if attr.Name == "value" && hasOldValue && oldValue != attr.Value && element.Get("value").Type() == js.TypeString &&
			element.Get("value").String() != attr.Value {
			element.Set("value", attr.Value)
		}
	}
}

func inputValue(node gobi.Node) (string, bool) {
	if node.Kind != gobi.Element || node.Tag != "input" {
		return "", false
	}
	for _, attr := range node.Attrs {
		if attr.Name == "value" && !attr.Flag {
			return attr.Value, true
		}
	}
	return "", false
}

func (r *Renderer) syncListeners(node gobi.Node, path string, element js.Value) {
	desired := map[string]struct{}{}
	for _, handler := range node.On {
		desired[handler.Event] = struct{}{}
	}
	for _, binding := range r.eventBindings {
		if binding.Path == path {
			desired[binding.Event] = struct{}{}
		}
	}
	set := r.listeners[node.Key]
	if set != nil && !set.element.Equal(element) {
		r.removeListenerSet(node.Key)
		set = nil
	}
	if set == nil {
		set = &listenerSet{element: element, byEvent: map[string]js.Func{}}
		r.listeners[node.Key] = set
	}
	for event, callback := range set.byEvent {
		if _, ok := desired[event]; !ok {
			element.Call("removeEventListener", event, callback)
			callback.Release()
			delete(set.byEvent, event)
		}
	}
	for event := range desired {
		if _, ok := set.byEvent[event]; ok {
			continue
		}
		callback := js.FuncOf(func(this js.Value, args []js.Value) any {
			if len(args) == 0 {
				return nil
			}
			r.handleEvent(args[0])
			return nil
		})
		set.byEvent[event] = callback
		element.Call("addEventListener", event, callback)
	}
}

func (r *Renderer) removeListenerSet(key string) {
	set := r.listeners[key]
	if set == nil {
		return
	}
	for event, callback := range set.byEvent {
		callQuiet(set.element, "removeEventListener", event, callback)
		callback.Release()
	}
	delete(r.listeners, key)
}

func (r *Renderer) disposeListeners() {
	for key := range r.listeners {
		r.removeListenerSet(key)
	}
}

func (r *Renderer) handleEvent(event js.Value) {
	defer func() {
		if recovered := recover(); recovered != nil {
			r.failClosed(fmt.Errorf("%sDOM event callback failed: %v", errorPrefix, recovered), true)
		}
	}()
	if !r.active || r.patching {
		return
	}
	target := event.Get("currentTarget")
	if target.Type() != js.TypeObject || target.IsNull() || !r.root.Call("contains", target).Bool() {
		return
	}
	pathValue := r.pathByDOM.Call("get", target)
	if pathValue.Type() != js.TypeString {
		return
	}
	path := pathValue.String()
	if current, ok := r.pathEls[path]; !ok || !current.Equal(target) {
		return
	}
	node, err := nodeAtPath(r.current.Tree, path)
	if err != nil {
		r.failClosed(err, true)
		return
	}
	if disabled(node) || (target.Get("disabled").Type() == js.TypeBoolean && target.Get("disabled").Bool()) {
		return
	}
	eventName := event.Get("type").String()
	var value string
	bound := false
	for _, binding := range r.current.Bindings {
		if binding.Path == path && binding.Event == eventName {
			read := target.Get("value")
			if read.Type() != js.TypeString {
				r.failClosed(fmt.Errorf("%sbound input currentTarget.value must be a string", errorPrefix), true)
				return
			}
			value = read.String()
			bound = true
			break
		}
	}
	if !bound {
		found := false
		for _, handler := range node.On {
			if handler.Event == eventName {
				value = handler.Arg
				found = true
				break
			}
		}
		if !found {
			return
		}
	}
	keyValue := r.keyByDOM.Call("get", target)
	if keyValue.Type() != js.TypeString || keyValue.String() == "" {
		r.failClosed(fmt.Errorf("%sevent target at %s is not a keyed element", errorPrefix, path), true)
		return
	}
	step := struct {
		Path  string `json:"Path"`
		Event string `json:"Event"`
		Value string `json:"Value"`
		Key   string `json:"Key"`
	}{Path: path, Event: eventName, Value: value, Key: keyValue.String()}
	jsStep := toJS(step)
	var next rendercontract.Snapshot
	func() {
		defer func() {
			if recovered := recover(); recovered != nil {
				err = fmt.Errorf("%sfacade dispatch threw: %v", errorPrefix, recovered)
			}
		}()
		result := r.facade.Call("dispatch", jsStep)
		if message := returnedError(result); message != "" {
			err = fmt.Errorf("%s", message)
			return
		}
		next, err = parseSnapshotValue(result)
	}()
	if err != nil {
		r.failClosed(err, true)
		return
	}
	focus, _ := r.captureFocus()
	if err := r.paint(next); err != nil {
		r.failClosed(err, true)
		return
	}
	r.restoreLogicalFocus(focus)
	r.lastError = nil
}

func (r *Renderer) captureFocus() (*focusState, error) {
	active := r.document.Get("activeElement")
	if active.Type() != js.TypeObject || active.IsNull() || !r.root.Call("contains", active).Bool() ||
		active.Get("localName").String() != "input" ||
		(active.Get("disabled").Type() == js.TypeBoolean && active.Get("disabled").Bool()) ||
		active.Get("setSelectionRange").Type() != js.TypeFunction {
		return nil, nil
	}
	key := r.keyByDOM.Call("get", active)
	start := active.Get("selectionStart")
	end := active.Get("selectionEnd")
	direction := active.Get("selectionDirection")
	if key.Type() != js.TypeString || key.String() == "" || start.Type() != js.TypeNumber || end.Type() != js.TypeNumber ||
		math.Trunc(start.Float()) != start.Float() || math.Trunc(end.Float()) != end.Float() {
		return nil, nil
	}
	dir := "none"
	if direction.Type() == js.TypeString {
		dir = direction.String()
	}
	return &focusState{Key: key.String(), SelectionStart: start.Int(), SelectionEnd: end.Int(), SelectionDirection: dir}, nil
}

func (r *Renderer) restoreLogicalFocus(state *focusState) bool {
	if state == nil {
		return false
	}
	path, exists := pathForKey(r.current.Tree, state.Key)
	if !exists {
		return false
	}
	node, err := nodeAtPath(r.current.Tree, path)
	if err != nil || node.Kind != gobi.Element || node.Tag != "input" || disabled(node) {
		return false
	}
	element, exists := r.elementKey[state.Key]
	if !exists || !r.root.Call("contains", element).Bool() ||
		(element.Get("disabled").Type() == js.TypeBoolean && element.Get("disabled").Bool()) ||
		element.Get("focus").Type() != js.TypeFunction || element.Get("setSelectionRange").Type() != js.TypeFunction {
		return false
	}
	defer func() { _ = recover() }()
	if !r.document.Get("activeElement").Equal(element) {
		element.Call("focus")
	}
	start := element.Get("selectionStart")
	end := element.Get("selectionEnd")
	direction := element.Get("selectionDirection")
	if start.Type() != js.TypeNumber || end.Type() != js.TypeNumber || start.Int() != state.SelectionStart ||
		end.Int() != state.SelectionEnd || direction.Type() != js.TypeString || direction.String() != state.SelectionDirection {
		element.Call("setSelectionRange", state.SelectionStart, state.SelectionEnd, state.SelectionDirection)
	}
	return true
}

type focusState struct {
	Key                string `json:"key"`
	SelectionStart     int    `json:"selectionStart"`
	SelectionEnd       int    `json:"selectionEnd"`
	SelectionDirection string `json:"selectionDirection"`
}

func parseFocus(value js.Value) (*focusState, error) {
	if value.IsNull() || value.IsUndefined() {
		return nil, nil
	}
	if value.Type() != js.TypeObject || value.IsNull() || js.Global().Get("Array").Call("isArray", value).Bool() {
		return nil, fmt.Errorf("%sfocus state must contain key, selectionStart, selectionEnd and selectionDirection", errorPrefix)
	}
	encoded, err := stringify(value)
	if err != nil {
		return nil, err
	}
	var fields map[string]json.RawMessage
	if err := json.Unmarshal([]byte(encoded), &fields); err != nil || len(fields) != 4 {
		return nil, fmt.Errorf("%sfocus state must contain key, selectionStart, selectionEnd and selectionDirection", errorPrefix)
	}
	for _, field := range []string{"key", "selectionStart", "selectionEnd", "selectionDirection"} {
		if _, ok := fields[field]; !ok {
			return nil, fmt.Errorf("%sfocus state must contain key, selectionStart, selectionEnd and selectionDirection", errorPrefix)
		}
	}
	var state focusState
	decoder := json.NewDecoder(strings.NewReader(encoded))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&state); err != nil {
		return nil, fmt.Errorf("%sfocus state must contain key, selectionStart, selectionEnd and selectionDirection", errorPrefix)
	}
	return &state, nil
}

func (r *Renderer) pathForKey(key string) (string, bool) {
	var found string
	matched := false
	var visit func(gobi.Node, string)
	visit = func(node gobi.Node, path string) {
		if matched {
			return
		}
		if node.Kind == gobi.Element && node.Key == key {
			found, matched = path, true
			return
		}
		for index, child := range node.Kids {
			visit(child, childPath(path, index))
		}
	}
	visit(r.current.Tree, "")
	return found, matched
}

func pathForKey(tree gobi.Node, key string) (string, bool) {
	var found string
	matched := false
	var visit func(gobi.Node, string)
	visit = func(node gobi.Node, path string) {
		if matched {
			return
		}
		if node.Kind == gobi.Element && node.Key == key {
			found, matched = path, true
			return
		}
		for index, child := range node.Kids {
			visit(child, childPath(path, index))
		}
	}
	visit(tree, "")
	return found, matched
}

func nodeAtPath(root gobi.Node, path string) (gobi.Node, error) {
	if path == "" {
		return root, nil
	}
	indexes, err := pathIndexes(path)
	if err != nil {
		return gobi.Node{}, err
	}
	current := root
	for _, index := range indexes {
		if index >= len(current.Kids) {
			return gobi.Node{}, fmt.Errorf("child index %d out of range in path %q", index, path)
		}
		current = current.Kids[index]
	}
	return current, nil
}

func normalizePath(path string) (string, error) {
	if path == "" {
		return "", nil
	}
	indexes, err := pathIndexes(path)
	if err != nil {
		return "", fmt.Errorf("%sinvalid child-index path %q", errorPrefix, path)
	}
	parts := make([]string, len(indexes))
	for index, value := range indexes {
		parts[index] = strconv.Itoa(value)
	}
	return strings.Join(parts, "/"), nil
}

func pathIndexes(path string) ([]int, error) {
	if path == "" {
		return nil, nil
	}
	parts := strings.Split(path, "/")
	indexes := make([]int, len(parts))
	for index, part := range parts {
		value, err := strconv.Atoi(part)
		if err != nil || value < 0 || strconv.Itoa(value) != part {
			return nil, fmt.Errorf("invalid path %q", path)
		}
		indexes[index] = value
	}
	return indexes, nil
}

func childPath(parent string, index int) string {
	if parent == "" {
		return strconv.Itoa(index)
	}
	return parent + "/" + strconv.Itoa(index)
}

func disabled(node gobi.Node) bool {
	for _, attr := range node.Attrs {
		if attr.Name == "disabled" && attr.Flag {
			return true
		}
	}
	return false
}

func callDOM(target js.Value, method string, args ...any) (err error) {
	defer func() {
		if recovered := recover(); recovered != nil {
			err = fmt.Errorf("%sDOM %s failed: %v", errorPrefix, method, recovered)
		}
	}()
	target.Call(method, args...)
	return nil
}

func callQuiet(target js.Value, method string, args ...any) {
	defer func() { _ = recover() }()
	target.Call(method, args...)
}
