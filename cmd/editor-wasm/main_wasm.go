//go:build js && wasm

package main

import (
	"encoding/json"
	"fmt"
	"syscall/js"

	"github.com/samuelpmahan/gondola/editor"
	"github.com/samuelpmahan/gondola/gobi"
)

var (
	session *editor.Session
	keepers []js.Func
)

func main() {
	session = editor.NewSession()
	api := js.Global().Get("Object").New()
	initFunc := js.FuncOf(func(this js.Value, args []js.Value) any {
		session = editor.NewSession()
		return toJS(session.Snapshot())
	})
	dispatchFunc := js.FuncOf(func(this js.Value, args []js.Value) any {
		if len(args) == 0 || args[0].IsNull() || args[0].IsUndefined() {
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
	})
	keepers = append(keepers, initFunc, dispatchFunc)
	api.Set("init", initFunc)
	api.Set("dispatch", dispatchFunc)
	js.Global().Set("gobiEditor", api)
	select {}
}

func decodeStep(value js.Value) (step gobi.Step, err error) {
	defer func() {
		if recovered := recover(); recovered != nil {
			err = fmt.Errorf("step is not JSON-serializable: %v", recovered)
		}
	}()
	encodedValue := js.Global().Get("JSON").Call("stringify", value)
	if encodedValue.Type() != js.TypeString {
		return gobi.Step{}, fmt.Errorf("step is not JSON-serializable")
	}
	if err := json.Unmarshal([]byte(encodedValue.String()), &step); err != nil {
		return gobi.Step{}, err
	}
	return step, nil
}

func toJS(value any) js.Value {
	encoded, err := json.Marshal(value)
	if err != nil {
		return errorResult(fmt.Sprintf("could not encode snapshot: %v", err))
	}
	return js.Global().Get("JSON").Call("parse", string(encoded))
}

func errorResult(message string) js.Value {
	encoded, _ := json.Marshal(map[string]string{"error": message})
	return js.Global().Get("JSON").Call("parse", string(encoded))
}
