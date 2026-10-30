package httpwire

import (
	"strings"
	"testing"

	"github.com/samuelpmahan/gondola/asyncsave"
)

func TestEncodeRequestUsesExactTypedShape(t *testing.T) {
	got, err := EncodeRequest(17, "line \"one\"\\two\n雪")
	if err != nil {
		t.Fatalf("EncodeRequest() error = %v", err)
	}
	want := `{"ID":17,"Value":"line \"one\"\\two\n雪"}`
	if string(got) != want {
		t.Fatalf("EncodeRequest() = %s, want %s", got, want)
	}
}

func TestEncodeRequestRejectsIDsOutsideJavaScriptSafeRange(t *testing.T) {
	for _, id := range []uint64{0, asyncsave.MaxID + 1} {
		if got, err := EncodeRequest(id, "value"); err == nil {
			t.Errorf("EncodeRequest(%d) = %s, want error", id, got)
		}
	}
}

func TestEncodeRequestRejectsInvalidUTF8Values(t *testing.T) {
	if got, err := EncodeRequest(1, string([]byte{0xff})); err == nil {
		t.Fatalf("EncodeRequest() = %s, want invalid UTF-8 error", got)
	}
}

func TestDecodeResponseAcceptsOnlyExactCorrelatedReply(t *testing.T) {
	for _, tc := range []struct {
		name, body string
		want       asyncsave.Reply
	}{
		{
			name: "success",
			body: `{"ID":7,"Value":"saved exactly","Error":""}`,
			want: asyncsave.Reply{ID: 7, Value: "saved exactly"},
		},
		{
			name: "server error payload",
			body: `{"ID":7,"Value":"partial","Error":"rejected"}`,
			want: asyncsave.Reply{ID: 7, Value: "partial", Error: "rejected"},
		},
		{
			name: "escaped duplicate property name",
			body: `{"ID":7,"I\u0044":7,"Value":"x","Error":""}`,
			want: asyncsave.Reply{ID: 7, Error: "invalid response"},
		},
	} {
		t.Run(tc.name, func(t *testing.T) {
			got := DecodeResponse(7, 200, []byte(tc.body))
			if got != tc.want {
				t.Fatalf("DecodeResponse() = %#v, want %#v", got, tc.want)
			}
		})
	}
}

func TestDecodeResponseAlwaysCorrelatesExpectedID(t *testing.T) {
	got := DecodeResponse(99, 503, []byte("not json"))
	want := asyncsave.Reply{ID: 99, Error: "http status 503"}
	if got != want {
		t.Fatalf("DecodeResponse() = %#v, want %#v", got, want)
	}

	got = DecodeResponse(99, 200, []byte(`{"ID":1,"Value":"wrong","Error":""}`))
	want = asyncsave.Reply{ID: 99, Error: "invalid response"}
	if got != want {
		t.Fatalf("DecodeResponse() = %#v, want %#v", got, want)
	}
}

func TestDecodeResponseEnforcesSafeResponseIDRange(t *testing.T) {
	for _, tc := range []struct {
		name       string
		expectedID uint64
		body       string
		want       asyncsave.Reply
	}{
		{
			name:       "zero response ID",
			expectedID: 0,
			body:       `{"ID":0,"Value":"zero","Error":""}`,
			want:       asyncsave.Reply{ID: 0, Error: "invalid response"},
		},
		{
			name:       "negative response ID",
			expectedID: 1,
			body:       `{"ID":-1,"Value":"negative","Error":""}`,
			want:       asyncsave.Reply{ID: 1, Error: "invalid response"},
		},
		{
			name:       "above maximum safe response ID",
			expectedID: asyncsave.MaxID + 1,
			body:       `{"ID":9007199254740992,"Value":"unsafe","Error":""}`,
			want:       asyncsave.Reply{ID: asyncsave.MaxID + 1, Error: "invalid response"},
		},
	} {
		t.Run(tc.name, func(t *testing.T) {
			if got := DecodeResponse(tc.expectedID, 200, []byte(tc.body)); got != tc.want {
				t.Fatalf("DecodeResponse() = %#v, want %#v", got, tc.want)
			}
		})
	}

	maxSafeBody := []byte(`{"ID":9007199254740991,"Value":"max-safe","Error":""}`)
	want := asyncsave.Reply{ID: asyncsave.MaxID, Value: "max-safe"}
	if got := DecodeResponse(asyncsave.MaxID, 200, maxSafeBody); got != want {
		t.Fatalf("maximum safe response ID decoded to %#v, want %#v", got, want)
	}
}

