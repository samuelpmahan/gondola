//go:build js && wasm

// Command composition-wasm exposes typed parent/child composition through the
// exact-arity gobiComposition browser global.
package main

import (
	"encoding/json"
	"fmt"
	"math"
	"syscall/js"

	"github.com/samuelpmahan/gondola/asyncsave"
	"github.com/samuelpmahan/gondola/collection"
	"github.com/samuelpmahan/gondola/composition"
	"github.com/samuelpmahan/gondola/httpwire"
	"github.com/samuelpmahan/gondola/multisession"
)

var (
	manager       *composition.Manager
	keepers       []js.Func
	bridgeRunning bool
)

func main() {
	manager = composition.NewManager()
	api := js.Global().Get("Object").New()
	api.Set("create", method("create", 0, func(args []js.Value) any {
		id, err := manager.Create()
		if err != nil {
			return errorResult(err.Error())
		}
		return float64(id)
	}))
	api.Set("createChild", method("createChild", 1, func(args []js.Value) any {
		parent, err := decodeSessionID(args[0])
		if err != nil {
			return errorResult(err.Error())
		}
		id, err := manager.CreateChild(parent)
		if err != nil {
			return errorResult(err.Error())
		}
		return float64(id)
	}))
	api.Set("tree", method("tree", 0, func(args []js.Value) any {
		tree := manager.Tree()
		if tree == nil {
			tree = []multisession.SessionInfo{}
		}
		return toJS(tree)
	}))
	api.Set("list", method("list", 0, func(args []js.Value) any {
		ids := manager.List()
		if ids == nil {
			ids = []multisession.SessionID{}
		}
		return toJS(ids)
	}))
	api.Set("snapshot", method("snapshot", 1, func(args []js.Value) any {
		id, err := decodeSessionID(args[0])
		if err != nil {
			return errorResult(err.Error())
		}
		snapshot, err := manager.Snapshot(id)
		if err != nil {
			return errorResult(err.Error())
		}
		return toJS(snapshot)
	}))
	api.Set("dispatch", method("dispatch", 2, func(args []js.Value) any {
		id, err := decodeSessionID(args[0])
		if err != nil {
			return errorResult(err.Error())
		}
		step, err := decodeStep(args[1])
		if err != nil {
			return errorResult(fmt.Sprintf("invalid step: %v", err))
		}
		snapshot, err := manager.Dispatch(id, step)
		if err != nil {
			return errorResult(err.Error())
		}
		return toJS(snapshot)
	}))
	api.Set("effects", method("effects", 1, func(args []js.Value) any {
		id, err := decodeSessionID(args[0])
		if err != nil {
			return errorResult(err.Error())
		}
		commands, err := manager.Effects(id)
		if err != nil {
			return errorResult(err.Error())
		}
		if commands == nil {
			commands = []collection.Command{}
		}
		return toJS(commands)
	}))
	api.Set("complete", method("complete", 2, func(args []js.Value) any {
		id, err := decodeSessionID(args[0])
		if err != nil {
			return errorResult(err.Error())
		}
		reply, err := decodeReply(args[1])
		if err != nil {
			return errorResult(fmt.Sprintf("invalid reply: %v", err))
		}
		snapshot, err := manager.Complete(id, reply)
		if err != nil {
			return errorResult(err.Error())
		}
		return toJS(snapshot)
	}))
	api.Set("audit", method("audit", 1, func(args []js.Value) any {
		id, err := decodeSessionID(args[0])
		if err != nil {
			return errorResult(err.Error())
		}
		outcomes, err := manager.Audit(id)
		if err != nil {
			return errorResult(err.Error())
		}
		if outcomes == nil {
			outcomes = []collection.Outcome{}
		}
		return toJS(outcomes)
	}))
	api.Set("dispose", method("dispose", 1, func(args []js.Value) any {
		id, err := decodeSessionID(args[0])
		if err != nil {
			return errorResult(err.Error())
		}
		commands, err := manager.Dispose(id)
		if err != nil {
			return errorResult(err.Error())
		}
		if commands == nil {
			commands = []collection.Command{}
		}
		return toJS(commands)
	}))
	api.Set("disposeTree", method("disposeTree", 1, func(args []js.Value) any {
		id, err := decodeSessionID(args[0])
		if err != nil {
			return errorResult(err.Error())
		}
		disposals, err := manager.DisposeTree(id)
		if err != nil {
			return errorResult(err.Error())
		}
		if disposals == nil {
			disposals = []multisession.Disposal{}
		}
		return toJS(disposals)
	}))
	api.Set("setChildInputs", method("setChildInputs", 3, func(args []js.Value) any {
		parent, err := decodeSessionID(args[0])
		if err != nil {
			return errorResult(err.Error())
		}
		child, err := decodeSessionID(args[1])
		if err != nil {
			return errorResult(err.Error())
		}
		inputs, err := decodeInputs(args[2])
		if err != nil {
			return errorResult(fmt.Sprintf("invalid inputs: %v", err))
		}
		snapshot, err := manager.SetChildInputs(parent, child, inputs)
		if err != nil {
			return errorResult(err.Error())
		}
		return toJS(snapshot)
	}))
	api.Set("publish", method("publish", 3, func(args []js.Value) any {
		child, err := decodeSessionID(args[0])
		if err != nil {
			return errorResult(err.Error())
		}
		row, err := safeTypedID(args[1], "row ID")
		if err != nil {
			return errorResult(err.Error())
		}
		revision, err := safeUint(args[2], "input revision", true)
		if err != nil {
			return errorResult(err.Error())
		}
		publication, err := manager.Publish(child, collection.RowID(row), revision)
		if err != nil {
			return errorResult(err.Error())
		}
		return toJS(publication)
	}))
	api.Set("changes", method("changes", 0, func(args []js.Value) any {
		ids := manager.Changes()
		if ids == nil {
			ids = []multisession.SessionID{}
		}
		return toJS(ids)
	}))
	api.Set("encodeHTTP", method("encodeHTTP", 2, func(args []js.Value) any {
		id, err := safeTypedID(args[0], "request ID")
		if err != nil {
			return errorResult(err.Error())
		}
		if args[1].Type() != js.TypeString {
			return errorResult("encodeHTTP value must be a primitive string")
		}
		body, err := httpwire.EncodeRequest(id, args[1].String())
		if err != nil {
			return errorResult(err.Error())
		}
		return string(body)
	}))
	api.Set("decodeHTTP", method("decodeHTTP", 3, func(args []js.Value) any {
		id, err := safeTypedID(args[0], "request ID")
		if err != nil {
			return errorResult(err.Error())
		}
		status, err := safeJSInteger(args[1], 100, 599, "status")
		if err != nil {
			return errorResult(err.Error())
		}
		if args[2].Type() != js.TypeString {
			return errorResult("decodeHTTP body must be a primitive string")
		}
		return toJS(httpwire.DecodeResponse(id, int(status), []byte(args[2].String())))
	}))
	js.Global().Set("gobiComposition", api)
	select {}
}

