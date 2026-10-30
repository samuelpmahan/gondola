package layouts_test

import (
	"net/http"
	"strings"
	"testing"

	"github.com/samuelpmahan/gondola/gobi"
	"github.com/samuelpmahan/gondola/inertia"
	"github.com/samuelpmahan/gondola/inertia/oracle"
)

// Markers are constant text that only the layouts or the views draw, never a prop, so the HTML can be searched for
// them without the page object (which sits in the same HTML) getting in the way.
const (
	headerMarker  = "HEADER-MARKER"
	navMarker     = "NAV-MARKER"
	footerMarker  = "FOOTER-MARKER"
	settingsOpen  = "SETTINGS-OPEN-MARKER"
	settingsClose = "SETTINGS-CLOSE-MARKER"
	dashboardBody = "DASHBOARD-BODY-MARKER"
	reportsBody   = "REPORTS-BODY-MARKER"
	profileBody   = "PROFILE-BODY-MARKER"
	aboutBody     = "ABOUT-BODY-MARKER"
	collisionBody = "COLLISION-BODY-MARKER"
)

// userNameFromProps reads auth.user.name out of a props map, the way the signed-in user is shared.
func userNameFromProps(props map[string]any) (string, bool) {
	auth, ok := props["auth"].(map[string]any)
	if !ok {
		return "", false
	}
	user, ok := auth["user"].(map[string]any)
	if !ok {
		return "", false
	}
	name, ok := user["name"].(string)
	return name, ok
}

// siteShell is the outer layout: header (with the signed-in user and the flash message, both shared props), nav, the
// page, then footer. It draws what it was given as the page node, in the place the page node sits.
func siteShell(props inertia.Props, page gobi.Node) gobi.Node {
	name, ok := userNameFromProps(props)
	if !ok {
		name = "(no signed-in user)"
	}
	kids := []gobi.Node{gobi.El("header", gobi.Txt(headerMarker+" Signed in as "+name))}
	if msg, ok := props["flash"].(string); ok {
		kids = append(kids, gobi.El("p", gobi.Txt("Flash: "+msg)))
	}
	kids = append(kids, gobi.El("nav", gobi.Txt(navMarker)), page, gobi.El("footer", gobi.Txt(footerMarker)))
	return gobi.El("div", kids...)
}

// settingsSection is the inner layout: a section that opens, holds the page, and closes.
func settingsSection(_ inertia.Props, page gobi.Node) gobi.Node {
	return gobi.El("section", gobi.Txt(settingsOpen), page, gobi.Txt(settingsClose))
}

// constView is a page view that draws one marker.
func constView(marker string) inertia.View {
	return func(_ inertia.Props) gobi.Node { return gobi.El("main", gobi.Txt(marker)) }
}

// newSite builds the app every check uses: two layouts, five pages, two shared props. It returns nil when the build
// fails, after reporting why, so the check that called it can stop.
func newSite(t *testing.T) (*inertia.App, http.Handler) {
	t.Helper()
	var app *inertia.App
	var mux *http.ServeMux
	ok := try(t, "building the site (inertia.New, Share, Layout, Page)", func() {
		app = inertia.New(assetVersion)
		app.Share("auth", map[string]any{"user": map[string]any{"name": "Ada Lovelace"}})
		app.Share("flash", "Saved")
		app.Layout("SiteShell", siteShell)
		app.Layout("SettingsSection", settingsSection)
		app.Page("Dashboard", constView(dashboardBody), "SiteShell")
		app.Page("Reports", constView(reportsBody), "SiteShell")
		app.Page("Settings/Profile", constView(profileBody), "SiteShell", "SettingsSection")
		app.Page("About", constView(aboutBody))
		app.Page("Collision", constView(collisionBody))

		mux = http.NewServeMux()
		mux.HandleFunc("/dashboard", func(w http.ResponseWriter, r *http.Request) {
			app.Render(w, r, "Dashboard", inertia.Props{"title": "Dashboard"})
		})
		mux.HandleFunc("/reports", func(w http.ResponseWriter, r *http.Request) {
			app.Render(w, r, "Reports", inertia.Props{"title": "Reports"})
		})
		mux.HandleFunc("/settings/profile", func(w http.ResponseWriter, r *http.Request) {
			app.Render(w, r, "Settings/Profile", inertia.Props{"title": "Profile"})
		})
		mux.HandleFunc("/about", func(w http.ResponseWriter, r *http.Request) {
			app.Render(w, r, "About", inertia.Props{"title": "About"})
		})
		mux.HandleFunc("/collision", func(w http.ResponseWriter, r *http.Request) {
			app.Render(w, r, "Collision", inertia.Props{"flash": "page flash"})
		})
	})
	if !ok {
		return nil, nil
	}
	return app, mux
}

