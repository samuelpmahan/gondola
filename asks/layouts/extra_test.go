package layouts_test

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/samuelpmahan/gondola/gobi"
	"github.com/samuelpmahan/gondola/inertia"
	"github.com/samuelpmahan/gondola/inertia/oracle"
)

// textLayout draws "Signed in as " and the name as two adjacent text nodes in the header. React writes an empty
// comment (<!-- -->) between two adjacent text nodes when it renders to HTML, so Inertia's first paint carries it.
func textLayout(props inertia.Props, page gobi.Node) gobi.Node {
	name, ok := userNameFromProps(props)
	if !ok {
		name = "(no signed-in user)"
	}
	return gobi.El("div",
		gobi.El("header", gobi.Txt("Signed in as "), gobi.Txt(name)),
		page)
}

// adjacentTextView draws two adjacent text nodes in the page.
func adjacentTextView(_ inertia.Props) gobi.Node {
	return gobi.El("main", gobi.Txt("PAGE-TEXT-"), gobi.Txt("TAIL"))
}

// adjacentTextSite builds one page inside one layout, both drawing adjacent text nodes.
func adjacentTextSite(t *testing.T) (*inertia.App, http.Handler) {
	t.Helper()
	var app *inertia.App
	var mux *http.ServeMux
	ok := try(t, "building the adjacent-text site (inertia.New, Share, Layout, Page)", func() {
		app = inertia.New(assetVersion)
		app.Share("auth", map[string]any{"user": map[string]any{"name": "Ada Lovelace"}})
		app.Layout("TextShell", textLayout)
		app.Page("Adjacent", adjacentTextView, "TextShell")
		mux = http.NewServeMux()
		mux.HandleFunc("/adjacent", func(w http.ResponseWriter, r *http.Request) {
			app.Render(w, r, "Adjacent", inertia.Props{})
		})
	})
	if !ok {
		return nil, nil
	}
	return app, mux
}

// A layout and a page that each draw two adjacent text nodes: the first paint matches Inertia byte for byte, and the
// HTML carries React's <!-- --> between the two text nodes on both sides. The contract's Node values are drawn as
// React elements, so the server has to write that comment too for the bytes to match.
func TestAdjacentTextInLayoutAndPageFirstPaintMatchesInertia(t *testing.T) {
	app, h := adjacentTextSite(t)
	if app == nil {
		return
	}
	sameFirstPaint(t, app, h, "/adjacent")
	resp, ok := get(t, h, "/adjacent")
	if !ok {
		return
	}
	for _, want := range []string{"Signed in as <!-- -->Ada Lovelace", "PAGE-TEXT-<!-- -->TAIL"} {
		if !strings.Contains(resp.Body, want) {
			t.Errorf("GET /adjacent: expected %q in the HTML, because React writes <!-- --> between two adjacent text nodes when it renders to HTML, so the first paint must carry it the way Inertia's own render does (the oracle is the judge, planner ruling round 0 plain). Body: %s", want, resp.Body)
		}
	}
}

// flashCookie carries a flash message from the POST that saves to the page the POST redirects to. The app has no
// flash API in the contract, so the check keeps the flash in a cookie that the app's own handlers write and read.
const flashCookie = "layouts_flash"

// flashLayout draws "Flash: " and the message when the page brings one.
func flashLayout(props inertia.Props, page gobi.Node) gobi.Node {
	kids := []gobi.Node{}
	if msg, ok := props["flash"].(string); ok {
		kids = append(kids, gobi.El("p", gobi.Txt("Flash: "+msg)))
	}
	kids = append(kids, gobi.El("nav", gobi.Txt(navMarker)), page)
	return gobi.El("div", kids...)
}