func method(name string, arity int, operation func([]js.Value) any) js.Func {
	return keep(js.FuncOf(func(this js.Value, args []js.Value) (result any) {
		if bridgeRunning {
			return errorResult("nested gobiComposition calls are not allowed during a bridge operation")
		}
		bridgeRunning = true
		defer func() { bridgeRunning = false }()

		if len(args) != arity {
			return errorResult(fmt.Sprintf("%s requires exactly %d argument(s), got %d", name, arity, len(args)))
		}
		defer func() {
			if recovered := recover(); recovered != nil {
				result = errorResult(fmt.Sprintf("%s failed: %v", name, recovered))
			}
		}()
		return operation(args)
	}))
}

func keep(function js.Func) js.Func {
	keepers = append(keepers, function)
	return function
}

func decodeSessionID(value js.Value) (multisession.SessionID, error) {
	if value.Type() != js.TypeNumber {
		return 0, fmt.Errorf("session ID must be a primitive integer number")
	}
	number := value.Float()
	if math.IsNaN(number) || math.IsInf(number, 0) || math.Trunc(number) != number || number < 1 || number > float64(multisession.MaxSessionID) {
		return 0, fmt.Errorf("session ID must be an integer in range 1..%d", multisession.MaxSessionID)
	}
	return multisession.SessionID(uint64(number)), nil
}

