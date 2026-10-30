package main

import (
	"bytes"
	"flag"
	"fmt"
	"math"
	"math/rand"
	"net/http"
	"os"
	"os/exec"
	"strconv"
	"strings"

	"github.com/samuelpmahan/gondola/gobi"
	"github.com/samuelpmahan/gondola/inertia"
	"github.com/samuelpmahan/gondola/inertia/oracle"
	"github.com/samuelpmahan/gondola/wire"
)

// checkInertia grades the Go Inertia server against Inertia itself (@inertiajs/react and @inertiajs/core, React 19, jsdom):
//  1. the first paint of seeded random Nodes, as a page and as a page inside a layout, byte for byte against Inertia's
//     own server-side rendering;
//  2. the tests of ./inertia/... (the rules table, which asks Inertia again for every row, and the protocol checks that
//     run Inertia's own client in jsdom against the Go handler over HTTP).
//
// It prints a few lines, writes the full report to a file and a receipt (versions, hashes of the inputs, verdict) in the
// style of EXPECTED.json.
func checkInertia(args []string) int {
	flags := flag.NewFlagSet("check inertia", flag.ContinueOnError)
	cases := flags.Int("cases", 5000, "number of random pages")
	seed := flags.Int("seed", 20261031, "random seed")
	reportPath := flags.String("report", "build/check-inertia.report", "full report file")
	expectPath := flags.String("expect", "", "EXPECTED-INERTIA.json to compare receipts against")
	writeExpected := flags.String("write-expected", "", "write EXPECTED-INERTIA.json here")
	if flags.Parse(args) != nil {
		fmt.Println("ERROR usage: check inertia [--cases n] [--seed n] [--report path] [--expect path | --write-expected path]")
		return 2
	}
	if err := os.MkdirAll("build", 0o755); err != nil {
		return infrastructure(err)
	}
	if err := writeReactMap("react-map.gen.mjs"); err != nil {
		return infrastructure(err)
	}
	versions, err := oracle.Versions()
	if err != nil {
		return infrastructure(err)
	}
	casesJSON, err := runNode("gen-cases.mjs", strconv.Itoa(*seed), strconv.Itoa(*cases))
	if err != nil {
		return infrastructure(err)
	}
	inputs, err := wire.DecodeCases(casesJSON)
	if err != nil {
		return infrastructure(err)
	}

	// 1. The random pages.
	app, handler := sweepApp(inputs)
	var lines, failures []string
	for i, input := range inputs {
		path := "/?i=" + strconv.Itoa(i)
		got, want, err := oracle.FirstPaint(app, handler, path)
		switch {
		case err != nil:
			failures = append(failures, "ERROR "+input.Name+" "+firstLine(err.Error()))
			lines = append(lines, failures[len(failures)-1])
		case got != want:
			failures = append(failures, failureLine(input.Name, want, got))
			lines = append(lines, failures[len(failures)-1])
		default:
			lines = append(lines, fmt.Sprintf("ok %s %s", input.Name, hashHex([]byte(want))))
		}
	}
	summary := summaryLine(len(inputs), len(failures))
	fmt.Println(summary)

	// 1b. Random props: the escaping and ordering rules of the data-page script.
	propsApp, propsHandler, propsHash := propsApp(*seed, *cases/5)
	propsFailures := 0
	for i := 0; i < *cases/5; i++ {
		name := fmt.Sprintf("props-%05d", i)
		got, want, err := oracle.FirstPaint(propsApp, propsHandler, "/?i="+strconv.Itoa(i))
		switch {
		case err != nil:
			propsFailures++
			failures = append(failures, "ERROR "+name+" "+firstLine(err.Error()))
			lines = append(lines, failures[len(failures)-1])
		case got != want:
			propsFailures++
			failures = append(failures, failureLine(name, want, got))
			lines = append(lines, failures[len(failures)-1])
		default:
			lines = append(lines, fmt.Sprintf("ok %s %s", name, hashHex([]byte(want))))
		}
	}
	fmt.Println(propsSummary(*cases/5, propsFailures))

	// 2. The tests of the Inertia packages.
	testSummary, testOutput, testsOK := runInertiaTests()
	lines = append(lines, summary, testSummary)
	report := []byte(strings.Join(lines, "\n") + "\n")
	if err := os.WriteFile(*reportPath, append(report, testOutput...), 0o644); err != nil {
		return infrastructure(err)
	}
	fmt.Println(testSummary)
	if !testsOK {
		fmt.Println("full output:", *reportPath)
	}
	for i, failure := range failures {
		if i == 5 {
			break
		}
		fmt.Println(failure)
	}
	status := 0
	if len(failures) > 0 || !testsOK {
		status = 1
	}

	rules, _ := os.ReadFile("inertia/rules_recorded_test.go")
	receipt := map[string]any{
		"inertiaCore": versions["inertiaCore"], "inertiaReact": versions["inertiaReact"], "jsdom": versions["jsdom"],
		"react": versions["react"], "reactDom": versions["reactDom"],
		"seed": *seed, "cases": *cases, "casesSha256": hashHex(casesJSON), "propsSha256": propsHash,
		"rulesSha256": hashHex(rules), "verdictSha256": hashHex(report), "verdict": summary + "; " + propsSummary(*cases/5, propsFailures) + "; " + testSummary,
	}
	if *writeExpected != "" {
		if err := os.WriteFile(*writeExpected, orderedReceiptFields(receipt, inertiaReceiptFields), 0o644); err != nil {
			return infrastructure(err)
		}
		fmt.Println("wrote", *writeExpected)
	}
	if *expectPath != "" && !compareReceiptFields(*expectPath, receipt, inertiaReceiptFields) {
		status = 1
	}
	return status
}