// Docs cited in the messages below:
//   layouts:     https://inertiajs.com/docs/v3/the-basics/layouts
//   shared data: https://inertiajs.com/shared-data
//   protocol:    https://inertiajs.com/the-protocol

// A page inside one layout passes oracle.SameFirstPaint.
func TestSinglePageInsideOneLayoutFirstPaintMatchesInertia(t *testing.T) {
	app, h := newSite(t)
	if app == nil {
		return
	}
	sameFirstPaint(t, app, h, "/dashboard")
}

// The page's node sits inside the layout, where the layout put it: header, then nav, then the page, then footer.
// The layouts doc says "Persistent layouts solve this by telling Inertia which layout to use for a page", so the
// page is drawn inside the layout, not beside it.
func TestSinglePageNodeSitsBetweenLayoutNavAndFooter(t *testing.T) {
	app, h := newSite(t)
	if app == nil {
		return
	}
	resp, ok := get(t, h, "/dashboard")
	if !ok {
		return
	}
	markersInOrder(t, "/dashboard", resp.Body,
		"expected the layout to draw header, nav, the page, then footer, because the layout wraps the page node (https://inertiajs.com/docs/v3/the-basics/layouts)",
		headerMarker, navMarker, dashboardBody, footerMarker)
}

// A page inside two nested layouts passes oracle.SameFirstPaint.
func TestNestedLayoutsFirstPaintMatchesInertia(t *testing.T) {
	app, h := newSite(t)
	if app == nil {
		return
	}
	sameFirstPaint(t, app, h, "/settings/profile")
}

// Two nested layouts nest outermost first: the site shell wraps the settings section, which wraps the page. The
// layouts doc gives the array form as [SiteLayout, NestedLayout] but does not say outright which one is outermost;
// the contract (inertia/inertia.go, App.Page) says "layouts ... outermost first", and this check follows the contract.
func TestNestedLayoutsWrapOutermostFirst(t *testing.T) {
	app, h := newSite(t)
	if app == nil {
		return
	}
	resp, ok := get(t, h, "/settings/profile")
	if !ok {
		return
	}
	markersInOrder(t, "/settings/profile", resp.Body,
		"expected SiteShell (outer) to wrap SettingsSection (inner) which wraps the page: the contract says layouts are listed outermost first (inertia/inertia.go App.Page), and the layouts doc describes nested layouts as an array (https://inertiajs.com/docs/v3/the-basics/layouts)",
		headerMarker, navMarker, settingsOpen, profileBody, settingsClose, footerMarker)
}

// Shared props (the signed-in user and the flash message) appear in the page props of every page, next to the page's
// own prop. The shared data doc says "Shared data is automatically merged with the page props provided in your
// controller" (https://inertiajs.com/shared-data).
func TestSharedPropsAppearInEveryPagesPropsBesideItsOwn(t *testing.T) {
	app, h := newSite(t)
	if app == nil {
		return
	}
	cases := []struct{ path, component, title string }{
		{"/dashboard", "Dashboard", "Dashboard"},
		{"/reports", "Reports", "Reports"},
		{"/settings/profile", "Settings/Profile", "Profile"},
		{"/about", "About", "About"},
	}
	for _, c := range cases {
		res, ok := visit(t, app, h, c.path)
		if !ok {
			continue
		}
		if res.Page.Component != c.component {
			t.Errorf("visit %s: expected the page object component %q, got %q", c.path, c.component, res.Page.Component)
		}
		if name, ok := userNameFromProps(res.Page.Props); !ok || name != "Ada Lovelace" {
			t.Errorf("visit %s: expected shared prop auth.user.name %q in the page props, got %q (found: %t). Expected because shared data is merged into every page's props (https://inertiajs.com/shared-data)", c.path, "Ada Lovelace", name, ok)
		}
		if flash, ok := res.Page.Props["flash"]; !ok || flash != "Saved" {
			t.Errorf("visit %s: expected shared prop flash %q in the page props, got %v (found: %t). Expected because shared data is merged into every page's props (https://inertiajs.com/shared-data)", c.path, "Saved", flash, ok)
		}
		if title, ok := res.Page.Props["title"]; !ok || title != c.title {
			t.Errorf("visit %s: expected the page's own prop title %q to sit next to the shared props, got %v (found: %t). Expected because the merge keeps the page's own props (https://inertiajs.com/shared-data)", c.path, c.title, title, ok)
		}
	}
}

