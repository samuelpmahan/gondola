package partial_test

import (
	"net/http"
	"strings"
	"testing"

	"github.com/samuelpmahan/gondola/inertia/oracle"
)

// After PUT, PATCH or DELETE, app.Redirect answers 303 See Other, so the browser's follow-up request is a GET.
func TestRedirectAfterPutPatchDeleteAnswers303(t *testing.T) {
	for _, method := range []string{http.MethodPut, http.MethodPatch, http.MethodDelete} {
		t.Run(method, func(t *testing.T) {
			f, ok := newFixture(t, "v1")
			if !ok {
				return
			}
			rec, ok := f.send(t, method, memberPath, f.visitHeaders(nil))
			if !ok {
				return
			}
			expectStatus(t, rec, http.StatusSeeOther,
				method+" then redirect must answer 303 so the follow-up is a GET (redirects: "+docsRedirects+")")
			if loc := rec.Header().Get("Location"); !strings.HasSuffix(loc, listPath) {
				t.Errorf("Location = %q, want it to end in %q: app.Redirect sends the client to the URL it was given (redirects: %s)",
					loc, listPath, docsRedirects)
			}
		})
	}
}

// Through Inertia's client: after PUT, PATCH or DELETE the client ends on the redirected page, and loads it fresh.
func TestRedirectAfterPutPatchDeleteEndsOnRedirectedPageThroughOracle(t *testing.T) {
	cases := []struct {
		kind, method string
		data         map[string]any
	}{
		{"put", http.MethodPut, map[string]any{"name": "Grace"}},
		{"patch", http.MethodPatch, map[string]any{"name": "Grace"}},
		{"delete", http.MethodDelete, nil},
	}
	for _, c := range cases {
		t.Run(c.method, func(t *testing.T) {
			f, ok := newFixture(t, "v1")
			if !ok {
				return
			}
			res, ok := run(t, f.app, f.mux, listPath, oracle.Step{Kind: c.kind, URL: memberPath, Data: c.data})
			if !ok {
				return
			}
			sentWrite := false
			for _, s := range res.Requests {
				if strings.EqualFold(s.Method, c.method) && strings.HasSuffix(s.URL, memberPath) {
					sentWrite = true
				}
			}
			if !sentWrite {
				t.Errorf("Inertia's client sent no %s %s, want the %s step sent (redirects: %s)",
					c.method, memberPath, c.kind, docsRedirects)
			}
			if res.Page.Component != usersComponent || res.Page.URL != listPath {
				t.Errorf("client ended on %s at %s, want %s at %s: the redirect is followed to the Users page (redirects: %s)",
					res.Page.Component, res.Page.URL, usersComponent, listPath, docsRedirects)
			}
			expectValue(t, res.Page.Props, "users", "users at visit 2",
				"the redirect's GET is a new visit, so the page's props come from the server again (redirects: "+docsRedirects+")")
		})
	}
}

// After POST, app.Redirect answers 302 Found.
func TestRedirectAfterPostAnswers302(t *testing.T) {
	f, ok := newFixture(t, "v1")
	if !ok {
		return
	}
	rec, ok := f.send(t, http.MethodPost, listPath, f.visitHeaders(nil))
	if !ok {
		return
	}
	expectStatus(t, rec, http.StatusFound,
		"app.Redirect after POST answers 302 (the task's contract; redirects page: "+docsRedirects+" covers only PUT, PATCH and DELETE)")
	if loc := rec.Header().Get("Location"); !strings.HasSuffix(loc, listPath) {
		t.Errorf("Location = %q, want it to end in %q (redirects: %s)", loc, listPath, docsRedirects)
	}
}

// Through Inertia's client: after POST the client ends on the redirected page.
func TestRedirectAfterPostEndsOnRedirectedPageThroughOracle(t *testing.T) {
	f, ok := newFixture(t, "v1")
	if !ok {
		return
	}
	res, ok := run(t, f.app, f.mux, listPath, oracle.Step{Kind: "post", URL: listPath, Data: map[string]any{"name": "Grace"}})
	if !ok {
		return
	}
	sentPost := false
	for _, s := range res.Requests {
		if strings.EqualFold(s.Method, http.MethodPost) {
			sentPost = true
		}
	}
	if !sentPost {
		t.Errorf("Inertia's client sent no POST, want the post step sent (redirects: %s)", docsRedirects)
	}
	if res.Page.Component != usersComponent || res.Page.URL != listPath {
		t.Errorf("client ended on %s at %s, want %s at %s: the 302 after POST is followed to the Users page (redirects: %s)",
			res.Page.Component, res.Page.URL, usersComponent, listPath, docsRedirects)
	}
	expectValue(t, res.Page.Props, "users", "users at visit 2",
		"the redirect's GET is a new visit, so the page's props come from the server again (redirects: "+docsRedirects+")")
}