var inertiaReceiptFields = []string{"inertiaCore", "inertiaReact", "jsdom", "react", "reactDom", "seed", "cases", "casesSha256", "propsSha256", "rulesSha256", "verdictSha256", "verdict"}

// sweepApp makes an App whose page "Case" draws the i-th random Node (the query says which), alone for an even i and
// inside a layout that puts text around the page for an odd i, so that text runs touching across a layout are tested too.
func sweepApp(inputs []wire.Case) (*inertia.App, http.Handler) {
	app := inertia.New("sweep")
	index := func(props inertia.Props) int { n, _ := props["i"].(float64); return int(n) }
	app.Layout("frame", func(props inertia.Props, page gobi.Node) gobi.Node {
		return gobi.El("div", gobi.Txt("["), page, gobi.Txt("]"))
	})
	app.Page("Alone", func(props inertia.Props) gobi.Node { return inputs[index(props)].Node })
	app.Page("Framed", func(props inertia.Props) gobi.Node { return inputs[index(props)].Node }, "frame")
	return app, http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		i, _ := strconv.Atoi(r.URL.Query().Get("i"))
		component := "Alone"
		if i%2 == 1 {
			component = "Framed"
		}
		app.Render(w, r, component, inertia.Props{"i": i})
	})
}

// runInertiaTests runs `go test ./inertia/...` and says in one line how many tests passed.
func runInertiaTests() (summary, output string, ok bool) {
	command := exec.Command("go", "test", "-count=1", "-v", "./inertia/...")
	var out bytes.Buffer
	command.Stdout, command.Stderr = &out, &out
	err := command.Run()
	text := out.String()
	passed, failed := strings.Count(text, "--- PASS"), strings.Count(text, "--- FAIL")
	rows := len(strings.Split(strings.TrimSpace(grepLines(text, "--- PASS: TestRulesAgainstInertia/")), "\n"))
	if err != nil || failed > 0 {
		return fmt.Sprintf("ERROR inertia tests: %d failed, %d passed", failed, passed), text, false
	}
	return fmt.Sprintf("inertia tests pass (%d tests, %d rules re-asked of Inertia)", passed, rows), text, true
}

