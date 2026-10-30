//go:build js && wasm

// Command godom-wasm publishes the Go-owned keyed DOM renderer bridge.
package main

import (
	"fmt"
	"math"
	"syscall/js"

	"github.com/samuelpmahan/gondola/godom"
)

const maxSafeInstanceID uint64 = 1<<53 - 1

var (
	// The Go callback table is fixed for the life of the WASM runtime. Each
	// renderer API gets JavaScript-bound wrappers carrying only its numeric ID.
	keepers       []js.Func
	sharedMethods = map[string]js.Func{}
	instances     = map[uint64]*rendererInstance{}
	mountingRoots []js.Value
	nextID        uint64 = 1
)

type rendererInstance struct {
	root     js.Value
	renderer *godom.Renderer
}

func main() {
	api := js.Global().Get("Object").New()
	mount := keep(js.FuncOf(func(this js.Value, args []js.Value) any {
		if err := exactArgs("mount", args, 2); err != nil {
			return errorResult(err)
		}
		return mountRenderer(args[0], args[1])
	}))
	api.Set("mount", mount)

	for _, method := range []string{"update", "snapshot", "domSnapshot", "click", "focusState", "restoreFocus", "unmount"} {
		name := method
		sharedMethods[name] = keep(js.FuncOf(func(this js.Value, args []js.Value) any {
			return dispatchInstanceMethod(name, args)
		}))
	}
	js.Global().Set("gobiGoDOM", api)
	select {}
}

// mountRenderer reserves the root before calling user facade code, since init()
// can re-enter the bridge. Duplicate roots are rejected before godom.New can
// invoke init or touch the existing DOM.
func mountRenderer(root, facade js.Value) (result any) {
	reserved := false
	defer func() {
		if reserved {
			releaseMountingRoot(root)
		}
	}()
	var renderer *godom.Renderer
	defer func() {
		if recovered := recover(); recovered != nil {
			if renderer != nil {
				func() {
					defer func() { _ = recover() }()
					_ = renderer.Unmount()
				}()
			}
			result = errorResult(fmt.Errorf("mount failed: %v", recovered))
		}
	}()
	if rootInUse(root) {
		return errorResult(fmt.Errorf("renderer root is already mounted"))
	}
	id, err := allocateInstanceID()
	if err != nil {
		return errorResult(err)
	}
	mountingRoots = append(mountingRoots, root)
	reserved = true

	renderer, err = godom.New(root, facade)
	if err != nil {
		return errorResult(err)
	}
	api := rendererAPI(id)
	instances[id] = &rendererInstance{root: root, renderer: renderer}
	return api
}

func rootInUse(root js.Value) bool {
	for _, instance := range instances {
		if instance.root.Equal(root) {
			return true
		}
	}
	for _, mountingRoot := range mountingRoots {
		if mountingRoot.Equal(root) {
			return true
		}
	}
	return false
}

func releaseMountingRoot(root js.Value) {
	for index := len(mountingRoots) - 1; index >= 0; index-- {
		if mountingRoots[index].Equal(root) {
			copy(mountingRoots[index:], mountingRoots[index+1:])
			last := len(mountingRoots) - 1
			mountingRoots[last] = js.Undefined()
			mountingRoots = mountingRoots[:last]
			return
		}
	}
}

func allocateInstanceID() (uint64, error) {
	if nextID == 0 || nextID > maxSafeInstanceID {
		return 0, fmt.Errorf("renderer instance ID space is exhausted")
	}
	id := nextID
	nextID++
	return id, nil
}

// rendererAPI gives every mount a distinct table of JavaScript bound
// functions. Binding adds a hidden ID argument to the shared Go dispatcher;
// the public method arity remains unchanged.
func rendererAPI(id uint64) js.Value {
	api := js.Global().Get("Object").New()
	for _, method := range []string{"update", "snapshot", "domSnapshot", "click", "focusState", "restoreFocus", "unmount"} {
		shared := sharedMethods[method]
		bound := shared.Value.Call("bind", js.Undefined(), js.ValueOf(float64(id)))
		api.Set(method, bound)
	}
	return api
}

func dispatchInstanceMethod(name string, args []js.Value) (result any) {
	defer func() {
		if recovered := recover(); recovered != nil {
			result = errorResult(fmt.Errorf("%s failed: %v", name, recovered))
		}
	}()
	if len(args) == 0 {
		return errorResult(fmt.Errorf("%s is missing its renderer handle", name))
	}
	id, err := parseInstanceID(args[0])
	if err != nil {
		return errorResult(err)
	}
	publicArgs := args[1:]
	want, ok := methodArity(name)
	if !ok {
		return errorResult(fmt.Errorf("unknown renderer method %q", name))
	}
	if err := exactArgs(name, publicArgs, want); err != nil {
		return errorResult(err)
	}
	instance, mounted := instances[id]
	if !mounted {
		if name == "unmount" {
			return js.Null()
		}
		return errorResult(fmt.Errorf("renderer handle is unmounted"))
	}

	var value any
	switch name {
	case "update":
		value, err = instance.renderer.Update(publicArgs[0])
	case "snapshot":
		value, err = instance.renderer.Snapshot()
	case "domSnapshot":
		value, err = instance.renderer.DOMSnapshot()
	case "click":
		value, err = instance.renderer.Click(publicArgs[0])
	case "focusState":
		value, err = instance.renderer.FocusState()
	case "restoreFocus":
		value, err = instance.renderer.RestoreFocus(publicArgs[0])
	case "unmount":
		// Delete the route before cleanup so re-entrant or stale calls see the
		// handle as closed even if DOM teardown invokes JavaScript. Keep the
		// root reserved until teardown finishes so a re-entrant mount cannot
		// create a renderer that this cleanup would then erase.
		delete(instances, id)
		mountingRoots = append(mountingRoots, instance.root)
		func() {
			defer releaseMountingRoot(instance.root)
			err = instance.renderer.Unmount()
		}()
		value = js.Null()
	}
	if err != nil {
		return errorResult(err)
	}
	return value
}

func parseInstanceID(value js.Value) (uint64, error) {
	if value.Type() != js.TypeNumber {
		return 0, fmt.Errorf("renderer handle ID must be a safe integer")
	}
	number := value.Float()
	if math.IsNaN(number) || math.IsInf(number, 0) || number < 1 || number > float64(maxSafeInstanceID) || math.Trunc(number) != number {
		return 0, fmt.Errorf("renderer handle ID must be a safe integer")
	}
	return uint64(number), nil
}

func methodArity(name string) (int, bool) {
	switch name {
	case "update", "click", "restoreFocus":
		return 1, true
	case "snapshot", "domSnapshot", "focusState", "unmount":
		return 0, true
	default:
		return 0, false
	}
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
