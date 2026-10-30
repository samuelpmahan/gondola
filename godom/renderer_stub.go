//go:build !js || !wasm

// Package godom contains the browser implementation in renderer_wasm.go.
package godom

// Renderer is an empty native placeholder so packages importing godom can be
// type-checked by native Go tooling. The DOM API is available only in WASM.
type Renderer struct{}