// A layout can draw the shared props: the header shows the signed-in user's name and the flash message, and both sit
// in the header area, before the nav. The shared data doc says shared data is merged into the page props, and the
// layouts doc says layouts are given props (https://inertiajs.com/docs/v3/the-basics/layouts). Whether the layout
// receives the merged props is an open question for the planner; see NOTES.md.
func TestLayoutDrawsSharedUserNameAndFlash(t *testing.T) {
	app, h := newSite(t)
	if app == nil {
		return
	}
	for _, path := range []string{"/dashboard", "/settings/profile"} {
		resp, ok := get(t, h, path)
		if !ok {
			continue
		}
		markersInOrder(t, path, resp.Body,
			"expected the header to show \"Signed in as Ada Lovelace\" and the flash \"Flash: Saved\" before the nav, because the layout draws shared props it was given (https://inertiajs.com/shared-data, https://inertiajs.com/docs/v3/the-basics/layouts)",
			headerMarker+" Signed in as Ada Lovelace", "Flash: Saved", navMarker)
	}
}

// A page prop with the same key as a shared prop. The shared data doc (https://inertiajs.com/shared-data) says "Page
// props and shared data are merged together, so be sure to namespace your shared data appropriately to avoid
// collisions." It does not say which value wins. This check asserts the page's own prop wins. That is a decision I am
// asking the planner to confirm (see NOTES.md), not something the docs state.
func TestPagePropWinsOverSharedPropWithSameKey(t *testing.T) {
	app, h := newSite(t)
	if app == nil {
		return
	}
	res, ok := visit(t, app, h, "/collision")
	if !ok {
		return
	}
	if flash, ok := res.Page.Props["flash"]; !ok || flash != "page flash" {
		t.Errorf("visit /collision: expected props.flash to be %q (the page's own prop wins over the shared prop %q), got %v (found: %t). The docs (https://inertiajs.com/shared-data) say the two are merged and advise namespacing to avoid collisions, but do not state which wins; this assertion is the planner's decision to confirm", "page flash", "Saved", flash, ok)
	}
}

