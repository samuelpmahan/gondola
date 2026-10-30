// Package httplab provides a loopback-only laboratory HTTP server for the
// typed HTTP effects examples. It is intentionally not a production service.
package httplab

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"mime"
	"net/http"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"sync"
	"unicode/utf8"
)

const maxRequestBytes = 65536
const maxSafeID = uint64(9007199254740991)

var lanePattern = regexp.MustCompile(`^[A-Za-z0-9_-]{1,64}$`)

// Server serves static repository files and a deterministic save endpoint.
type Server struct {
	root  string
	files http.Handler

	mu      sync.Mutex
	records map[requestKey]*recordState
}

type requestKey struct {
	lane string
	id   uint64
}

type recordState struct {
	Record
	release    chan struct{}
	released   bool
	finished   bool
	cancelSeen bool
	ctx        context.Context
}

// Record is one retained request observation returned by /api/requests.
type Record struct {
	Lane           string `json:"Lane"`
	ID             uint64 `json:"ID"`
	Value          string `json:"Value"`
	Mode           string `json:"Mode"`
	ResultMode     string `json:"ResultMode"`
	State          string `json:"State"`
	CancelObserved bool   `json:"CancelObserved"`
	Status         int    `json:"Status"`
	ResponseID     uint64 `json:"ResponseID"`
	Error          string `json:"Error"`
}

type request struct {
	ID    uint64
	Value string
}

type reply struct {
	ID    uint64 `json:"ID"`
	Value string `json:"Value"`
	Error string `json:"Error"`
}

// New creates a lab server rooted at root. The root must be an existing
// directory; API paths take precedence over files in that directory.
func New(root string) (*Server, error) {
	if strings.TrimSpace(root) == "" {
		return nil, errors.New("http lab: root must be a directory")
	}
	abs, err := filepath.Abs(root)
	if err != nil {
		return nil, fmt.Errorf("http lab: resolve root: %w", err)
	}
	info, err := os.Stat(abs)
	if err != nil {
		return nil, fmt.Errorf("http lab: stat root: %w", err)
	}
	if !info.IsDir() {
		return nil, fmt.Errorf("http lab: root %q is not a directory", abs)
	}
	return &Server{
		root:    abs,
		files:   http.FileServer(http.Dir(abs)),
		records: make(map[requestKey]*recordState),
	}, nil
}

// ServeHTTP handles reserved laboratory API endpoints and static files.
func (s *Server) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	switch r.URL.Path {
	case "/api/save":
		s.save(w, r)
	case "/api/release":
		s.releaseRequest(w, r)
	case "/api/requests":
		s.listRequests(w, r)
	default:
		if strings.HasPrefix(r.URL.Path, "/api/") || r.URL.Path == "/api" {
			http.NotFound(w, r)
			return
		}
		s.files.ServeHTTP(w, r)
	}
}

func (s *Server) save(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		methodNotAllowed(w, http.MethodPost)
		return
	}
	lane, ok := queryValue(r, "lane")
	if !ok || !lanePattern.MatchString(lane) {
		http.Error(w, "invalid lane", http.StatusBadRequest)
		return
	}
	mode, ok := optionalQueryValue(r, "mode", "success")
	if !ok || !validMode(mode) {
		http.Error(w, "invalid mode", http.StatusBadRequest)
		return
	}
	req, err := decodeRequest(r)
	if err != nil {
		http.Error(w, "invalid request", http.StatusBadRequest)
		return
	}
	key := requestKey{lane: lane, id: req.ID}
	entry := &recordState{
		Record: Record{
			Lane:       lane,
			ID:         req.ID,
			Value:      req.Value,
			Mode:       mode,
			ResultMode: mode,
			State:      "processing",
		},
		release: make(chan struct{}),
		ctx:     r.Context(),
	}
	s.mu.Lock()
	if _, exists := s.records[key]; exists {
		s.mu.Unlock()
		http.Error(w, "duplicate lane and ID", http.StatusConflict)
		return
	}
	s.records[key] = entry
	if mode == "held" {
		entry.State = "held"
		entry.ResultMode = ""
	}
	s.mu.Unlock()
	stopCancel := context.AfterFunc(r.Context(), func() { s.observeCancellation(key, entry) })
	defer stopCancel()

	resultMode := mode
	if mode == "held" {
		select {
		case <-r.Context().Done():
			s.finish(key, entry, "cancelled", 0, 0, "client cancelled", true)
			return
		case <-entry.release:
		}
		s.mu.Lock()
		if entry.cancelSeen || r.Context().Err() != nil {
			s.markCancelledLocked(entry)
			entry.finished = true
			s.mu.Unlock()
			return
		}
		resultMode = entry.ResultMode
		entry.State = "processing"
		s.mu.Unlock()
	}
	if r.Context().Err() != nil {
		s.observeCancellation(key, entry)
		return
	}
	s.respondMode(w, r, key, entry, resultMode)
}