func grepLines(text, needle string) string {
	var out []string
	for _, line := range strings.Split(text, "\n") {
		if strings.Contains(line, needle) {
			out = append(out, line)
		}
	}
	return strings.Join(out, "\n")
}

func firstLine(s string) string {
	if i := strings.IndexByte(s, '\n'); i >= 0 {
		return s[:i]
	}
	return s
}

func propsSummary(total, differing int) string {
	if differing == 0 {
		return fmt.Sprintf("same over %d prop sets", total)
	}
	return fmt.Sprintf("%d of %d prop sets differ", differing, total)
}

// propsApp makes an App whose page draws a fixed Node from the i-th seeded random prop set, to test how the page object
// is written. It also returns the hash of the prop sets, written as Go's own JSON.
func propsApp(seed, count int) (*inertia.App, http.Handler, string) {
	random := rand.New(rand.NewSource(int64(seed)))
	sets := make([]inertia.Props, count)
	var all strings.Builder
	for i := range sets {
		sets[i] = inertia.Props{}
		for k := 0; k <= random.Intn(5); k++ {
			sets[i][pick(random, keyPool)] = randomValue(random, 0)
		}
		fmt.Fprintf(&all, "%d %q\n", i, fmt.Sprint(sets[i]))
	}
	app := inertia.New("props")
	app.Page("Props", func(inertia.Props) gobi.Node { return gobi.El("p", gobi.Txt("props")) })
	return app, http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		i, _ := strconv.Atoi(r.URL.Query().Get("i"))
		app.Render(w, r, "Props", sets[i])
	}), hashHex([]byte(all.String()))
}

var textPool = []string{"", "plain", "a b", "</script>", "<!--", "-->", "<", ">", "&", "&amp;", "'", `"`, "\\", "/", "//", "a/b", "\n", "\t", "\r\n", "\x00", "\x01", "\x1f", "\x7f",
	"é", "日本語", "🥏", "\u2028", "\u2029", "\ufeff", "\u00a0", "\xed\xa0\x80", "\xed\xb0\x80", "a\xed\xa0\x80b", "%", "%2F", "=", "`", "{", "}", "[", "]", ":", ",", "0", "-0", "1e3", "true", "null"}

var keyPool = []string{"a", "b", "title", "user", "0", "1", "2", "10", "100", "007", "-1", "1.5", "4294967294", "4294967295", "Z", "z", "É", "é", "日", "🥏", "", " ", "</script>", "a/b", "a\"b", "k\xed\xa0\x80"}

var numberPool = []float64{0, math.Copysign(0, -1), 1, -1, 0.5, 0.1, 0.1 + 0.2, 1.5e300, 1e21, 1e20, 123456789012345680000, 1e-6, 1e-7, 5e-324, math.MaxFloat64, 9007199254740991, 9007199254740993, 4294967295, -2.5}

func pick[T any](random *rand.Rand, pool []T) T { return pool[random.Intn(len(pool))] }

func randomValue(random *rand.Rand, depth int) any {
	kinds := 7
	if depth >= 3 {
		kinds = 5
	}
	switch random.Intn(kinds) {
	case 0:
		return nil
	case 1:
		return random.Intn(2) == 0
	case 2, 3:
		if random.Intn(2) == 0 {
			return pick(random, textPool)
		}
		return pick(random, textPool) + pick(random, textPool)
	case 4:
		return pick(random, numberPool)
	case 5:
		list := make([]any, random.Intn(4))
		for i := range list {
			list[i] = randomValue(random, depth+1)
		}
		return list
	default:
		members := map[string]any{}
		for i := random.Intn(4); i > 0; i-- {
			members[pick(random, keyPool)] = randomValue(random, depth+1)
		}
		return members
	}
}
