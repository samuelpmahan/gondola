//go:build !js || !wasm

package main

// Keep native `go test ./...` able to load the browser-only bridge package.
func main() {}
