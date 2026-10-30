//go:build js && wasm

// Command multi-root-wasm exposes the Go-owned multisession registry and the
// existing strict HTTP wire codec through the gobiMultiRoot browser global.
package main

import (
	"encoding/json"
	"fmt"
	"math"
	"syscall/js"

	"github.com/samuelpmahan/gondola/asyncsave"
	"github.com/samuelpmahan/gondola/collection"
	"github.com/samuelpmahan/gondola/httpwire"
	"github.com/samuelpmahan/gondola/multisession"
)

var (
	manager *multisession.Manager
	keepers []js.Func
)

func main() {
	manager = multisession.NewManager()
	api := js.Global().Get("Object").New()
	api.Set("create", method("create", 0, func(args []js.Value) any {
		id, err := manager.Create()
		if err != nil {
			return errorResult(err.Error())
		}
		return float64(id)
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
	api.Set("list", method("list", 0, func(args []js.Value) any {
		ids := manager.List()
		if ids == nil {
			ids = []multisession.SessionID{}
		}
		return toJS(ids)
	}))
	api.Set("encodeHTTP", method("encodeHTTP", 2, func(args []js.Value) any {
		id, err := safeJSID(args[0])
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
		id, err := safeJSID(args[0])
		if err != nil {
			return errorResult(err.Error())
		}
		status, err := httpStatus(args[1])
		if err != nil {
			return errorResult(err.Error())
		}
		if args[2].Type() != js.TypeString {
			return errorResult("decodeHTTP body must be a primitive string")
		}
		return toJS(httpwire.DecodeResponse(id, status, []byte(args[2].String())))
	}))
	js.Global().Set("gobiMultiRoot", api)
	select {}
}

func method(name string, arity int, operation func([]js.Value) any) js.Func {
	return keep(js.FuncOf(func(this js.Value, args []js.Value) (result any) {
		if err := exactArgs(name, args, arity); err != nil {
			return errorResult(err.Error())
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

func exactArgs(name string, args []js.Value, want int) error {
	if len(args) != want {
		return fmt.Errorf("%s requires exactly %d argument(s), got %d", name, want, len(args))
	}
	return nil
}

func decodeSessionID(value js.Value) (multisession.SessionID, error) {
	if value.Type() != js.TypeNumber {
		return 0, fmt.Errorf("session ID must be a primitive integer number")
	}
	return sessionIDFromNumber(value.Float())
}

func safeJSID(value js.Value) (uint64, error) {
	number, err := safeJSInteger(value, 1, float64(asyncsave.MaxID), "ID")
	if err != nil {
		return 0, err
	}
	return uint64(number), nil
}

func httpStatus(value js.Value) (int, error) {
	number, err := safeJSInteger(value, 100, 599, "status")
	if err != nil {
		return 0, err
	}
	return int(number), nil
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
	defer func() {
		if recovered := recover(); recovered != nil {
			step = collection.Step{}
			err = fmt.Errorf("input fields could not be read: %v", recovered)
		}
	}()
	if err := exactObjectKeys(value, "Path", "Event", "Value", "Key"); err != nil {
		return collection.Step{}, err
	}
	path, err := requiredJSString(value, "Path")
	if err != nil {
		return collection.Step{}, err
	}
	event, err := requiredJSString(value, "Event")
	if err != nil {
		return collection.Step{}, err
	}
	input, err := requiredJSString(value, "Value")
	if err != nil {
		return collection.Step{}, err
	}
	key, err := requiredJSString(value, "Key")
	if err != nil {
		return collection.Step{}, err
	}
	return collection.Step{Path: path, Event: event, Value: input, Key: key}, nil
}

func decodeReply(value js.Value) (reply asyncsave.Reply, err error) {
	defer func() {
		if recovered := recover(); recovered != nil {
			reply = asyncsave.Reply{}
			err = fmt.Errorf("input fields could not be read: %v", recovered)
		}
	}()
	if err := exactObjectKeys(value, "ID", "Value", "Error"); err != nil {
		return asyncsave.Reply{}, err
	}
	jsID, err := safeGet(value, "ID")
	if err != nil {
		return asyncsave.Reply{}, err
	}
	id, err := safeJSID(jsID)
	if err != nil {
		return asyncsave.Reply{}, err
	}
	answer, err := requiredJSString(value, "Value")
	if err != nil {
		return asyncsave.Reply{}, err
	}
	message, err := requiredJSString(value, "Error")
	if err != nil {
		return asyncsave.Reply{}, err
	}
	return asyncsave.Reply{ID: id, Value: answer, Error: message}, nil
}

func exactObjectKeys(value js.Value, names ...string) error {
	if value.IsNull() || value.IsUndefined() || value.Type() != js.TypeObject {
		return fmt.Errorf("input must be an object")
	}
	keys, err := reflectOwnKeys(value)
	if err != nil {
		return err
	}
	if keys.Length() != len(names) {
		return fmt.Errorf("input must contain exactly %d own field(s)", len(names))
	}
	wanted := make(map[string]struct{}, len(names))
	for _, name := range names {
		wanted[name] = struct{}{}
	}
	for index := 0; index < keys.Length(); index++ {
		key := keys.Index(index)
		if key.Type() != js.TypeString {
			return fmt.Errorf("input field names must be strings")
		}
		if _, ok := wanted[key.String()]; !ok {
			return fmt.Errorf("unexpected field %q", key.String())
		}
		delete(wanted, key.String())
	}
	if len(wanted) != 0 {
		return fmt.Errorf("input is missing required fields")
	}
	return nil
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

func requiredJSString(value js.Value, name string) (string, error) {
	field, err := safeGet(value, name)
	if err != nil {
		return "", err
	}
	if field.Type() != js.TypeString {
		return "", fmt.Errorf("field %q must be a primitive string", name)
	}
	return field.String(), nil
}

func safeGet(value js.Value, name string) (field js.Value, err error) {
	defer func() {
		if recovered := recover(); recovered != nil {
			field = js.Undefined()
			err = fmt.Errorf("field %q could not be read: %v", name, recovered)
		}
	}()
	return js.Global().Get("Reflect").Call("get", value, name), nil
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