func safeTypedID(value js.Value, name string) (uint64, error) {
	return safeUint(value, name, false)
}

func safeUint(value js.Value, name string, allowZero bool) (uint64, error) {
	minimum := float64(1)
	if allowZero {
		minimum = 0
	}
	number, err := safeJSInteger(value, minimum, float64(asyncsave.MaxID), name)
	if err != nil {
		return 0, err
	}
	return uint64(number), nil
}

func safeJSInteger(value js.Value, minimum, maximum float64, name string) (float64, error) {
	if value.Type() != js.TypeNumber {
		return 0, fmt.Errorf("%s must be a primitive integer number", name)
	}
	number := value.Float()
	if math.IsNaN(number) || math.IsInf(number, 0) || math.Trunc(number) != number || number < minimum || number > maximum {
		return 0, fmt.Errorf("%s must be an integer in range %d..%d", name, int64(minimum), int64(maximum))
	}
	return number, nil
}

func decodeStep(value js.Value) (step collection.Step, err error) {
	defer recoverDecode("step", &err)
	fields, err := exactDataFields(value, "Path", "Event", "Value", "Key")
	if err != nil {
		return collection.Step{}, err
	}
	path, err := requiredJSString(fields, "Path")
	if err != nil {
		return collection.Step{}, err
	}
	event, err := requiredJSString(fields, "Event")
	if err != nil {
		return collection.Step{}, err
	}
	input, err := requiredJSString(fields, "Value")
	if err != nil {
		return collection.Step{}, err
	}
	key, err := requiredJSString(fields, "Key")
	if err != nil {
		return collection.Step{}, err
	}
	return collection.Step{Path: path, Event: event, Value: input, Key: key}, nil
}

func decodeReply(value js.Value) (reply asyncsave.Reply, err error) {
	defer recoverDecode("reply", &err)
	fields, err := exactDataFields(value, "ID", "Value", "Error")
	if err != nil {
		return asyncsave.Reply{}, err
	}
	id, err := safeTypedID(fields["ID"], "reply ID")
	if err != nil {
		return asyncsave.Reply{}, err
	}
	answer, err := requiredJSString(fields, "Value")
	if err != nil {
		return asyncsave.Reply{}, err
	}
	message, err := requiredJSString(fields, "Error")
	if err != nil {
		return asyncsave.Reply{}, err
	}
	return asyncsave.Reply{ID: id, Value: answer, Error: message}, nil
}

func decodeInputs(value js.Value) (inputs composition.Inputs, err error) {
	defer recoverDecode("inputs", &err)
	fields, err := exactDataFields(value, "Title", "ReadOnly")
	if err != nil {
		return composition.Inputs{}, err
	}
	titleValue := fields["Title"]
	if titleValue.Type() != js.TypeString {
		return composition.Inputs{}, fmt.Errorf("field %q must be a primitive string", "Title")
	}
	if !validJSUTF16(titleValue) {
		return composition.Inputs{}, fmt.Errorf("field %q must contain valid Unicode", "Title")
	}
	readOnly := fields["ReadOnly"]
	if readOnly.Type() != js.TypeBoolean {
		return composition.Inputs{}, fmt.Errorf("field %q must be a primitive boolean", "ReadOnly")
	}
	return composition.Inputs{Title: titleValue.String(), ReadOnly: readOnly.Bool()}, nil
}

func recoverDecode(name string, err *error) {
	if recovered := recover(); recovered != nil {
		*err = fmt.Errorf("%s fields could not be read: %v", name, recovered)
	}
}

