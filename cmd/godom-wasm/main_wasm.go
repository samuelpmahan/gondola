//go:build js && wasm

// Command godom-wasm publishes the Go-owned keyed DOM renderer bridge.
package main

import (
	"fmt"
	"syscall/js"

	"github.com/samuelpmahan/gondola/godom"
)

var (
	active  *godom.Renderer
	keepers []js.Func
)

func main() {
	api := js.Global().Get("Object").New()
	api.Set("mount", keep(js.FuncOf(func(this js.Value, args []js.Value) any {
		if err := exactArgs("mount", args, 2); err != nil {
			return errorResult(err)
		}
		if active != nil {
			return errorResult(fmt.Errorf("mount requires the previous renderer to be unmounted"))
		}
		renderer, err := godom.New(args[0], args[1])
		if err != nil {
			return errorResult(err)
		}
		active = renderer
		return js.Null()
	})))
	api.Set("update", keep(js.FuncOf(func(this js.Value, args []js.Value) any {
		if err := exactArgs("update", args, 1); err != nil {
			return errorResult(err)
		}
		renderer, err := mounted()
		if err != nil {
			return errorResult(err)
		}
		result, err := renderer.Update(args[0])
		if err != nil {
			return errorResult(err)
		}
		return result
	})))
	api.Set("snapshot", keep(js.FuncOf(func(this js.Value, args []js.Value) any {
		if err := exactArgs("snapshot", args, 0); err != nil {
			return errorResult(err)
		}
		renderer, err := mounted()
		if err != nil {
			return errorResult(err)
		}
		result, err := renderer.Snapshot()
		if err != nil {
			return errorResult(err)
		}
		return result
	})))
	api.Set("domSnapshot", keep(js.FuncOf(func(this js.Value, args []js.Value) any {
		if err := exactArgs("domSnapshot", args, 0); err != nil {
			return errorResult(err)
		}
		renderer, err := mounted()
		if err != nil {
			return errorResult(err)
		}
		result, err := renderer.DOMSnapshot()
		if err != nil {
			return errorResult(err)
		}
		return result
	})))
	api.Set("click", keep(js.FuncOf(func(this js.Value, args []js.Value) any {
		if err := exactArgs("click", args, 1); err != nil {
			return errorResult(err)
		}
		renderer, err := mounted()
		if err != nil {
			return errorResult(err)
		}
		result, err := renderer.Click(args[0])
		if err != nil {
			return errorResult(err)
		}
		return result
	})))
	api.Set("focusState", keep(js.FuncOf(func(this js.Value, args []js.Value) any {
		if err := exactArgs("focusState", args, 0); err != nil {
			return errorResult(err)
		}
		renderer, err := mounted()
		if err != nil {
			return errorResult(err)
		}
		result, err := renderer.FocusState()
		if err != nil {
			return errorResult(err)
		}
		return result
	})))
	api.Set("restoreFocus", keep(js.FuncOf(func(this js.Value, args []js.Value) any {
		if err := exactArgs("restoreFocus", args, 1); err != nil {
			return errorResult(err)
		}
		renderer, err := mounted()
		if err != nil {
			return errorResult(err)
		}
		result, err := renderer.RestoreFocus(args[0])
		if err != nil {
			return errorResult(err)
		}
		return result
	})))
	api.Set("unmount", keep(js.FuncOf(func(this js.Value, args []js.Value) any {
		if err := exactArgs("unmount", args, 0); err != nil {
			return errorResult(err)
		}
		if active == nil {
			return js.Null()
		}
		renderer := active
		active = nil
		if err := renderer.Unmount(); err != nil {
			return errorResult(err)
		}
		return js.Null()
	})))
	js.Global().Set("gobiGoDOM", api)
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

func mounted() (*godom.Renderer, error) {
	if active == nil {
		return nil, fmt.Errorf("renderer is not mounted")
	}
	return active, nil
}

func errorResult(err error) any {
	result := js.Global().Get("Object").New()
	result.Set("error", err.Error())
	return result
}
