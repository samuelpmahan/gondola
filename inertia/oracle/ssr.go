package oracle

import (
	"bufio"
	"context"
	"errors"
	"fmt"
	"io"
	"os"
	"strings"
	"sync"

	"github.com/samuelpmahan/gondola/wire"
)

// ssrProcess is Inertia's server-side rendering (inertia-ssr.mjs), kept running between checks because loading React and
// Inertia takes about a second. It stops by itself when this process ends: its standard input closes.
type ssrProcess struct {
	mu     sync.Mutex
	stdin  io.WriteCloser
	stdout *bufio.Reader
	next   int
	dead   bool
}

var ssr struct {
	mu      sync.Mutex
	process *ssrProcess
}

func startSSR() (*ssrProcess, error) {
	command := nodeCommand(context.Background(), "inertia-ssr.mjs")
	command.Stderr = os.Stderr
	stdin, err := command.StdinPipe()
	if err != nil {
		return nil, err
	}
	stdout, err := command.StdoutPipe()
	if err != nil {
		return nil, err
	}
	if err := command.Start(); err != nil {
		return nil, fmt.Errorf("oracle: starting node: %w", err)
	}
	go command.Wait()
	return &ssrProcess{stdin: stdin, stdout: bufio.NewReaderSize(stdout, 1<<20)}, nil
}

// renderBody gives Inertia the page object (the JSON text exactly as Go wrote it in the data-page script) and returns the
// body Inertia's server-side rendering writes for it: the data-page script and the root element.
func renderBody(layersURL, pageJSON string) (string, error) {
	if err := ready(); err != nil {
		return "", err
	}
	ssr.mu.Lock()
	process := ssr.process
	if process == nil || process.dead {
		var err error
		if process, err = startSSR(); err != nil {
			ssr.mu.Unlock()
			return "", err
		}
		ssr.process = process
	}
	ssr.mu.Unlock()
	return process.render(layersURL, pageJSON)
}

func (p *ssrProcess) render(layersURL, pageJSON string) (string, error) {
	p.mu.Lock()
	defer p.mu.Unlock()
	p.next++
	id := fmt.Sprint(p.next)
	line := `{"id":` + id + `,"layers":` + wire.Quote(layersURL) + `,"page":` + wire.Quote(pageJSON) + "}\n"
	if _, err := io.WriteString(p.stdin, line); err != nil {
		p.dead = true
		return "", fmt.Errorf("oracle: Inertia's server-side rendering is not running: %w", err)
	}
	answer, err := p.stdout.ReadString('\n')
	if err != nil {
		p.dead = true
		return "", fmt.Errorf("oracle: Inertia's server-side rendering stopped: %w", err)
	}
	results, err := wire.DecodeResults([]byte(answer))
	if err != nil || len(results) != 1 || results[0].Name != id {
		p.dead = true
		return "", errors.New("oracle: unreadable answer from Inertia's server-side rendering: " + strings.TrimSpace(answer))
	}
	if results[0].Error != "" {
		return "", errors.New("Inertia's server-side rendering failed: " + results[0].Error)
	}
	return results[0].HTML, nil
}