func TestDecodeResponseRejectsInvalidShapes(t *testing.T) {
	for _, body := range []string{
		``,
		`{`,
		`null`,
		`[]`,
		`{"ID":7,"Value":"x"}`,
		`{"ID":7,"Value":"x","Error":"","Extra":true}`,
		`{"ID":7,"ID":7,"Value":"x","Error":""}`,
		`{"ID":7,"Value":"x","Value":"x","Error":""}`,
		`{"ID":7,"Value":"x","Error":"","Error":""}`,
		`{"ID":"7","Value":"x","Error":""}`,
		`{"ID":7.0,"Value":"x","Error":""}`,
		`{"ID":7e0,"Value":"x","Error":""}`,
		`{"ID":7,"Value":null,"Error":""}`,
		`{"ID":7,"Value":"x","Error":false}`,
		`{"ID":7,"Value":"x","Error":""} {}`,
		`{"ID":7,"Value":"x","Error":""} garbage`,
	} {
		t.Run(body, func(t *testing.T) {
			got := DecodeResponse(7, 200, []byte(body))
			want := asyncsave.Reply{ID: 7, Error: "invalid response"}
			if got != want {
				t.Fatalf("DecodeResponse() = %#v, want %#v", got, want)
			}
		})
	}
}

func TestDecodeResponseEnforcesBodyLimit(t *testing.T) {
	base := `{"ID":7,"Value":"x","Error":""}`
	if len(base) > MaxResponseBytes {
		t.Fatal("test fixture exceeds max response size")
	}
	accepted := base + strings.Repeat(" ", MaxResponseBytes-len(base))
	if got := DecodeResponse(7, 200, []byte(accepted)); got != (asyncsave.Reply{ID: 7, Value: "x"}) {
		t.Fatalf("exactly max-sized valid body rejected: %#v", got)
	}
	tooLarge := accepted + " "
	if got := DecodeResponse(7, 200, []byte(tooLarge)); got != (asyncsave.Reply{ID: 7, Error: "invalid response"}) {
		t.Fatalf("oversized body accepted: %#v", got)
	}
}

func TestDecodeResponseRejectsInvalidUTF8(t *testing.T) {
	body := []byte(`{"ID":7,"Value":"x`)
	body = append(body, 0xff)
	body = append(body, []byte(`","Error":""}`)...)
	if got := DecodeResponse(7, 200, body); got != (asyncsave.Reply{ID: 7, Error: "invalid response"}) {
		t.Fatalf("DecodeResponse() = %#v, want invalid response", got)
	}
}

func TestDecodeResponseRejectsUnpairedSurrogatesAndAcceptsPairs(t *testing.T) {
	for _, body := range []string{
		`{"ID":7,"Value":"\uD800","Error":""}`,
		`{"ID":7,"Value":"\uDC00","Error":""}`,
		`{"ID":7,"Value":"\uD800\u0041","Error":""}`,
	} {
		if got := DecodeResponse(7, 200, []byte(body)); got != (asyncsave.Reply{ID: 7, Error: "invalid response"}) {
			t.Errorf("DecodeResponse(%s) = %#v, want invalid response", body, got)
		}
	}
	got := DecodeResponse(7, 200, []byte(`{"ID":7,"Value":"\uD83E\uDDEA","Error":""}`))
	want := asyncsave.Reply{ID: 7, Value: "🧪"}
	if got != want {
		t.Fatalf("valid surrogate pair decoded to %#v, want %#v", got, want)
	}
}
