package httplab

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"testing"
	"time"
)

func testServer(t *testing.T) (*Server, *httptest.Server) {
	t.Helper()
	root := t.TempDir()
	if err := os.WriteFile(filepath.Join(root, "index.html"), []byte("lab-root"), 0o644); err != nil {
		t.Fatal(err)
	}
	server, err := New(root)
	if err != nil {
		t.Fatal(err)
	}
	httpServer := httptest.NewServer(server)
	t.Cleanup(httpServer.Close)
	return server, httpServer
}

func postSave(t *testing.T, baseURL, lane, mode string, id int, value string) *http.Response {
	t.Helper()
	body := `{"ID":` + strconv.Itoa(id) + `,"Value":` + jsonString(value) + `}`
	url := baseURL + "/api/save?lane=" + lane
	if mode != "" {
		url += "&mode=" + mode
	}
	request, err := http.NewRequest(http.MethodPost, url, strings.NewReader(body))
	if err != nil {
		t.Fatal(err)
	}
	request.Header.Set("Content-Type", "application/json")
	response, err := http.DefaultClient.Do(request)
	if err != nil {
		t.Fatal(err)
	}
	return response
}

func jsonString(value string) string {
	encoded, _ := json.Marshal(value)
	return string(encoded)
}

func TestSuccessErrorAndStatusModes(t *testing.T) {
	_, server := testServer(t)
	for _, test := range []struct {
		mode       string
		requestID  int
		inputValue string
		status     int
		wantID     int
		wantValue  string
		wantError  string
		bodyIsJSON bool
	}{
		{"success", 1, "hello", http.StatusOK, 1, "hello", "", true},
		{"error", 2, "rejected", http.StatusOK, 2, "", "server rejected", true},
		{"wrong-id", 3, "wrong", http.StatusOK, 4, "wrong", "", true},
		{"status", 5, "unavailable", http.StatusServiceUnavailable, 5, "", "service unavailable", true},
		{"malformed", 6, "malformed", http.StatusOK, 0, "", "", false},
	} {
		t.Run(test.mode, func(t *testing.T) {
			response := postSave(t, server.URL, "test", test.mode, test.requestID, test.inputValue)
			defer response.Body.Close()
			if response.StatusCode != test.status {
				t.Fatalf("status = %d, want %d", response.StatusCode, test.status)
			}
			body, err := io.ReadAll(response.Body)
			if err != nil {
				t.Fatal(err)
			}
			if !test.bodyIsJSON {
				if json.Valid(body) {
					t.Fatalf("malformed mode returned valid JSON %q", body)
				}
				return
			}
			var got wireReply
			if err := json.Unmarshal(body, &got); err != nil {
				t.Fatalf("decode reply: %v (%q)", err, body)
			}
			if got.ID != uint64(test.wantID) || got.Value != test.wantValue || got.Error != test.wantError {
				t.Fatalf("reply = %#v", got)
			}
		})
	}
}

type wireReply struct {
	ID    uint64
	Value string
	Error string
}

func TestStrictRequestValidationAndDuplicatePolicy(t *testing.T) {
	_, server := testServer(t)
	for _, body := range []string{
		`{"ID":1,"Value":"x","Extra":true}`,
		`{"ID":1,"ID":2,"Value":"x"}`,
		`{"Value":"x"}`,
		`{"ID":1}`,
		`{"ID":"1","Value":"x"}`,
		`{"ID":0,"Value":"x"}`,
		`{"ID":9007199254740992,"Value":"x"}`,
		`{"ID":1.0,"Value":"x"}`,
		`{"ID":1,"Value":3}`,
		`{"ID":1,"Value":null}`,
		`{"ID":1,"Value":false}`,
		`{"ID":1,"Value":"x"} {}`,
		`null`,
	} {
		request, err := http.NewRequest(http.MethodPost, server.URL+"/api/save?lane=validation&mode=success", strings.NewReader(body))
		if err != nil {
			t.Fatal(err)
		}
		request.Header.Set("Content-Type", "application/json")
		response, err := http.DefaultClient.Do(request)
		if err != nil {
			t.Fatal(err)
		}
		response.Body.Close()
		if response.StatusCode != http.StatusBadRequest {
			t.Errorf("body %s: status %d, want 400", body, response.StatusCode)
		}
	}
	invalidUTF8 := string(append([]byte(`{"ID":1,"Value":"`), append([]byte{0xff}, []byte(`"}`)...)...))
	request, err := http.NewRequest(http.MethodPost, server.URL+"/api/save?lane=validation&mode=success", strings.NewReader(invalidUTF8))
	if err != nil {
		t.Fatal(err)
	}
	request.Header.Set("Content-Type", "application/json")
	response, err := http.DefaultClient.Do(request)
	if err != nil {
		t.Fatal(err)
	}
	response.Body.Close()
	if response.StatusCode != http.StatusBadRequest {
		t.Errorf("invalid UTF-8 status = %d, want 400", response.StatusCode)
	}
	largeBody := strings.Repeat(" ", maxRequestBytes+1)
	request, err = http.NewRequest(http.MethodPost, server.URL+"/api/save?lane=validation&mode=success", strings.NewReader(largeBody))
	if err != nil {
		t.Fatal(err)
	}
	request.Header.Set("Content-Type", "application/json")
	response, err = http.DefaultClient.Do(request)
	if err != nil {
		t.Fatal(err)
	}
	response.Body.Close()
	if response.StatusCode != http.StatusBadRequest {
		t.Errorf("oversize body status = %d, want 400", response.StatusCode)
	}

	first := postSave(t, server.URL, "duplicate", "success", 7, "first")
	first.Body.Close()
	second := postSave(t, server.URL, "duplicate", "success", 7, "second")
	second.Body.Close()
	if first.StatusCode != http.StatusOK || second.StatusCode != http.StatusConflict {
		t.Fatalf("duplicate statuses = %d, %d", first.StatusCode, second.StatusCode)
	}
	var payload requestsPayload
	response, err = http.Get(server.URL + "/api/requests?lane=duplicate")
	if err != nil {
		t.Fatal(err)
	}
	defer response.Body.Close()
	if err := json.NewDecoder(response.Body).Decode(&payload); err != nil {
		t.Fatal(err)
	}
	if len(payload.Requests) != 1 || payload.Requests[0].Value != "first" {
		t.Fatalf("duplicate altered original record: %#v", payload.Requests)
	}
}

