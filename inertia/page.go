package inertia

import (
	"fmt"
	"net/http"
	"strings"

	"github.com/samuelpmahan/gondola/gobi"
)

// Slot is the tag of the Node a Layout is given in place of the page when a layer is drawn on its own (see Layers).
const Slot = "gobi-slot"

// resolve works out the props of one answer, as plain JSON data: shared props and the page's own (the page wins on a
// key clash), errors always present, and on a partial reload only the props the request asks for.
func (a *App) resolve(r *http.Request, inertiaVisit bool, component string, props Props) (map[string]any, error) {
	all := map[string]any{}
	a.mu.RLock()
	for key, value := range a.shared {
		all[key] = value
	}
	a.mu.RUnlock()
	for key, value := range props {
		all[key] = value
	}
	if _, ok := all["errors"]; !ok {
		all["errors"] = map[string]any{}
	}
	partial := inertiaVisit && r.Header.Get("X-Inertia-Partial-Component") == component
	only, except := headerList(r, "X-Inertia-Partial-Data"), headerList(r, "X-Inertia-Partial-Except")
	out := make(map[string]any, len(all))
	for key, value := range all {
		include := false
		switch v := value.(type) {
		case Always:
			include, value = true, v.Value
		case Optional:
			include = partial && only[key] && !except[key]
			if include && v.Compute != nil {
				value = v.Compute()
			} else {
				value = nil
			}
		default:
			include = !partial || ((len(only) == 0 || only[key]) && !except[key])
		}
		if key == "errors" {
			include = true // errors is an Always prop
		}
		if !include {
			continue
		}
		n, err := normalize(value)
		if err != nil {
			return nil, fmt.Errorf("prop %q: %w", key, err)
		}
		out[key] = n
	}
	return out, nil
}

// headerList reads a comma separated header such as X-Inertia-Partial-Data into a set.
func headerList(r *http.Request, name string) map[string]bool {
	set := map[string]bool{}
	for _, item := range strings.Split(r.Header.Get(name), ",") {
		if item = strings.TrimSpace(item); item != "" {
			set[item] = true
		}
	}
	return set
}

// writePage writes the page object: component, props, url, version, in that order.
func writePage(b *strings.Builder, component string, props map[string]any, url, version string) {
	b.WriteString(`{"component":`)
	writeString(b, component)
	b.WriteString(`,"props":`)
	writeJSON(b, props)
	b.WriteString(`,"url":`)
	writeString(b, url)
	b.WriteString(`,"version":`)
	writeString(b, version)
	b.WriteByte('}')
}

// document wraps the page object and the drawn page in the HTML shell. Inside the body the script and the root element
// are exactly what Inertia's server-side rendering writes: data-server-rendered tells the browser the markup is there to
// be hydrated.
func document(pageJSON, html string) string {
	return "<!DOCTYPE html>\n<html>\n<head>\n<meta charset=\"utf-8\">\n<meta name=\"viewport\" content=\"width=device-width, initial-scale=1\">\n</head>\n<body>\n" +
		body(pageJSON, html) + "\n</body>\n</html>\n"
}

func body(pageJSON, html string) string {
	return `<script data-page="app" type="application/json">` + pageJSON + `</script><div data-server-rendered="true" id="app">` + html + `</div>`
}

// Layers is a page drawn one layer at a time: the page's own Node, and each layout's Node with a Slot element where
// the page goes. Names lists the layouts, outermost first. The oracle gives each layer to Inertia as a React component.
type Layers struct {
	Page    gobi.Node
	Names   []string
	Layouts []gobi.Node
}

// Layers draws component from props (the props of a page object) one layer at a time.
func (a *App) Layers(component string, props map[string]any) (Layers, error) {
	n, err := normalize(props)
	if err != nil {
		return Layers{}, err
	}
	resolved := n.(map[string]any)
	a.mu.RLock()
	defer a.mu.RUnlock()
	entry, layouts, err := a.lookup(component)
	if err != nil {
		return Layers{}, err
	}
	layers := Layers{Page: entry.view(Props(resolved)), Names: entry.layouts}
	for _, layout := range layouts {
		layers.Layouts = append(layers.Layouts, layout(Props(resolved), gobi.El(Slot)))
	}
	return layers, nil
}

// draw draws the whole page: the page's Node wrapped by its layouts, innermost first.
func (a *App) draw(component string, props map[string]any) (gobi.Node, error) {
	a.mu.RLock()
	defer a.mu.RUnlock()
	entry, layouts, err := a.lookup(component)
	if err != nil {
		return gobi.Node{}, err
	}
	node := entry.view(Props(props))
	for i := len(layouts) - 1; i >= 0; i-- {
		node = layouts[i](Props(props), node)
	}
	return node, nil
}

// lookup finds a registered page and its layouts, outermost first. The caller holds the lock.
func (a *App) lookup(component string) (pageEntry, []Layout, error) {
	entry, ok := a.pages[component]
	if !ok {
		return pageEntry{}, nil, fmt.Errorf("inertia: component %q is not registered with App.Page", component)
	}
	var layouts []Layout
	for _, name := range entry.layouts {
		layout, ok := a.layouts[name]
		if !ok {
			return pageEntry{}, nil, fmt.Errorf("inertia: layout %q (of component %q) is not registered with App.Layout", name, component)
		}
		layouts = append(layouts, layout)
	}
	return entry, layouts, nil
}
