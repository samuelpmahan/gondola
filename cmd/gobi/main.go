// gobi is the build-time command: `gobi emit react` writes the React backend's generated mapping, and
// `gobi check html` renders random Nodes with Go and with React 19.3.1 and compares the bytes, and `gobi check inertia`
// grades the Inertia server against Inertia itself.
package main

import (
	"fmt"
	"os"
)

func main() {
	if len(os.Args) >= 3 && os.Args[1] == "emit" && os.Args[2] == "react" {
		os.Exit(emitReact(os.Args[3:]))
	}
	if len(os.Args) >= 3 && os.Args[1] == "check" && os.Args[2] == "html" {
		os.Exit(checkHTML(os.Args[3:]))
	}
	if len(os.Args) >= 3 && os.Args[1] == "check" && os.Args[2] == "inertia" {
		os.Exit(checkInertia(os.Args[3:]))
	}
	if len(os.Args) >= 3 && os.Args[1] == "hunt" && os.Args[2] == "html" {
		os.Exit(huntHTML(os.Args[3:]))
	}
	fmt.Fprintln(os.Stderr, "usage: gobi emit react [--out path] | gobi hunt html (shrink the failures of the last check) | gobi check inertia [--cases n] [--seed n] [--expect path] | gobi check html [--cases n] [--seed n] [--fast --agent k] [--report path]")
	os.Exit(2)
}
