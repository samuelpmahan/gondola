//go:build !js || !wasm

package main

// This stub keeps native `go test ./...` able to load the wasm command package.
func main() {}
