package build

import "runtime"

func runtimeCaller(skip int) (pc uintptr, file string, line int, ok bool) {
	return runtime.Caller(skip + 1)
}
