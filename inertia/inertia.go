// Package inertia is a Go server for the Inertia protocol (inertiajs.com/the-protocol, version 3). Pages are Gobi
// components named by component; the server owns routing and data, and the front end is a swappable renderer.
//
// This file is the Milestone 1 contract. The maker owns everything behind it; changing a signature here is an
// escalation (see asks/README.md), because the three users write their checks against it.
package inertia

import (
	"net/http"
	"net/url"
	"strings"
	"sync"

	"github.com/samuelpmahan/gondola/gobi"
)

// Props are a page's props. A value is plain JSON data (string, float64, bool, nil, []any, map[string]any) or one of
// the prop kinds below, which decide when the value is computed.
type Props map[string]any

// Optional is computed only on a partial reload that names it in only (Inertia's "optional" or "lazy" prop).
type Optional struct{ Compute func() any }

// Always is sent even on a partial reload that leaves it out (Inertia's "always" prop).
type Always struct{ Value any }

// Page is the page object, exactly as it travels in the data-page script and in X-Inertia responses.
type Page struct {
	Component string         `json:"component"`
	Props     map[string]any `json:"props"`
	URL       string         `json:"url"`
	Version   string         `json:"version"`
}

// View draws a page from its resolved props. Layout draws a shared layout around the page it is given.
type View func(props Props) gobi.Node
type Layout func(props Props, page gobi.Node) gobi.Node

// App holds the registered pages, layouts, shared props and the asset version.
type App struct {
	version string
	mu      sync.RWMutex
	pages   map[string]pageEntry
	layouts map[string]Layout
	shared  map[string]any
}

// pageEntry is a registered page: how it is drawn and the names of its layouts, outermost first.
type pageEntry struct {
	view    View
	layouts []string
}

// New starts an App whose asset version is version.
func New(version string) *App {
	return &App{version: version, pages: map[string]pageEntry{}, layouts: map[string]Layout{}, shared: map[string]any{}}
}

// Page registers a component by name, with the names of the layouts that wrap it, outermost first.
func (a *App) Page(component string, view View, layouts ...string) {
	a.mu.Lock()
	defer a.mu.Unlock()
	a.pages[component] = pageEntry{view: view, layouts: append([]string(nil), layouts...)}
}

// Layout registers a shared layout by name.
func (a *App) Layout(name string, layout Layout) {
	a.mu.Lock()
	defer a.mu.Unlock()
	a.layouts[name] = layout
}

// Share adds a prop sent with every page (for example the signed-in user or a flash message). A prop of the page
// itself with the same key wins over the shared one.
func (a *App) Share(key string, value any) {
	a.mu.Lock()
	defer a.mu.Unlock()
	a.shared[key] = value
}

// Render answers r with component and props: a full HTML page on a first visit, the page object as JSON on an
// Inertia visit, 409 with X-Inertia-Location on a stale version, and only the requested props on a partial reload.
func (a *App) Render(w http.ResponseWriter, r *http.Request, component string, props Props) {
	w.Header().Add("Vary", "X-Inertia")
	inertiaVisit := r.Header.Get("X-Inertia") == "true"
	if inertiaVisit && r.Method == http.MethodGet && r.Header.Get("X-Inertia-Version") != a.version {
		// The browser's assets are stale: ask it to load this address again as a whole page (protocol, "Asset versioning").
		w.Header().Set("X-Inertia-Location", r.URL.RequestURI())
		w.Header().Set("X-Inertia-Version", a.version)
		w.WriteHeader(http.StatusConflict)
		return
	}
	resolved, err := a.resolve(r, inertiaVisit, component, props)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	a.mu.RLock()
	_, _, err = a.lookup(component)
	a.mu.RUnlock()
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	var data strings.Builder
	writePage(&data, component, resolved, r.URL.RequestURI(), a.version)
	if inertiaVisit {
		w.Header().Set("X-Inertia", "true")
		w.Header().Set("Content-Type", "application/json")
		w.Write([]byte(data.String()))
		return
	}
	node, err := a.draw(component, resolved)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	w.Write([]byte(document(data.String(), gobi.HydratableHTML(node))))
}

// Redirect sends the client to url: 302, or 303 after a PUT, PATCH or DELETE.
func (a *App) Redirect(w http.ResponseWriter, r *http.Request, location string) {
	w.Header().Add("Vary", "X-Inertia")
	if r.Header.Get("X-Inertia") == "true" {
		// An Inertia client cannot follow a redirect to another site or to an address with a fragment by itself
		// (protocol, "Redirects"): it is told with 409 instead.
		if target, err := url.Parse(location); err == nil {
			if target.Host != "" && target.Host != r.Host {
				w.Header().Set("X-Inertia-Location", location)
				w.WriteHeader(http.StatusConflict)
				return
			}
			if target.Fragment != "" && r.Header.Get("Purpose") != "prefetch" {
				w.Header().Set("X-Inertia-Redirect", location)
				w.WriteHeader(http.StatusConflict)
				return
			}
		}
	}
	status := http.StatusFound
	switch r.Method {
	case http.MethodPut, http.MethodPatch, http.MethodDelete:
		status = http.StatusSeeOther
	}
	w.Header().Set("Location", location)
	w.WriteHeader(status)
}