// flashSite builds /dashboard inside flashLayout, and /profile which takes a POST, sets the flash cookie and redirects
// to /dashboard. /dashboard reads the cookie once, passes it as the flash prop and clears it.
func flashSite(t *testing.T) (*inertia.App, http.Handler) {
	t.Helper()
	var app *inertia.App
	var mux *http.ServeMux
	ok := try(t, "building the flash site (inertia.New, Layout, Page, Render, Redirect)", func() {
		app = inertia.New(assetVersion)
		app.Layout("FlashShell", flashLayout)
		app.Page("Dashboard", constView(dashboardBody), "FlashShell")
		mux = http.NewServeMux()
		mux.HandleFunc("/dashboard", func(w http.ResponseWriter, r *http.Request) {
			props := inertia.Props{}
			if c, err := r.Cookie(flashCookie); err == nil && c.Value != "" {
				props["flash"] = c.Value
				http.SetCookie(w, &http.Cookie{Name: flashCookie, Value: "", Path: "/", MaxAge: -1})
			}
			app.Render(w, r, "Dashboard", props)
		})
		mux.HandleFunc("/profile", func(w http.ResponseWriter, r *http.Request) {
			http.SetCookie(w, &http.Cookie{Name: flashCookie, Value: "Profile saved", Path: "/"})
			app.Redirect(w, r, "/dashboard")
		})
	})
	if !ok {
		return nil, nil
	}
	return app, mux
}

// A flash set by a POST appears after the redirected visit, both in Inertia's client (the page object's props) and in
// the layout's HTML on the next plain GET that carries the cookie. Before the POST there is no flash. The protocol says
// the client applies each Inertia response to the page (https://inertiajs.com/the-protocol), and the layout draws the
// props it is given (planner ruling round 0, layouts: a layout receives the same resolved props as its page).
func TestFlashSetByPostAppearsAfterRedirectedVisit(t *testing.T) {
	app, h := flashSite(t)
	if app == nil {
		return
	}

	before, ok := visit(t, app, h, "/dashboard")
	if ok {
		if flash, has := before.Page.Props["flash"]; has {
			t.Errorf("visit /dashboard before any save: expected no flash prop, got %v. Expected because the flash is only set by the POST to /profile", flash)
		}
	}

	res, ok := visit(t, app, h, "/dashboard", oracle.Step{Kind: "post", URL: "/profile", Data: map[string]any{"name": "Ada"}})
	if !ok {
		return
	}
	if res.Page.Component != "Dashboard" {
		t.Errorf("visit /dashboard then POST /profile: expected the page object to end on %q after the redirect, got %q", "Dashboard", res.Page.Component)
	}
	if flash, ok := res.Page.Props["flash"]; !ok || flash != "Profile saved" {
		t.Errorf("visit /dashboard then POST /profile: expected the flash prop %q after the redirected visit, got %v (found: %t). Expected because the POST set the flash and the redirect lands on /dashboard (https://inertiajs.com/the-protocol: the client applies the response's page object)", "Profile saved", flash, ok)
	}
	if res.FullReloads != 0 {
		t.Errorf("visit /dashboard then POST /profile: expected 0 full page reloads, got %d (https://inertiajs.com/the-protocol: after the first request, Inertia responses are applied without a full load)", res.FullReloads)
	}
	if sent, found := sentTo(res.Requests, "/profile"); !found {
		t.Errorf("POST /profile: expected the client to send a request to /profile, it sent %+v", res.Requests)
	} else if v, ok := headerValue(sent.Headers, "X-Inertia"); !ok || v != "true" {
		t.Errorf("POST /profile: expected the request header X-Inertia to be %q, got %q (found: %t) (https://inertiajs.com/the-protocol)", "true", v, ok)
	}

	// The layout draws the flash on the plain GET that carries the cookie the POST set. The POST is sent here without
	// the oracle, so the layout check does not depend on how the oracle keeps cookies.
	var cookies []*http.Cookie
	if !try(t, "POST /profile (plain)", func() {
		rec := httptest.NewRecorder()
		h.ServeHTTP(rec, httptest.NewRequest(http.MethodPost, "/profile", nil))
		cookies = rec.Result().Cookies()
	}) {
		return
	}
	req := httptest.NewRequest(http.MethodGet, "/dashboard", nil)
	for _, c := range cookies {
		req.AddCookie(c)
	}
	var body string
	if !try(t, "GET /dashboard with the flash cookie", func() {
		rec := httptest.NewRecorder()
		h.ServeHTTP(rec, req)
		body = rec.Body.String()
	}) {
		return
	}
	markersInOrder(t, "/dashboard", body,
		"expected the layout to draw \"Flash: Profile saved\" before the nav on the visit after the POST, because the layout draws the flash prop it is given (planner ruling round 0, layouts)",
		"Flash: Profile saved", navMarker, dashboardBody)
}
