package oracle

import (
	"fmt"
	"io"
	"net/http"
	"strings"

	"github.com/samuelpmahan/gondola/inertia"
	"github.com/samuelpmahan/gondola/wire"
)

// layersHandler is the side channel: the Node side asks Go to draw a component from props, and Go answers with the
// page's Node and one Node per layout (with a slot where the page goes). The Node side makes React components of them.
// Inertia is the golden reference for the protocol and for how layouts nest; Go owns the views.
func layersHandler(app *inertia.App) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { ServeLayers(app, w, r) })
}

// ServeLayers answers one layers request (see layersHandler); it is exported for the test of the real Inertia server.
func ServeLayers(app *inertia.App, w http.ResponseWriter, r *http.Request) {
	defer func() {
		if recovered := recover(); recovered != nil {
			http.Error(w, fmt.Sprint("a view panicked: ", recovered), http.StatusInternalServerError)
		}
	}()
	data, err := io.ReadAll(r.Body)
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	decoded, err := wire.DecodeValue(data) // not encoding/json: it would turn a lone surrogate into U+FFFD
	request, _ := decoded.(map[string]any)
	if err != nil || request == nil {
		http.Error(w, "unreadable request", http.StatusBadRequest)
		return
	}
	component, _ := request["component"].(string)
	props, _ := request["props"].(map[string]any)
	layers, err := app.Layers(component, props)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	var b strings.Builder
	b.WriteString(`{"page":` + wire.Canonical(layers.Page) + `,"names":[`)
	for i, name := range layers.Names {
		if i > 0 {
			b.WriteByte(',')
		}
		b.WriteString(wire.Quote(name))
	}
	b.WriteString(`],"layouts":[`)
	for i, layout := range layers.Layouts {
		if i > 0 {
			b.WriteByte(',')
		}
		b.WriteString(wire.Canonical(layout))
	}
	b.WriteString(`]}`)
	w.Header().Set("Content-Type", "application/json")
	w.Write([]byte(b.String()))
}
