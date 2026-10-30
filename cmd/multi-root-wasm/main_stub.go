//go:build !js || !wasm

package main

// Keep native `go test ./...` able to load the WASM bridge package.
func main() {}