// Two pages that share a layout: a visit from the first to the second ends on the second page's page object, with no
// full page reload, and the request the client sent carried X-Inertia: true and X-Inertia-Version. The protocol says
// the first request is a full page load and "After each request, the client inspects the response before touching the
// page" (https://inertiajs.com/the-protocol); the layouts doc says the layout is kept between visits.
func TestVisitBetweenPagesSharingLayoutIsXHRWithVersionAndNoFullReload(t *testing.T) {
	app, h := newSite(t)
	if app == nil {
		return
	}
	res, ok := visit(t, app, h, "/dashboard", oracle.Step{Kind: "visit", URL: "/reports"})
	if !ok {
		return
	}
	if res.Page.Component != "Reports" {
		t.Errorf("visit /dashboard then /reports: expected the page object to end on component %q, got %q (https://inertiajs.com/the-protocol: the client applies the page object and swaps the component)", "Reports", res.Page.Component)
	}
	if res.Page.URL != "/reports" {
		t.Errorf("visit /dashboard then /reports: expected the page object URL %q, got %q", "/reports", res.Page.URL)
	}
	if res.Page.Version != assetVersion {
		t.Errorf("visit /dashboard then /reports: expected the page object version %q (the asset version the app was built with), got %q (https://inertiajs.com/the-protocol)", assetVersion, res.Page.Version)
	}
	if res.FullReloads != 0 {
		t.Errorf("visit /dashboard then /reports: expected 0 full page reloads, got %d. Expected because pages that share a layout are an Inertia visit, not a new full page load (https://inertiajs.com/the-protocol, https://inertiajs.com/docs/v3/the-basics/layouts)", res.FullReloads)
	}
	if len(res.Errors) != 0 {
		t.Errorf("visit /dashboard then /reports: expected no client errors, got %v", res.Errors)
	}
	sent, found := sentTo(res.Requests, "/reports")
	if !found {
		t.Errorf("visit /dashboard then /reports: expected the client to send a request to /reports, it sent %+v", res.Requests)
		return
	}
	if sent.Method != http.MethodGet {
		t.Errorf("visit /reports: expected the request method GET, got %q", sent.Method)
	}
	if v, ok := headerValue(sent.Headers, "X-Inertia"); !ok || v != "true" {
		t.Errorf("visit /reports: expected the request header X-Inertia to be %q, got %q (found: %t). Expected because \"Set to true to indicate this is an Inertia request\" (https://inertiajs.com/the-protocol)", "true", v, ok)
	}
	if v, ok := headerValue(sent.Headers, "X-Inertia-Version"); !ok || v != assetVersion {
		t.Errorf("visit /reports: expected the request header X-Inertia-Version to be %q, got %q (found: %t). Expected because the protocol says it is \"The current asset version to check for asset mismatches\" (https://inertiajs.com/the-protocol)", assetVersion, v, ok)
	}
}

// A page with no layout, next to pages with layouts, still renders correctly: its first paint matches Inertia, its body
// is not wrapped in the header, nav or footer, and it still gets the shared props. The layouts doc attaches a layout
// per page, so a page that names none is not wrapped (https://inertiajs.com/docs/v3/the-basics/layouts).
func TestPageWithoutLayoutFirstPaintIsNotWrapped(t *testing.T) {
	app, h := newSite(t)
	if app == nil {
		return
	}
	sameFirstPaint(t, app, h, "/about")
	resp, ok := get(t, h, "/about")
	if !ok {
		return
	}
	if n := strings.Count(resp.Body, aboutBody); n != 1 {
		t.Errorf("GET /about: expected the page body %q exactly once, found %d times", aboutBody, n)
	}
	for _, m := range []string{headerMarker, navMarker, footerMarker, settingsOpen} {
		if strings.Contains(resp.Body, m) {
			t.Errorf("GET /about: expected no layout marker %q in the HTML, because the page names no layout and the layouts doc attaches layouts per page (https://inertiajs.com/docs/v3/the-basics/layouts)", m)
		}
	}
}

// A visit from a layout page to a page with no layout, then to a page with a layout, is an Inertia visit each time: no
// full page reload, the right component at the end, and X-Inertia on both requests (https://inertiajs.com/the-protocol).
func TestVisitBetweenLayoutAndNoLayoutPagesIsNoFullReload(t *testing.T) {
	app, h := newSite(t)
	if app == nil {
		return
	}
	res, ok := visit(t, app, h, "/dashboard",
		oracle.Step{Kind: "visit", URL: "/about"},
		oracle.Step{Kind: "visit", URL: "/reports"})
	if !ok {
		return
	}
	if res.Page.Component != "Reports" {
		t.Errorf("visit /dashboard, then /about, then /reports: expected the page object to end on %q, got %q", "Reports", res.Page.Component)
	}
	if res.FullReloads != 0 {
		t.Errorf("visit /dashboard, then /about, then /reports: expected 0 full page reloads, got %d (https://inertiajs.com/the-protocol: after the first request, visits are XHR)", res.FullReloads)
	}
	for _, path := range []string{"/about", "/reports"} {
		sent, found := sentTo(res.Requests, path)
		if !found {
			t.Errorf("visit to %s: expected the client to send a request to %s, it sent %+v", path, path, res.Requests)
			continue
		}
		if v, ok := headerValue(sent.Headers, "X-Inertia"); !ok || v != "true" {
			t.Errorf("visit to %s: expected the request header X-Inertia to be %q, got %q (found: %t) (https://inertiajs.com/the-protocol)", path, "true", v, ok)
		}
	}
}
