package main

import (
	"bytes"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"flag"
	"fmt"
	"os"
	"os/exec"
	"strconv"
	"strings"

	"github.com/samuelpmahan/gondola/gobi"
	"github.com/samuelpmahan/gondola/wire"
)

// checkHTML generates seeded random Nodes, renders each with Go's gobi.HTML and with React 19.3.1 (through node), and
// compares the bytes. It prints at most a few lines and writes the full report to a file.
func checkHTML(args []string) int {
	flags := flag.NewFlagSet("check html", flag.ContinueOnError)
	cases := flags.Int("cases", 5000, "number of cases")
	seed := flags.Int("seed", 20261030, "random seed")
	fast := flags.Bool("fast", false, "check only a deterministic 10% sample chosen by --agent")
	agent := flags.Int("agent", 0, "agent number 0-9 for --fast")
	reportPath := flags.String("report", "build/check-html.report", "full report file")
	expectPath := flags.String("expect", "", "EXPECTED.json to compare receipts against")
	writeExpected := flags.String("write-expected", "", "write EXPECTED.json here")
	if flags.Parse(args) != nil || *agent < 0 || *agent > 9 || (*fast && *writeExpected != "") {
		fmt.Println("ERROR usage: check html [--cases n] [--seed n] [--fast --agent 0-9] [--report path] [--expect path | --write-expected path (not with --fast)]")
		return 2
	}
	if err := os.MkdirAll("build", 0o755); err != nil {
		return infrastructure(err)
	}
	if err := writeReactMap("react-map.gen.mjs"); err != nil {
		return infrastructure(err)
	}
	generate := []string{"gen-cases.mjs", strconv.Itoa(*seed), strconv.Itoa(*cases)}
	if *fast {
		generate = append(generate, strconv.Itoa(*agent))
	}
	casesJSON, err := runNode(generate...)
	if err != nil {
		return infrastructure(err)
	}
	if err := os.WriteFile("build/cases.json", casesJSON, 0o644); err != nil {
		return infrastructure(err)
	}
	if _, err := runNode("react-side.mjs", "build/cases.json", "build/react.json"); err != nil {
		return infrastructure(err)
	}
	reactJSON, err := os.ReadFile("build/react.json")
	if err != nil {
		return infrastructure(err)
	}
	inputs, err := wire.DecodeCases(casesJSON)
	if err != nil {
		return infrastructure(err)
	}
	results, err := wire.DecodeResults(reactJSON)
	if err != nil || len(results) != len(inputs) {
		return infrastructure(fmt.Errorf("react side answered %d of %d cases: %v", len(results), len(inputs), err))
	}
	var lines, failures []string
	for i, input := range inputs {
		want := results[i].HTML
		if results[i].Error != "" {
			want = "<React error: " + results[i].Error + ">"
		}
		got := gobi.HTML(input.Node)
		if results[i].Error == "" && want == got {
			lines = append(lines, fmt.Sprintf("ok %s %s", input.Name, hashHex([]byte(want))))
			continue
		}
		failure := failureLine(input.Name, want, got)
		lines = append(lines, failure)
		failures = append(failures, failure)
	}
	summary := summaryLine(len(inputs), len(failures))
	report := []byte(strings.Join(append(lines, summary), "\n") + "\n")
	if err := os.WriteFile(*reportPath, report, 0o644); err != nil {
		return infrastructure(err)
	}
	for i, failure := range failures {
		if i == 5 {
			break
		}
		fmt.Println(failure)
	}
	if len(failures) == 0 {
		if *fast {
			fmt.Printf("%s (fast sample, agent %d)\n", summary, *agent)
		} else {
			fmt.Println(summary)
		}
	} else {
		fmt.Printf("%s; full report: %s\n", summary, *reportPath)
	}
	status := 0
	if len(failures) > 0 {
		status = 1
	}
	versions, err := runNode("react-side.mjs", "--versions")
	if err != nil {
		return infrastructure(err)
	}
	receipt := map[string]any{}
	if json.Unmarshal(versions, &receipt) != nil {
		return infrastructure(fmt.Errorf("bad versions line %q", versions))
	}
	receipt["seed"] = *seed
	receipt["cases"] = *cases
	receipt["casesSha256"] = hashHex(casesJSON)
	receipt["verdictSha256"] = hashHex(report)
	receipt["verdict"] = summary
	if *writeExpected != "" {
		if err := os.WriteFile(*writeExpected, orderedReceipt(receipt), 0o644); err != nil {
			return infrastructure(err)
		}
		fmt.Println("wrote", *writeExpected)
	}
	if *expectPath != "" && !*fast {
		if !compareReceipt(*expectPath, receipt) {
			status = 1
		}
	}
	return status
}

func infrastructure(err error) int {
	fmt.Println("ERROR infrastructure:", err)
	return 2
}

func runNode(args ...string) ([]byte, error) {
	command := exec.Command("node", args...)
	var stderr bytes.Buffer
	command.Stderr = &stderr
	out, err := command.Output()
	if err != nil {
		return nil, fmt.Errorf("node %s: %v: %s", strings.Join(args, " "), err, strings.TrimSpace(stderr.String()))
	}
	return out, nil
}

func hashHex(data []byte) string {
	sum := sha256.Sum256(data)
	return hex.EncodeToString(sum[:])
}

// failureLine is one report line: the case name, what React wrote and what Go wrote, all on one line.
func failureLine(name, want, got string) string {
	return "ERROR " + name + " want " + wire.Quote(want) + " got " + wire.Quote(got)
}

func summaryLine(total, differing int) string {
	if differing == 0 {
		return fmt.Sprintf("same over %d inputs", total)
	}
	return fmt.Sprintf("%d of %d inputs differ", differing, total)
}

var receiptFields = []string{"react", "reactDom", "fastCheck", "seed", "cases", "casesSha256", "verdictSha256", "verdict"}

// orderedReceipt writes the receipt as indented JSON with the keys in a fixed order.
func orderedReceipt(receipt map[string]any) []byte {
	return orderedReceiptFields(receipt, receiptFields)
}

func orderedReceiptFields(receipt map[string]any, receiptFields []string) []byte {
	var b strings.Builder
	b.WriteString("{\n")
	for i, field := range receiptFields {
		value, _ := json.Marshal(receipt[field])
		b.WriteString("  \"" + field + "\": " + string(value))
		if i < len(receiptFields)-1 {
			b.WriteByte(',')
		}
		b.WriteByte('\n')
	}
	b.WriteString("}\n")
	return []byte(b.String())
}

// compareReceipt prints one ERROR line per field that differs from the expected file, or "receipt matches".
func compareReceipt(path string, receipt map[string]any) bool {
	return compareReceiptFields(path, receipt, receiptFields)
}

func compareReceiptFields(path string, receipt map[string]any, receiptFields []string) bool {
	data, err := os.ReadFile(path)
	if err != nil {
		fmt.Println("ERROR receipt:", err)
		return false
	}
	expected := map[string]any{}
	if err := json.Unmarshal(data, &expected); err != nil {
		fmt.Println("ERROR receipt:", err)
		return false
	}
	matches := true
	for _, field := range receiptFields {
		want, _ := json.Marshal(expected[field])
		got, _ := json.Marshal(receipt[field])
		if string(want) != string(got) {
			fmt.Printf("ERROR receipt: %s expected %s got %s\n", field, want, got)
			matches = false
		}
	}
	if matches {
		fmt.Println("receipt matches")
	}
	return matches
}
