//go:build js && wasm

package main

import (
	"encoding/json"
	"fmt"
	"syscall/js"

	"github.com/samuelpmahan/gondola/gobi"
	"github.com/samuelpmahan/gondola/interaction"
)

var (
	session *interaction.Session
	keepers []js.Func
)

func main() {
	session = interaction.New()
	api := js.Global().Get("Object").New()
	initFunc := js.FuncOf(func(this js.Value, args []js.Value) any {
		session = interaction.New()
		return toJS(session.Snapshot())
	})
	dispatchFunc := js.FuncOf(func(this js.Value, args []js.Value) any {
		if len(args) == 0 || args[0].IsNull() || args[0].IsUndefined() {
			return errorResult("dispatch requires a step object")
		}
		var step gobi.Step
		encoded := js.Global().Get("JSON").Call("stringify", args[0]).String()
		if err := json.Unmarshal([]byte(encoded), &step); err != nil {
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
	js.Global().Set("gobiCounter", api)
	select {}
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
