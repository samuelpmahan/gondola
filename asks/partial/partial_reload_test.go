package partial_test

import (
	"net/http"
	"testing"

	"github.com/samuelpmahan/gondola/inertia/oracle"
)

// A reload with only names props. The client sends them as X-Inertia-Partial-Data, and the answer carries them.
func TestOnlyReloadSendsPartialHeadersAndKeepsOtherPropsThroughOracle(t *testing.T) {
	f, ok := newFixture(t, "v1")
	if !ok {
		return
	}
	res, ok := run(t, f.app, f.mux, listPath, oracle.Step{Kind: "reload", Only: []string{"users"}})
	if !ok {
		return
	}
	sent, ok := lastSent(t, res)
	if !ok {
		return
	}
	expectHeader(t, sent.Headers, "X-Inertia-Partial-Component", usersComponent,
		"a partial reload names the component it reloads (protocol: "+docsProtocol+")")
	expectHeader(t, sent.Headers, "X-Inertia-Partial-Data", "users",
		"only: [\"users\"] goes out as the comma-separated props to include (protocol: "+docsProtocol+")")
	expectValue(t, res.Page.Props, "users", "users at visit 2",
		"users was named by only, so the server answered it again and the client took the new value (partial reloads: "+docsPartial+")")
	expectValue(t, res.Page.Props, "title", "title at visit 1",
		"title was not named by only, so the client keeps the value it had from the first visit; partial reloads merge with client data (partial reloads: "+docsPartial+")")
	expectErrorsObject(t, res.Page.Props,
		"errors is always in props, including after a partial reload (protocol: "+docsProtocol+")")
	if res.FullReloads != 0 {
		t.Errorf("FullReloads = %d, want 0: a partial reload is an XHR visit, not a full page load (partial reloads: %s)",
			res.FullReloads, docsPartial)
	}
}

// Direct: the answer to a partial reload that names users holds users, the Always prop and errors, and nothing else.
func TestOnlyReloadAnswerHoldsOnlyTheNamedPropsPlusAlwaysAndErrors(t *testing.T) {
	f, ok := newFixture(t, "v1")
	if !ok {
		return
	}
	rec, ok := f.send(t, http.MethodGet, listPath, f.partialHeaders(usersComponent, "users", ""))
	if !ok {
		return
	}
	expectStatus(t, rec, http.StatusOK, "a partial reload of a current page is answered 200 (protocol: "+docsProtocol+")")
	props, ok := answerProps(t, rec)
	if !ok {
		return
	}
	expectKeys(t, props, []string{"users", "user", "errors"},
		"only names users: the answer holds users, plus errors (always in props) and user (Always prop, sent even when left out); title, stats and the Optional activity are left out (partial reloads: "+docsPartial+")")
	expectValue(t, props, "users", "users at visit 1",
		"users is named, so its value comes from the server (partial reloads: "+docsPartial+")")
}

// Through Inertia's client: except goes out as X-Inertia-Partial-Except, and the excluded prop keeps its old value.
func TestExceptReloadSendsExceptHeaderThroughOracle(t *testing.T) {
	f, ok := newFixture(t, "v1")
	if !ok {
		return
	}
	res, ok := run(t, f.app, f.mux, listPath, oracle.Step{Kind: "reload", Except: []string{"stats"}})
	if !ok {
		return
	}
	sent, ok := lastSent(t, res)
	if !ok {
		return
	}
	expectHeader(t, sent.Headers, "X-Inertia-Partial-Except", "stats",
		"except: [\"stats\"] goes out as X-Inertia-Partial-Except (protocol: "+docsProtocol+")")
	expectValue(t, res.Page.Props, "stats", "stats at visit 1",
		"stats is excluded by except, so the server does not send it and the client keeps the first-visit value (partial reloads: "+docsPartial+")")
	expectValue(t, res.Page.Props, "users", "users at visit 2",
		"users is not excluded, so the reload brings the new value (partial reloads: "+docsPartial+")")
}

// Direct: the answer to a partial reload that excepts stats leaves stats out and keeps everything else that is sent
// on a normal visit.
func TestExceptReloadAnswerLeavesExceptedPropOut(t *testing.T) {
	f, ok := newFixture(t, "v1")
	if !ok {
		return
	}
	rec, ok := f.send(t, http.MethodGet, listPath, f.partialHeaders(usersComponent, "", "stats"))
	if !ok {
		return
	}
	props, ok := answerProps(t, rec)
	if !ok {
		return
	}
	expectKeys(t, props, []string{"title", "users", "user", "errors"},
		"except names stats: stats is left out, the other props a normal visit sends stay in, and the Optional activity stays out (partial reloads: "+docsPartial+")")
}

// Optional: not computed on a full page visit or on a plain Inertia visit.
func TestOptionalPropIsNotComputedOnANormalVisit(t *testing.T) {
	f, ok := newFixture(t, "v1")
	if !ok {
		return
	}
	if _, ok := f.send(t, http.MethodGet, listPath, nil); !ok {
		return
	}
	expectComputes(t, f, 0,
		"a full page visit is a standard visit, and an Optional prop is not included on standard visits (partial reloads: "+docsPartial+")")

	rec, ok := f.send(t, http.MethodGet, listPath, f.visitHeaders(nil))
	if !ok {
		return
	}
	props, ok := answerProps(t, rec)
	if !ok {
		return
	}
	expectComputes(t, f, 0,
		"an Inertia visit with no partial headers is still a standard visit (partial reloads: "+docsPartial+")")
	expectAbsent(t, props, "activity",
		"an Optional prop must not be sent unless a partial reload names it in only (partial reloads: "+docsPartial+")")

	g, ok := newFixture(t, "v1")
	if !ok {
		return
	}
	if _, ok := run(t, g.app, g.mux, listPath); !ok {
		return
	}
	expectComputes(t, g, 0,
		"Inertia's client visiting the page without a reload must not trigger the Optional prop (partial reloads: "+docsPartial+")")
}