func TestHeldReleaseAndRetainedCancellation(t *testing.T) {
	_, server := testServer(t)
	client := &http.Client{}
	request, err := http.NewRequest(http.MethodPost, server.URL+"/api/save?lane=gate&mode=held", strings.NewReader(`{"ID":11,"Value":"pending"}`))
	if err != nil {
		t.Fatal(err)
	}
	request.Header.Set("Content-Type", "application/json")
	responseCh := make(chan *http.Response, 1)
	errCh := make(chan error, 1)
	go func() {
		response, err := client.Do(request)
		if err != nil {
			errCh <- err
			return
		}
		responseCh <- response
	}()

	waitForState(t, server.URL, "gate", 11, "held")
	release, err := http.Post(server.URL+"/api/release?lane=gate&id=11", "", nil)
	if err != nil {
		t.Fatal(err)
	}
	release.Body.Close()
	if release.StatusCode != http.StatusAccepted {
		t.Fatalf("release status = %d", release.StatusCode)
	}
	select {
	case response := <-responseCh:
		defer response.Body.Close()
		var got wireReply
		if err := json.NewDecoder(response.Body).Decode(&got); err != nil {
			t.Fatal(err)
		}
		if got.ID != 11 || got.Value != "pending" || got.Error != "" {
			t.Fatalf("held response = %#v", got)
		}
	case err := <-errCh:
		t.Fatalf("held request failed: %v", err)
	case <-time.After(3 * time.Second):
		t.Fatal("held request did not finish after release")
	}
	waitForState(t, server.URL, "gate", 11, "completed")
	repeatedRelease, err := http.Post(server.URL+"/api/release?lane=gate&id=11", "", nil)
	if err != nil {
		t.Fatal(err)
	}
	repeatedRelease.Body.Close()
	if repeatedRelease.StatusCode != http.StatusConflict {
		t.Fatalf("repeated release status = %d, want 409", repeatedRelease.StatusCode)
	}
	var completedPayload requestsPayload
	completedResponse, err := http.Get(server.URL + "/api/requests?lane=gate")
	if err != nil {
		t.Fatal(err)
	}
	if err := json.NewDecoder(completedResponse.Body).Decode(&completedPayload); err != nil {
		t.Fatal(err)
	}
	completedResponse.Body.Close()
	if len(completedPayload.Requests) != 1 || completedPayload.Requests[0].State != "completed" || completedPayload.Requests[0].CancelObserved {
		t.Fatalf("repeat release changed completed record: %#v", completedPayload.Requests)
	}

	cancelCtx, cancel := context.WithCancel(context.Background())
	cancelRequest, err := http.NewRequestWithContext(cancelCtx, http.MethodPost, server.URL+"/api/save?lane=gate&mode=held", strings.NewReader(`{"ID":12,"Value":"cancel me"}`))
	if err != nil {
		t.Fatal(err)
	}
	cancelRequest.Header.Set("Content-Type", "application/json")
	canceledErr := make(chan error, 1)
	go func() {
		response, err := client.Do(cancelRequest)
		if response != nil {
			response.Body.Close()
		}
		canceledErr <- err
	}()
	waitForState(t, server.URL, "gate", 12, "held")
	cancel()
	select {
	case <-canceledErr:
	case <-time.After(3 * time.Second):
		t.Fatal("client cancellation did not terminate request")
	}
	waitForState(t, server.URL, "gate", 12, "cancelled")
	var payload requestsPayload
	response, err := http.Get(server.URL + "/api/requests?lane=gate")
	if err != nil {
		t.Fatal(err)
	}
	defer response.Body.Close()
	if err := json.NewDecoder(response.Body).Decode(&payload); err != nil {
		t.Fatal(err)
	}
	if len(payload.Requests) != 2 || !payload.Requests[1].CancelObserved {
		t.Fatalf("cancellation not retained: %#v", payload.Requests)
	}
	canceledRelease, err := http.Post(server.URL+"/api/release?lane=gate&id=12", "", nil)
	if err != nil {
		t.Fatal(err)
	}
	canceledRelease.Body.Close()
	if canceledRelease.StatusCode != http.StatusConflict {
		t.Fatalf("release after cancellation status = %d, want 409", canceledRelease.StatusCode)
	}
	var retainedPayload requestsPayload
	retainedResponse, err := http.Get(server.URL + "/api/requests?lane=gate")
	if err != nil {
		t.Fatal(err)
	}
	if err := json.NewDecoder(retainedResponse.Body).Decode(&retainedPayload); err != nil {
		t.Fatal(err)
	}
	retainedResponse.Body.Close()
	if retainedPayload.Requests[1].State != "cancelled" || !retainedPayload.Requests[1].CancelObserved {
		t.Fatalf("release changed canceled record: %#v", retainedPayload.Requests[1])
	}
}

