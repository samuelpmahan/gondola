//go:build js && wasm

package main

import (
	"encoding/json"
	"fmt"
	"syscall/js"

	"github.com/samuelpmahan/gondola/asyncsave"
	"github.com/samuelpmahan/gondola/gobi"
)

var (
	session *asyncsave.Session
	keepers []js.Func
)

func main() {
	session = asyncsave.NewSession()
	api := js.Global().Get("Object").New()
	api.Set("init", keep(js.FuncOf(func(this js.Value, args []js.Value) any {
		session = asyncsave.NewSession()
		return toJS(session.Snapshot())
	})))
	api.Set("dispatch", keep(js.FuncOf(func(this js.Value, args []js.Value) any {
		if len(args) == 0 {
			return errorResult("dispatch requires a step object")
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
		if len(args) == 0 {
			return errorResult("complete requires a reply object")
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
		return toJS(session.Effects())
	})))
	api.Set("audit", keep(js.FuncOf(func(this js.Value, args []js.Value) any {
		return toJS(session.Audit())
	})))
	js.Global().Set("gobiAsyncSave", api)
	select {}
}

func keep(fn js.Func) js.Func {
	keepers = append(keepers, fn)
	return fn
}

func inputJSON(value js.Value) (encoded string, err error) {
	defer func() {
		if recovered := recover(); recovered != nil {
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

func validateJSFieldTypes(value js.Value, expected map[string]js.Type) (err error) {
	defer func() {
		if recovered := recover(); recovered != nil {
			err = fmt.Errorf("input fields could not be read: %v", recovered)
		}
	}()
	if value.IsNull() || value.IsUndefined() || value.Type() != js.TypeObject {
		return fmt.Errorf("input must be a JSON object")
	}
	for name, want := range expected {
		actual := value.Get(name)
		if actual.Type() != want {
			return fmt.Errorf("field %q has JavaScript type %s; expected %s", name, actual.Type(), want)
		}
	}
	return nil
}

func decodeStep(value js.Value) (gobi.Step, error) {
	if err := validateJSFieldTypes(value, map[string]js.Type{
		"Path": js.TypeString, "Event": js.TypeString, "Value": js.TypeString,
	}); err != nil {
		return gobi.Step{}, err
	}
	encoded, err := inputJSON(value)
	if err != nil {
		return gobi.Step{}, err
	}
	fields, err := objectFields(encoded, "Path", "Event", "Value")
	if err != nil {
		return gobi.Step{}, err
	}
	path, err := requiredString(fields, "Path")
	if err != nil {
		return gobi.Step{}, err
	}
	event, err := requiredString(fields, "Event")
	if err != nil {
		return gobi.Step{}, err
	}
	input, err := requiredString(fields, "Value")
	if err != nil {
		return gobi.Step{}, err
	}
	return gobi.Step{Path: path, Event: event, Value: input}, nil
}

func decodeReply(value js.Value) (asyncsave.Reply, error) {
	if err := validateJSFieldTypes(value, map[string]js.Type{
		"ID": js.TypeNumber, "Value": js.TypeString, "Error": js.TypeString,
	}); err != nil {
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
	rawID := fields["ID"]
	if len(rawID) == 0 || rawID[0] < '0' || rawID[0] > '9' {
		return asyncsave.Reply{}, fmt.Errorf("field %q must be a positive safe integer", "ID")
	}
	var id uint64
	if err := json.Unmarshal(rawID, &id); err != nil {
		return asyncsave.Reply{}, fmt.Errorf("field %q must be a positive safe integer: %w", "ID", err)
	}
	if id == 0 || id > asyncsave.MaxID {
		return asyncsave.Reply{}, fmt.Errorf("field %q must be in the safe integer range 1..%d", "ID", asyncsave.MaxID)
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