// Optional: computed and sent on a partial reload that names it.
func TestOptionalPropIsComputedAndSentOnlyWhenPartialReloadNamesIt(t *testing.T) {
	f, ok := newFixture(t, "v1")
	if !ok {
		return
	}
	rec, ok := f.send(t, http.MethodGet, listPath, f.partialHeaders(usersComponent, "activity", ""))
	if !ok {
		return
	}
	props, ok := answerProps(t, rec)
	if !ok {
		return
	}
	expectComputes(t, f, 1,
		"only names activity, so its Compute is run once for this answer (partial reloads: "+docsPartial+")")
	expectValue(t, props, "activity", "activity",
		"only names activity, so the Optional prop is computed and sent (partial reloads: "+docsPartial+")")

	g, ok := newFixture(t, "v1")
	if !ok {
		return
	}
	res, ok := run(t, g.app, g.mux, listPath, oracle.Step{Kind: "reload", Only: []string{"activity"}})
	if !ok {
		return
	}
	expectComputes(t, g, 1,
		"Inertia's client named activity in only, so the Optional prop is computed once (partial reloads: "+docsPartial+")")
	expectValue(t, res.Page.Props, "activity", "activity",
		"the reload named activity, so the client receives it (partial reloads: "+docsPartial+")")
}

// Optional: a partial reload that does not name it does not compute it.
func TestOptionalPropIsNotComputedWhenPartialReloadOmitsIt(t *testing.T) {
	f, ok := newFixture(t, "v1")
	if !ok {
		return
	}
	rec, ok := f.send(t, http.MethodGet, listPath, f.partialHeaders(usersComponent, "users", ""))
	if !ok {
		return
	}
	props, ok := answerProps(t, rec)
	if !ok {
		return
	}
	expectComputes(t, f, 0,
		"only names users and not activity, so the Optional prop must not be computed (partial reloads: "+docsPartial+")")
	expectAbsent(t, props, "activity",
		"only names users and not activity, so activity is not sent (partial reloads: "+docsPartial+")")

	g, ok := newFixture(t, "v1")
	if !ok {
		return
	}
	res, ok := run(t, g.app, g.mux, listPath, oracle.Step{Kind: "reload", Only: []string{"users"}})
	if !ok {
		return
	}
	expectComputes(t, g, 0,
		"Inertia's client reloaded with only users, so the Optional prop must not be computed (partial reloads: "+docsPartial+")")
	expectAbsent(t, res.Page.Props, "activity",
		"the client never received activity, so it is not in the final page (partial reloads: "+docsPartial+")")
}

// Always: sent on a partial reload that leaves it out. The value changes per visit, so the client's copy proves the
// server sent it again.
func TestAlwaysPropIsSentWhenPartialReloadLeavesItOut(t *testing.T) {
	f, ok := newFixture(t, "v1")
	if !ok {
		return
	}
	res, ok := run(t, f.app, f.mux, listPath, oracle.Step{Kind: "reload", Only: []string{"stats"}})
	if !ok {
		return
	}
	expectValue(t, res.Page.Props, "user", "ada at visit 2",
		"user is an Always prop: it is sent on every response, even when a partial reload leaves it out of only (partial reloads: "+docsPartial+")")
	expectValue(t, res.Page.Props, "stats", "stats at visit 2",
		"stats was named by only, so the new value comes from the server (partial reloads: "+docsPartial+")")
	expectValue(t, res.Page.Props, "title", "title at visit 1",
		"title was not named by only, so the client keeps the first-visit value (partial reloads: "+docsPartial+")")

	g, ok := newFixture(t, "v1")
	if !ok {
		return
	}
	rec, ok := g.send(t, http.MethodGet, listPath, g.partialHeaders(usersComponent, "stats", ""))
	if !ok {
		return
	}
	props, ok := answerProps(t, rec)
	if !ok {
		return
	}
	expectKeys(t, props, []string{"stats", "user", "errors"},
		"only names stats and leaves user out: user is still in the answer because it is an Always prop (partial reloads: "+docsPartial+")")
}

// A partial reload whose component differs from the page rendered is not partial: every prop a normal visit sends goes
// out, and the Optional prop stays out, as on any normal visit.
func TestPartialHeadersNamingAnotherComponentAreIgnored(t *testing.T) {
	f, ok := newFixture(t, "v1")
	if !ok {
		return
	}
	rec, ok := f.send(t, http.MethodGet, listPath, f.partialHeaders("Settings", "users", ""))
	if !ok {
		return
	}
	expectStatus(t, rec, http.StatusOK, "the request is still a valid Inertia visit of the Users page (protocol: "+docsProtocol+")")
	props, ok := answerProps(t, rec)
	if !ok {
		return
	}
	expectKeys(t, props, []string{"title", "users", "stats", "user", "errors"},
		"partial reloads only work for requests made to the same page component, so the Settings name is ignored and every prop of a normal visit is sent (partial reloads: "+docsPartial+"; protocol: "+docsProtocol+")")
	expectComputes(t, f, 0,
		"the partial headers were ignored, so this is a normal visit and the Optional prop is not computed (partial reloads: "+docsPartial+")")
}
