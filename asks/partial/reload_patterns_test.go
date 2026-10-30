package partial_test

import (
	"net/http"
	"strings"
	"testing"

	"github.com/samuelpmahan/gondola/inertia"
	"github.com/samuelpmahan/gondola/inertia/oracle"
)

// A reload that names two props sends both, comma-separated, and the answer holds exactly those two, plus the Always
// prop and errors. Props it does not name keep their first-visit values on the client.
func TestOnlyReloadNamingTwoPropsSendsBothAndKeepsTheRest(t *testing.T) {
	f, ok := newFixture(t, "v1")
	if !ok {
		return
	}
	res, ok := run(t, f.app, f.mux, listPath, oracle.Step{Kind: "reload", Only: []string{"users", "stats"}})
	if !ok {
		return
	}
	sent, ok := lastSent(t, res)
	if !ok {
		return
	}
	data, found := headerValue(sent.Headers, "X-Inertia-Partial-Data")
	if !found {
		t.Errorf("request did not send X-Inertia-Partial-Data, want both names: only: [users, stats] (%s)", docsPartial)
	} else {
		names := map[string]bool{}
		for _, n := range strings.Split(data, ",") {
			names[strings.TrimSpace(n)] = true
		}
		if len(names) != 2 || !names["users"] || !names["stats"] {
			t.Errorf("X-Inertia-Partial-Data = %q, want the two names users and stats, comma-separated (%s)", data, docsProtocol)
		}
	}
	expectValue(t, res.Page.Props, "users", "users at visit 2",
		"users was named, so the new value comes from the server (partial reloads: "+docsPartial+")")
	expectValue(t, res.Page.Props, "stats", "stats at visit 2",
		"stats was named too, so the new value comes from the server (partial reloads: "+docsPartial+")")
	expectValue(t, res.Page.Props, "title", "title at visit 1",
		"title was not named, so the client keeps its first-visit value (partial reloads: "+docsPartial+")")

	g, ok := newFixture(t, "v1")
	if !ok {
		return
	}
	rec, ok := g.send(t, http.MethodGet, listPath, g.partialHeaders(usersComponent, "users,stats", ""))
	if !ok {
		return
	}
	props, ok := answerProps(t, rec)
	if !ok {
		return
	}
	expectKeys(t, props, []string{"users", "stats", "user", "errors"},
		"only names users and stats: the answer holds exactly those, the Always prop and errors; title and the Optional activity are left out (partial reloads: "+docsPartial+")")
}

// A form that fails validation answers with the page and its errors filled in. The client takes the errors into its
// final page and stays on the page it posted to, with the errors on it, since no redirect is sent.
func TestFailedValidationAnswersWithErrorsFilledIn(t *testing.T) {
	f, ok := newFixture(t, "v1")
	if !ok {
		return
	}
	const create = "/users/new"
	// The form always fails validation here, so the answer always carries the error. The check sends a blank name.
	if !attempt(t, "mux.HandleFunc(POST /users/new)", func() {
		f.mux.HandleFunc("POST /users/new", func(w http.ResponseWriter, r *http.Request) {
			f.app.Render(w, r, usersComponent, inertia.Props{
				"title":  "title at visit 1",
				"users":  "users at validation",
				"errors": map[string]any{"name": "The name is required."},
			})
		})
	}) {
		return
	}
	rec, ok := f.send(t, http.MethodPost, create, f.visitHeaders(nil))
	if !ok {
		return
	}
	expectStatus(t, rec, http.StatusOK,
		"a failed validation answers the page itself, 200 with the page object, not a redirect (redirects: "+docsRedirects+")")
	props, ok := answerProps(t, rec)
	if !ok {
		return
	}
	answeredErrors, isObject := props["errors"].(map[string]any)
	if !isObject {
		t.Errorf("answer props.errors = %#v, want the object the handler passed in: errors is sent as given, not replaced by {} (protocol: %s)",
			props["errors"], docsProtocol)
	} else if answeredErrors["name"] != "The name is required." {
		t.Errorf("answer props.errors.name = %v, want %q: errors is sent as given (protocol: %s)",
			answeredErrors["name"], "The name is required.", docsProtocol)
	}

	res, ok := run(t, f.app, f.mux, listPath, oracle.Step{Kind: "post", URL: create, Data: map[string]any{"name": ""}})
	if !ok {
		return
	}
	if res.Page.Component != usersComponent {
		t.Errorf("client ended on component %q, want %q: a failed validation stays on the page (redirects: %s)",
			res.Page.Component, usersComponent, docsRedirects)
	}
	errs, isObject := res.Page.Props["errors"].(map[string]any)
	if !isObject {
		t.Errorf("final page props.errors = %#v, want the object with name: the client takes the errors from the answer (protocol: %s)",
			res.Page.Props["errors"], docsProtocol)
	} else if errs["name"] != "The name is required." {
		t.Errorf("final page props.errors.name = %v, want %q: the client keeps the validation message (protocol: %s)",
			errs["name"], "The name is required.", docsProtocol)
	}
	if len(res.Errors) != 0 {
		t.Errorf("client raised errors %v, want none: a validation answer is a normal 200 page (protocol: %s)", res.Errors, docsProtocol)
	}
}

// An Optional prop whose Compute is expensive runs exactly once per reload that names it: two such reloads run it
// twice, and a plain visit before them runs it none.
func TestExpensiveOptionalPropRunsOncePerNamingReload(t *testing.T) {
	f, ok := newFixture(t, "v1")
	if !ok {
		return
	}
	res, ok := run(t, f.app, f.mux, listPath,
		oracle.Step{Kind: "reload", Only: []string{"activity"}},
		oracle.Step{Kind: "reload", Only: []string{"activity"}},
	)
	if !ok {
		return
	}
	expectComputes(t, f, 2,
		"each reload names activity, so its Compute runs once per reload and not on the first visit (partial reloads: "+docsPartial+")")
	expectValue(t, res.Page.Props, "activity", "activity",
		"the last reload named activity, so the client has it (partial reloads: "+docsPartial+")")
}

// A stale version on a partial reload is still answered 409 with X-Inertia-Location: the partial headers do not
// change the version check, which the docs apply to every GET.
func TestStaleVersionOnPartialReloadIsAnswered409(t *testing.T) {
	f, ok := newFixture(t, "v2")
	if !ok {
		return
	}
	headers := f.partialHeaders(usersComponent, "users", "")
	headers["X-Inertia-Version"] = "v1"
	rec, ok := f.send(t, http.MethodGet, listPath, headers)
	if !ok {
		return
	}
	expectStatus(t, rec, http.StatusConflict,
		"a GET with a stale version is 409 whether or not it is a partial reload (asset versioning: "+docsVersion+")")
	if loc := rec.Header().Get("X-Inertia-Location"); loc != listPath {
		t.Errorf("X-Inertia-Location = %q, want %q: the client does a full page visit to the target (asset versioning: %s)",
			loc, listPath, docsVersion)
	}
	expectComputes(t, f, 0,
		"a 409 answers without the partial props, so the Optional prop is not computed (asset versioning: "+docsVersion+")")
}