func (s *Server) respondMode(w http.ResponseWriter, r *http.Request, key requestKey, entry *recordState, mode string) {
	if mode == "drop" {
		s.dropResponse(w, key, entry)
		return
	}

	response := reply{ID: entry.ID, Value: entry.Value}
	status := http.StatusOK
	state := "completed"
	var body []byte
	switch mode {
	case "success":
		body, _ = json.Marshal(response)
	case "error":
		response.Value = ""
		response.Error = "server rejected"
		body, _ = json.Marshal(response)
	case "wrong-id":
		response.ID++
		body, _ = json.Marshal(response)
	case "malformed":
		body = []byte(`{"ID":`)
	case "status":
		status = http.StatusServiceUnavailable
		response.Value = ""
		response.Error = "service unavailable"
		body, _ = json.Marshal(response)
	default:
		http.Error(w, "invalid mode", http.StatusBadRequest)
		s.finish(key, entry, "completed", http.StatusBadRequest, 0, "invalid mode", false)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Cache-Control", "no-store")
	w.WriteHeader(status)
	_, writeErr := w.Write(body)
	responseID := response.ID
	responseError := response.Error
	if mode == "malformed" {
		responseID = 0
		responseError = "malformed response body"
	}
	if mode == "wrong-id" {
		responseError = "wrong response ID"
	}
	if mode == "status" {
		responseError = "http status 503"
	}
	if writeErr != nil || r.Context().Err() != nil {
		s.finish(key, entry, "cancelled", status, responseID, "client cancelled", true)
		return
	}
	s.finish(key, entry, state, status, responseID, responseError, false)
}

func (s *Server) dropResponse(w http.ResponseWriter, key requestKey, entry *recordState) {
	const declaredLength = 128
	prefix := []byte(`{"ID":`)
	if hijacker, ok := w.(http.Hijacker); ok {
		connection, buffered, err := hijacker.Hijack()
		if err != nil {
			s.finish(key, entry, "dropped", 0, 0, "connection dropped", false)
			return
		}
		_, headerErr := fmt.Fprintf(buffered, "HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nCache-Control: no-store\r\nContent-Length: %d\r\nConnection: close\r\n\r\n", declaredLength)
		if headerErr == nil {
			_, headerErr = buffered.Write(prefix)
		}
		if headerErr == nil {
			headerErr = buffered.Flush()
		}
		status := http.StatusOK
		if headerErr != nil {
			status = 0
		}
		// Headers have already told the client a response began, so closing
		// with an incomplete declared body fails body consumption without
		// encouraging the browser to replay the original POST.
		s.finish(key, entry, "dropped", status, 0, "connection dropped", false)
		_ = connection.Close()
		return
	}

	// A non-network ResponseWriter cannot be hijacked. Keep the same wire
	// semantics where flushing is available; production CLI servers implement
	// Hijacker and use the direct close path above.
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Cache-Control", "no-store")
	w.Header().Set("Content-Length", strconv.Itoa(declaredLength))
	w.WriteHeader(http.StatusOK)
	_, writeErr := w.Write(prefix)
	if flusher, ok := w.(http.Flusher); ok {
		flusher.Flush()
	}
	status := http.StatusOK
	if writeErr != nil {
		status = 0
	}
	s.finish(key, entry, "dropped", status, 0, "connection dropped", false)
}

func (s *Server) releaseRequest(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		methodNotAllowed(w, http.MethodPost)
		return
	}
	lane, ok := queryValue(r, "lane")
	if !ok || !lanePattern.MatchString(lane) {
		http.Error(w, "invalid lane", http.StatusBadRequest)
		return
	}
	idText, ok := queryValue(r, "id")
	if !ok {
		http.Error(w, "invalid ID", http.StatusBadRequest)
		return
	}
	id, err := strconv.ParseUint(idText, 10, 64)
	if err != nil || id == 0 || id > maxSafeID {
		http.Error(w, "invalid ID", http.StatusBadRequest)
		return
	}
	mode, ok := optionalQueryValue(r, "mode", "success")
	if !ok || !releaseMode(mode) {
		http.Error(w, "invalid release mode", http.StatusBadRequest)
		return
	}
	key := requestKey{lane: lane, id: id}
	s.mu.Lock()
	entry, exists := s.records[key]
	if !exists {
		s.mu.Unlock()
		http.NotFound(w, r)
		return
	}
	if entry.Mode != "held" || entry.State != "held" || entry.released {
		alreadyReleased := entry.released || entry.finished || entry.State == "cancelled"
		s.mu.Unlock()
		if alreadyReleased {
			http.Error(w, "request already released", http.StatusConflict)
		} else {
			http.NotFound(w, r)
		}
		return
	}
	if entry.ctx.Err() != nil {
		s.markCancelledLocked(entry)
		entry.finished = true
		s.mu.Unlock()
		http.Error(w, "request was cancelled", http.StatusConflict)
		return
	}
	entry.released = true
	entry.ResultMode = mode
	close(entry.release)
	s.mu.Unlock()
	writeJSON(w, http.StatusAccepted, map[string]any{"released": true, "lane": lane, "id": id, "mode": mode})
}

