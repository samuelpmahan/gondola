package main

import (
	"encoding/json"
	"flag"
	"fmt"
	"log"
	"net"
	"net/http"
	"os"
	"strings"

	"github.com/samuelpmahan/gondola/httplab"
)

type readiness struct {
	URL string `json:"url"`
}

func main() {
	addr := flag.String("addr", "127.0.0.1:0", "loopback listen address")
	root := flag.String("root", ".", "static file root")
	flag.Parse()
	if flag.NArg() != 0 {
		log.Fatal("http-lab does not accept positional arguments")
	}
	if err := requireLoopback(*addr); err != nil {
		log.Fatal(err)
	}
	server, err := httplab.New(*root)
	if err != nil {
		log.Fatal(err)
	}
	listener, err := net.Listen("tcp", *addr)
	if err != nil {
		log.Fatal(err)
	}
	url := "http://" + listener.Addr().String()
	if strings.HasPrefix(listener.Addr().String(), "[::1]:") {
		url = "http://[::1]:" + strings.TrimPrefix(listener.Addr().String(), "[::1]:")
	}
	if err := json.NewEncoder(os.Stdout).Encode(readiness{URL: url}); err != nil {
		_ = listener.Close()
		log.Fatal(err)
	}
	if err := http.Serve(listener, server); err != nil && err != http.ErrServerClosed {
		log.Fatal(err)
	}
}

func requireLoopback(addr string) error {
	host, port, err := net.SplitHostPort(addr)
	if err != nil || port == "" {
		return fmt.Errorf("http-lab: address must be a loopback host and port")
	}
	ip := net.ParseIP(host)
	if host != "localhost" && (ip == nil || !ip.IsLoopback()) {
		return fmt.Errorf("http-lab: refusing non-loopback address %q", host)
	}
	return nil
}
