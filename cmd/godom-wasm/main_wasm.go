//go:build js && wasm

// Command godom-wasm publishes the Go-owned keyed DOM renderer bridge.
package main

import (
	"fmt"
	"syscall/js"

	"github.com/samuelpmahan/gondola/godom"
)

var keepers []js.Func

func main() {
	api := js.Global().Get("Object").New()
	api.Set("mount", keep(js.FuncOf(func(this js.Value, args []js.Value) any {
		if err := exactArgs("mount", args, 2); err != nil {
			return errorResult(err)
		}
		renderer, err := godom.New(args[0], args[1])
		if err != nil {
			return errorResult(err)
		}
		return rendererAPI(renderer)
	})))
	js.Global().Set("gobiGoDOM", api)
	select {}
}

// rendererAPI gives each mount its own method table and closed-over renderer.
// The per-handle mounted flag makes unmount idempotent and stale calls local.
func rendererAPI(renderer *godom.Renderer) js.Value {
	api := js.Global().Get("Object").New()
	mounted := true
	api.Set("update", instanceMethod("update", 1, &mounted, func(args []js.Value) (any, error) {
		return renderer.Update(args[0])
	}))
	api.Set("snapshot", instanceMethod("snapshot", 0, &mounted, func(args []js.Value) (any, error) {
		return renderer.Snapshot()
	}))
	api.Set("domSnapshot", instanceMethod("domSnapshot", 0, &mounted, func(args []js.Value) (any, error) {
		return renderer.DOMSnapshot()
	}))
	api.Set("click", instanceMethod("click", 1, &mounted, func(args []js.Value) (any, error) {
		return renderer.Click(args[0])
	}))
	api.Set("focusState", instanceMethod("focusState", 0, &mounted, func(args []js.Value) (any, error) {
		return renderer.FocusState()
	}))
	api.Set("restoreFocus", instanceMethod("restoreFocus", 1, &mounted, func(args []js.Value) (any, error) {
		return renderer.RestoreFocus(args[0])
	}))
	api.Set("unmount", instanceMethod("unmount", 0, &mounted, func(args []js.Value) (any, error) {
		// Mark this handle inactive before cleanup so callbacks cannot re-enter it.
		mounted = false
		current := renderer
		renderer = nil
		return js.Null(), current.Unmount()
	}))
	return api
}

func instanceMethod(name string, want int, mounted *bool, call func([]js.Value) (any, error)) js.Func {
	return keep(js.FuncOf(func(this js.Value, args []js.Value) any {
		if err := exactArgs(name, args, want); err != nil {
			return errorResult(err)
		}
		if !*mounted {
			if name == "unmount" {
				return js.Null()
			}
			return errorResult(fmt.Errorf("renderer handle is unmounted"))
		}
		result, err := call(args)
		if err != nil {
			return errorResult(err)
		}
		return result
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

func errorResult(err error) any {
	result := js.Global().Get("Object").New()
	result.Set("error", err.Error())
	return result
}