func (s *Server) listRequests(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		methodNotAllowed(w, http.MethodGet)
		return
	}
	lane, ok := queryValue(r, "lane")
	if !ok || !lanePattern.MatchString(lane) {
		http.Error(w, "invalid lane", http.StatusBadRequest)
		return
	}
	s.mu.Lock()
	records := make([]Record, 0)
	for key, entry := range s.records {
		if key.lane == lane {
			records = append(records, entry.Record)
		}
	}
	s.mu.Unlock()
	sort.Slice(records, func(i, j int) bool { return records[i].ID < records[j].ID })
	writeJSON(w, http.StatusOK, map[string]any{"lane": lane, "requests": records})
}

func (s *Server) observeCancellation(key requestKey, entry *recordState) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.records[key] == entry && !entry.finished {
		s.markCancelledLocked(entry)
	}
}

func (s *Server) markCancelledLocked(entry *recordState) {
	entry.cancelSeen = true
	entry.CancelObserved = true
	entry.State = "cancelled"
	entry.Error = "client cancelled"
}

func (s *Server) finish(key requestKey, entry *recordState, state string, status int, responseID uint64, responseError string, canceled bool) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.records[key] != entry {
		return
	}
	if canceled || entry.ctx.Err() != nil || entry.cancelSeen {
		s.markCancelledLocked(entry)
	} else {
		entry.State = state
		entry.Status = status
		entry.ResponseID = responseID
		entry.Error = responseError
	}
	entry.finished = true
}

func decodeRequest(r *http.Request) (request, error) {
	mediaType, _, err := mime.ParseMediaType(r.Header.Get("Content-Type"))
	if err != nil || mediaType != "application/json" {
		return request{}, errors.New("content type must be application/json")
	}
	body, err := io.ReadAll(io.LimitReader(r.Body, maxRequestBytes+1))
	if err != nil || len(body) > maxRequestBytes || !utf8.Valid(body) {
		return request{}, errors.New("request body is unreadable or too large")
	}
	decoder := json.NewDecoder(bytes.NewReader(body))
	open, err := decoder.Token()
	if err != nil || open != json.Delim('{') {
		return request{}, errors.New("request must be a JSON object")
	}
	fields := make(map[string]json.RawMessage, 2)
	for decoder.More() {
		token, err := decoder.Token()
		if err != nil {
			return request{}, err
		}
		name, ok := token.(string)
		if !ok {
			return request{}, errors.New("object key must be a string")
		}
		if _, exists := fields[name]; exists {
			return request{}, fmt.Errorf("duplicate field %q", name)
		}
		var raw json.RawMessage
		if err := decoder.Decode(&raw); err != nil {
			return request{}, err
		}
		fields[name] = raw
	}
	closeToken, err := decoder.Token()
	if err != nil || closeToken != json.Delim('}') {
		return request{}, errors.New("request object is incomplete")
	}
	var trailing any
	if err := decoder.Decode(&trailing); err != io.EOF {
		return request{}, errors.New("request must contain one JSON value")
	}
	if len(fields) != 2 || fields["ID"] == nil || fields["Value"] == nil {
		return request{}, errors.New("request must contain exactly ID and Value")
	}
	idRaw := bytes.TrimSpace(fields["ID"])
	if len(idRaw) == 0 || idRaw[0] < '0' || idRaw[0] > '9' {
		return request{}, errors.New("ID must be a positive integer")
	}
	var id json.Number
	if err := json.Unmarshal(idRaw, &id); err != nil {
		return request{}, errors.New("ID must be a positive integer")
	}
	idValue, err := strconv.ParseUint(string(id), 10, 64)
	if err != nil || idValue == 0 || idValue > maxSafeID {
		return request{}, errors.New("ID is outside the safe integer range")
	}
	valueRaw := bytes.TrimSpace(fields["Value"])
	if len(valueRaw) == 0 || valueRaw[0] != '"' {
		return request{}, errors.New("Value must be a string")
	}
	var value string
	if err := json.Unmarshal(valueRaw, &value); err != nil {
		return request{}, errors.New("Value must be a string")
	}
	return request{ID: idValue, Value: value}, nil
}

func validMode(mode string) bool {
	switch mode {
	case "success", "error", "wrong-id", "malformed", "status", "drop", "held":
		return true
	default:
		return false
	}
}

func releaseMode(mode string) bool {
	return mode == "success" || mode == "error" || mode == "wrong-id" || mode == "malformed" || mode == "status" || mode == "drop"
}

func queryValue(r *http.Request, name string) (string, bool) {
	values, ok := r.URL.Query()[name]
	returnOne := ok && len(values) == 1 && values[0] != ""
	if !returnOne {
		return "", false
	}
	return values[0], true
}

func optionalQueryValue(r *http.Request, name, fallback string) (string, bool) {
	values, exists := r.URL.Query()[name]
	if !exists {
		return fallback, true
	}
	if len(values) != 1 || values[0] == "" {
		return "", false
	}
	return values[0], true
}

func methodNotAllowed(w http.ResponseWriter, allowed string) {
	w.Header().Set("Allow", allowed)
	http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
}

func writeJSON(w http.ResponseWriter, status int, value any) {
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Cache-Control", "no-store")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(value)
}