// exactDataFields snapshots only own data-property values. Input getters are
// rejected without invocation; proxy traps can still run, so method() fences
// nested calls while this schema is inspected.
func exactDataFields(value js.Value, names ...string) (fields map[string]js.Value, err error) {
	defer func() {
		if recovered := recover(); recovered != nil {
			fields = nil
			err = fmt.Errorf("input fields could not be read: %v", recovered)
		}
	}()
	if value.IsNull() || value.IsUndefined() || value.Type() != js.TypeObject {
		return nil, fmt.Errorf("input must be an object")
	}
	if js.Global().Get("Array").Call("isArray", value).Bool() {
		return nil, fmt.Errorf("input must be an object")
	}
	keys, err := reflectOwnKeys(value)
	if err != nil {
		return nil, err
	}
	if keys.Length() != len(names) {
		return nil, fmt.Errorf("input must contain exactly %d own field(s)", len(names))
	}
	wanted := make(map[string]struct{}, len(names))
	for _, name := range names {
		wanted[name] = struct{}{}
	}
	for index := 0; index < keys.Length(); index++ {
		key := keys.Index(index)
		if key.Type() != js.TypeString {
			return nil, fmt.Errorf("input field names must be strings")
		}
		if _, ok := wanted[key.String()]; !ok {
			return nil, fmt.Errorf("unexpected field %q", key.String())
		}
		delete(wanted, key.String())
	}
	if len(wanted) != 0 {
		return nil, fmt.Errorf("input is missing required fields")
	}

	fields = make(map[string]js.Value, len(names))
	for _, name := range names {
		descriptor, err := reflectOwnDescriptor(value, name)
		if err != nil {
			return nil, err
		}
		if descriptor.IsNull() || descriptor.IsUndefined() || descriptor.Type() != js.TypeObject {
			return nil, fmt.Errorf("field %q must be an own data property", name)
		}
		if !js.Global().Get("Object").Call("hasOwn", descriptor, "value").Bool() {
			return nil, fmt.Errorf("field %q must be an own data property", name)
		}
		fields[name] = descriptor.Get("value")
	}
	return fields, nil
}

func reflectOwnKeys(value js.Value) (keys js.Value, err error) {
	defer func() {
		if recovered := recover(); recovered != nil {
			keys = js.Undefined()
			err = fmt.Errorf("input fields could not be read: %v", recovered)
		}
	}()
	return js.Global().Get("Reflect").Call("ownKeys", value), nil
}

func reflectOwnDescriptor(value js.Value, name string) (descriptor js.Value, err error) {
	defer func() {
		if recovered := recover(); recovered != nil {
			descriptor = js.Undefined()
			err = fmt.Errorf("field %q descriptor could not be read: %v", name, recovered)
		}
	}()
	return js.Global().Get("Reflect").Call("getOwnPropertyDescriptor", value, name), nil
}

func requiredJSString(fields map[string]js.Value, name string) (string, error) {
	field, ok := fields[name]
	if !ok {
		return "", fmt.Errorf("field %q is missing", name)
	}
	if field.Type() != js.TypeString {
		return "", fmt.Errorf("field %q must be a primitive string", name)
	}
	return field.String(), nil
}

func validJSUTF16(value js.Value) (valid bool) {
	defer func() {
		if recover() != nil {
			valid = false
		}
	}()
	// encodeURIComponent throws for unpaired UTF-16 surrogates and accepts
	// valid pairs, so no lossy JS-to-Go string conversion is needed to check.
	js.Global().Call("encodeURIComponent", value)
	return true
}

func toJS(value any) js.Value {
	encoded, err := json.Marshal(value)
	if err != nil {
		return errorResult(fmt.Sprintf("could not encode result: %v", err))
	}
	return js.Global().Get("JSON").Call("parse", string(encoded))
}

func errorResult(message string) js.Value {
	result := js.Global().Get("Object").New()
	result.Set("error", message)
	return result
}
