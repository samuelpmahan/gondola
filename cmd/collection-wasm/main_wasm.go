//go:build js && wasm

// Command collection-wasm exposes the keyed collection session and the
// existing strict HTTP wire codec through the isolated gobiCollection global.
package main

import (
	"encoding/json"
	"fmt"
	"math"
	"strconv"
	"syscall/js"

	"github.com/samuelpmahan/gondola/asyncsave"
	"github.com/samuelpmahan/gondola/collection"
	"github.com/samuelpmahan/gondola/httpwire"
)

var (
	session *collection.Session
	keepers []js.Func
)

func main() {
	session = collection.NewSession()
	api := js.Global().Get("Object").New()
	api.Set("init", keep(js.FuncOf(func(this js.Value, args []js.Value) any {
		if err := exactArgs("init", args, 0); err != nil {
			return errorResult(err.Error())
		}
		session = collection.NewSession()
		return toJS(session.Snapshot())
	})))
	api.Set("snapshot", keep(js.FuncOf(func(this js.Value, args []js.Value) any {
		if err := exactArgs("snapshot", args, 0); err != nil {
			return errorResult(err.Error())
		}
		return toJS(session.Snapshot())
	})))
	api.Set("dispatch", keep(js.FuncOf(func(this js.Value, args []js.Value) any {
		if err := exactArgs("dispatch", args, 1); err != nil {
			return errorResult(err.Error())
		}
		step, err := decodeStep(args[0])
		if err != nil {
			return errorResult(fmt.Sprintf("invalid step: %v", err))
		}
		snapshot, err := session.Dispatch(step)
		if err != nil {
			return errorResult(err.Error())
		}
		return toJS(snapshot)
	})))
	api.Set("complete", keep(js.FuncOf(func(this js.Value, args []js.Value) any {
		if err := exactArgs("complete", args, 1); err != nil {
			return errorResult(err.Error())
		}
		reply, err := decodeReply(args[0])
		if err != nil {
			return errorResult(fmt.Sprintf("invalid reply: %v", err))
		}
		snapshot, err := session.Complete(reply)
		if err != nil {
			return errorResult(err.Error())
		}
		return toJS(snapshot)
	})))
	api.Set("effects", keep(js.FuncOf(func(this js.Value, args []js.Value) any {
		if err := exactArgs("effects", args, 0); err != nil {
			return errorResult(err.Error())
		}
		return toJS(session.Effects())
	})))
	api.Set("audit", keep(js.FuncOf(func(this js.Value, args []js.Value) any {
		if err := exactArgs("audit", args, 0); err != nil {
			return errorResult(err.Error())
		}
		return toJS(session.Audit())
	})))
	api.Set("encodeHTTP", keep(js.FuncOf(func(this js.Value, args []js.Value) any {
		if err := exactArgs("encodeHTTP", args, 2); err != nil {
			return errorResult(err.Error())
		}
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
	})))
	api.Set("decodeHTTP", keep(js.FuncOf(func(this js.Value, args []js.Value) any {
		if err := exactArgs("decodeHTTP", args, 3); err != nil {
			return errorResult(err.Error())
		}
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
	})))
	js.Global().Set("gobiCollection", api)
	select {}
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

func inputJSON(value js.Value) (encoded string, err error) {
	defer func() {
		if recovered := recover(); recovered != nil {
			encoded = ""
			err = fmt.Errorf("input is not JSON-serializable: %v", recovered)
		}
	}()
	if value.IsNull() || value.IsUndefined() {
		return "", fmt.Errorf("input must be a JSON object")
	}
	result := js.Global().Get("JSON").Call("stringify", value)
	if result.Type() != js.TypeString {
		return "", fmt.Errorf("input is not JSON-serializable")
	}
	return result.String(), nil
}

// safeGet uses Reflect.get behind a recover boundary so throwing getters and
// proxies become ordinary bridge errors rather than terminating the WASM host.
func safeGet(value js.Value, name string) (field js.Value, err error) {
	defer func() {
		if recovered := recover(); recovered != nil {
			field = js.Undefined()
			err = fmt.Errorf("field %q could not be read: %v", name, recovered)
		}
	}()
	return js.Global().Get("Reflect").Call("get", value, name), nil
}

func objectFields(encoded string, names ...string) (map[string]json.RawMessage, error) {
	var fields map[string]json.RawMessage
	if err := json.Unmarshal([]byte(encoded), &fields); err != nil {
		return nil, err
	}
	if fields == nil {
		return nil, fmt.Errorf("input must be a JSON object")
	}
	allowed := make(map[string]struct{}, len(names))
	for _, name := range names {
		allowed[name] = struct{}{}
	}
	for name := range fields {
		if _, ok := allowed[name]; !ok {
			return nil, fmt.Errorf("unexpected field %q", name)
		}
	}
	for _, name := range names {
		if _, ok := fields[name]; !ok {
			return nil, fmt.Errorf("missing field %q", name)
		}
	}
	return fields, nil
}

func requiredString(fields map[string]json.RawMessage, name string) (string, error) {
	raw := fields[name]
	if len(raw) == 0 || raw[0] != '"' {
		return "", fmt.Errorf("field %q must be a string", name)
	}
	var value string
	if err := json.Unmarshal(raw, &value); err != nil {
		return "", fmt.Errorf("field %q must be a string: %w", name, err)
	}
	return value, nil
}

func decodeStep(value js.Value) (step collection.Step, err error) {
	defer func() {
		if recovered := recover(); recovered != nil {
			step = collection.Step{}
			err = fmt.Errorf("input fields could not be read: %v", recovered)
		}
	}()
	return decodeStepStrict(value)
}

func decodeStepStrict(value js.Value) (collection.Step, error) {
	if value.IsNull() || value.IsUndefined() || value.Type() != js.TypeObject {
		return collection.Step{}, fmt.Errorf("input must be an object")
	}
	for _, name := range []string{"Path", "Event", "Value", "Key"} {
		field, err := safeGet(value, name)
		if err != nil {
			return collection.Step{}, err
		}
		if field.Type() != js.TypeString {
			return collection.Step{}, fmt.Errorf("field %q must be a primitive string", name)
		}
	}
	encoded, err := inputJSON(value)
	if err != nil {
		return collection.Step{}, err
	}
	fields, err := objectFields(encoded, "Path", "Event", "Value", "Key")
	if err != nil {
		return collection.Step{}, err
	}
	path, err := requiredString(fields, "Path")
	if err != nil {
		return collection.Step{}, err
	}
	event, err := requiredString(fields, "Event")
	if err != nil {
		return collection.Step{}, err
	}
	input, err := requiredString(fields, "Value")
	if err != nil {
		return collection.Step{}, err
	}
	key, err := requiredString(fields, "Key")
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
	return decodeReplyStrict(value)
}

func decodeReplyStrict(value js.Value) (asyncsave.Reply, error) {
	if value.IsNull() || value.IsUndefined() || value.Type() != js.TypeObject {
		return asyncsave.Reply{}, fmt.Errorf("input must be an object")
	}
	jsID, err := safeGet(value, "ID")
	if err != nil {
		return asyncsave.Reply{}, err
	}
	jsValue, err := safeGet(value, "Value")
	if err != nil {
		return asyncsave.Reply{}, err
	}
	jsError, err := safeGet(value, "Error")
	if err != nil {
		return asyncsave.Reply{}, err
	}
	if jsValue.Type() != js.TypeString || jsError.Type() != js.TypeString {
		return asyncsave.Reply{}, fmt.Errorf("Value and Error must be primitive strings")
	}
	id, err := safeJSID(jsID)
	if err != nil {
		return asyncsave.Reply{}, err
	}
	encoded, err := inputJSON(value)
	if err != nil {
		return asyncsave.Reply{}, err
	}
	fields, err := objectFields(encoded, "ID", "Value", "Error")
	if err != nil {
		return asyncsave.Reply{}, err
	}
	parsedID, err := parseJSONID(fields["ID"])
	if err != nil {
		return asyncsave.Reply{}, err
	}
	if parsedID != id {
		return asyncsave.Reply{}, fmt.Errorf("field %q changed during input decoding", "ID")
	}
	answer, err := requiredString(fields, "Value")
	if err != nil {
		return asyncsave.Reply{}, err
	}
	message, err := requiredString(fields, "Error")
	if err != nil {
		return asyncsave.Reply{}, err
	}
	return asyncsave.Reply{ID: id, Value: answer, Error: message}, nil
}

func parseJSONID(raw json.RawMessage) (uint64, error) {
	if len(raw) == 0 || raw[0] < '0' || raw[0] > '9' {
		return 0, fmt.Errorf("field %q must be a positive safe integer", "ID")
	}
	id, err := strconv.ParseUint(string(raw), 10, 64)
	if err != nil || id == 0 || id > asyncsave.MaxID || strconv.FormatUint(id, 10) != string(raw) {
		return 0, fmt.Errorf("field %q must be a positive safe integer", "ID")
	}
	return id, nil
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
