package oracle_test

import (
	"bytes"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/http/httptest"
	"os/exec"
	"path/filepath"
	"runtime"
	"testing"
	"time"

	"github.com/samuelpmahan/gondola/gobi"
	"github.com/samuelpmahan/gondola/inertia"
	"github.com/samuelpmahan/gondola/inertia/oracle"
	"github.com/samuelpmahan/gondola/wire"
)

// The oracle calls Inertia's server-side rendering directly (createInertiaApp with renderToString), the same call that
// @inertiajs/react/server makes for POST /render. This test starts the real Inertia server and checks the two agree.
func TestRenderServerAgreesWithTheDirectCall(t *testing.T) {
	if _, err := oracle.Versions(); err != nil {
		t.Fatal(err)
	}
	app := inertia.New("v1")
	app.Layout("shell", func(props inertia.Props, page gobi.Node) gobi.Node { return gobi.El("main", gobi.Txt("a"), page) })
	app.Page("Home", func(props inertia.Props) gobi.Node { return gobi.El("p", gobi.Txt("x"), gobi.Txt("y")) }, "shell")
	handler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		app.Render(w, r, "Home", inertia.Props{"s": "</script>/é", "n": 1.5, "10": true, "b": nil})
	})
	goBody, direct, err := oracle.FirstPaint(app, handler, "/?q=1")
	if err != nil || goBody != direct {
		t.Fatalf("direct call: %v\n%s\n%s", err, goBody, direct)
	}
	recorder := httptest.NewRecorder()
	handler.ServeHTTP(recorder, httptest.NewRequest("GET", "/?q=1", nil))
	html := recorder.Body.String()
	start := bytes.Index([]byte(html), []byte(`<script data-page="app" type="application/json">`)) + len(`<script data-page="app" type="application/json">`)
	end := bytes.Index([]byte(html[start:]), []byte("</script>"))
	pageJSON := html[start : start+end]

	side := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { oracle.ServeLayers(app, w, r) }))
	defer side.Close()
	listener, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	port := listener.Addr().(*net.TCPAddr).Port
	listener.Close()
	_, file, _, _ := runtime.Caller(0)
	command := exec.Command("node", "inertia-ssr.mjs", "--server", fmt.Sprint(port))
	command.Dir = filepath.Join(filepath.Dir(file), "..", "..")
	command.Env = append(command.Environ(), "GOBI_LAYERS="+side.URL)
	if err := command.Start(); err != nil {
		t.Fatal(err)
	}
	defer func() { command.Process.Kill(); command.Wait() }()
	base := fmt.Sprintf("http://127.0.0.1:%d", port)
	var response *http.Response
	for try := 0; try < 100; try++ {
		if response, err = http.Post(base+"/render", "application/json", bytes.NewReader([]byte(pageJSON))); err == nil {
			break
		}
		time.Sleep(100 * time.Millisecond)
	}
	if err != nil {
		t.Fatalf("Inertia's server did not answer: %v", err)
	}
	data, _ := io.ReadAll(response.Body)
	decoded, err := wire.DecodeValue(data)
	if err != nil {
		t.Fatalf("%v: %s", err, data)
	}
	served, _ := decoded.(map[string]any)["body"].(string)
	if served != direct {
		t.Errorf("POST /render wrote\n  %s\nthe direct call wrote\n  %s", served, direct)
	}
}