func TestDropClosesSocketAndIsRecorded(t *testing.T) {
	_, server := testServer(t)
	request, err := http.NewRequest(http.MethodPost, server.URL+"/api/save?lane=drop&mode=drop", strings.NewReader(`{"ID":21,"Value":"drop"}`))
	if err != nil {
		t.Fatal(err)
	}
	request.Header.Set("Content-Type", "application/json")
	response, err := http.DefaultClient.Do(request)
	if err != nil {
		t.Fatalf("drop mode did not deliver its partial HTTP response headers: %v", err)
	}
	if response.StatusCode != http.StatusOK {
		response.Body.Close()
		t.Fatalf("drop status = %d, want 200", response.StatusCode)
	}
	body, bodyErr := io.ReadAll(response.Body)
	response.Body.Close()
	if bodyErr == nil || string(body) != `{"ID":` {
		t.Fatalf("drop body = %q, err = %v; expected truncated body and read failure", body, bodyErr)
	}
	waitForState(t, server.URL, "drop", 21, "dropped")
	var payload requestsPayload
	requestsResponse, err := http.Get(server.URL + "/api/requests?lane=drop")
	if err != nil {
		t.Fatal(err)
	}
	if err := json.NewDecoder(requestsResponse.Body).Decode(&payload); err != nil {
		t.Fatal(err)
	}
	requestsResponse.Body.Close()
	if len(payload.Requests) != 1 || payload.Requests[0].Status != http.StatusOK || payload.Requests[0].CancelObserved {
		t.Fatalf("drop record = %#v", payload.Requests)
	}
}

func TestStaticRootAndMethodValidation(t *testing.T) {
	_, server := testServer(t)
	response, err := http.Get(server.URL + "/")
	if err != nil {
		t.Fatal(err)
	}
	body, _ := io.ReadAll(response.Body)
	response.Body.Close()
	if response.StatusCode != http.StatusOK || string(body) != "lab-root" {
		t.Fatalf("static response = %d %q", response.StatusCode, body)
	}
	response, err = http.Get(server.URL + "/api/save?lane=x&mode=success")
	if err != nil {
		t.Fatal(err)
	}
	response.Body.Close()
	if response.StatusCode != http.StatusMethodNotAllowed {
		t.Fatalf("GET save status = %d, want 405", response.StatusCode)
	}
}

func waitForState(t *testing.T, baseURL, lane string, id int, want string) {
	t.Helper()
	deadline := time.Now().Add(3 * time.Second)
	for time.Now().Before(deadline) {
		response, err := http.Get(baseURL + "/api/requests?lane=" + lane)
		if err == nil {
			var payload requestsPayload
			decodeErr := json.NewDecoder(response.Body).Decode(&payload)
			response.Body.Close()
			if decodeErr == nil {
				for _, record := range payload.Requests {
					if record.ID == uint64(id) && record.State == want {
						return
					}
				}
			}
		}
		time.Sleep(time.Millisecond)
	}
	t.Fatalf("request %s/%d did not reach %q", lane, id, want)
}

type requestsPayload struct {
	Lane     string   `json:"lane"`
	Requests []Record `json:"requests"`
}
