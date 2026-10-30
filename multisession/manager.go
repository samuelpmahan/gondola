// Package multisession owns multiple independent collection sessions.
package multisession

import (
	"fmt"
	"sort"
	"sync"

	"github.com/samuelpmahan/gondola/asyncsave"
	"github.com/samuelpmahan/gondola/collection"
)

// SessionID identifies one collection session within a Manager.
type SessionID uint64

// MaxSessionID is the largest SessionID that can cross the JavaScript number
// boundary without losing integer precision.
const MaxSessionID uint64 = asyncsave.MaxID

// Manager owns independent collection sessions and their scoped effects and
// audits. A Manager may be called concurrently; operations for one session are
// serialized with operations for every other session.
type Manager struct {
	mu       sync.Mutex
	nextID   SessionID
	sessions map[SessionID]*collection.Session
}

// NewManager returns an empty manager whose first session ID is 1.
func NewManager() *Manager {
	return &Manager{sessions: make(map[SessionID]*collection.Session)}
}

// Create allocates a fresh session with an ID that is never reused by this
// manager. IDs are bounded to JavaScript's safe integer range.
func (m *Manager) Create() (SessionID, error) {
	m.mu.Lock()
	defer m.mu.Unlock()

	if uint64(m.nextID) >= MaxSessionID {
		return 0, fmt.Errorf("session ID space exhausted at %d", m.nextID)
	}
	m.nextID++
	if m.sessions == nil {
		m.sessions = make(map[SessionID]*collection.Session)
	}
	m.sessions[m.nextID] = collection.NewSession()
	return m.nextID, nil
}

// Snapshot returns the current view for an existing session.
func (m *Manager) Snapshot(id SessionID) (collection.Snapshot, error) {
	m.mu.Lock()
	defer m.mu.Unlock()

	session, err := m.sessionLocked(id)
	if err != nil {
		return collection.Snapshot{}, err
	}
	return session.Snapshot(), nil
}

// Dispatch applies one event only to the addressed session.
func (m *Manager) Dispatch(id SessionID, step collection.Step) (collection.Snapshot, error) {
	m.mu.Lock()
	defer m.mu.Unlock()

	session, err := m.sessionLocked(id)
	if err != nil {
		return collection.Snapshot{}, err
	}
	return session.Dispatch(step)
}

// Effects drains commands queued by the addressed session.
func (m *Manager) Effects(id SessionID) ([]collection.Command, error) {
	m.mu.Lock()
	defer m.mu.Unlock()

	session, err := m.sessionLocked(id)
	if err != nil {
		return nil, err
	}
	return session.Effects(), nil
}

// Complete delivers a reply only to the addressed session.
func (m *Manager) Complete(id SessionID, reply collection.Reply) (collection.Snapshot, error) {
	m.mu.Lock()
	defer m.mu.Unlock()

	session, err := m.sessionLocked(id)
	if err != nil {
		return collection.Snapshot{}, err
	}
	return session.Complete(reply)
}

// Audit returns the completion history for the addressed session.
func (m *Manager) Audit(id SessionID) ([]collection.Outcome, error) {
	m.mu.Lock()
	defer m.mu.Unlock()

	session, err := m.sessionLocked(id)
	if err != nil {
		return nil, err
	}
	return session.Audit(), nil
}

// Dispose returns queued cancel commands in effect order followed by cancels
// for requests that remain pending in current row order, deduplicated by
// request ID. It then removes the session; subsequent calls for id are rejected.
func (m *Manager) Dispose(id SessionID) ([]collection.Command, error) {
	m.mu.Lock()
	defer m.mu.Unlock()

	session, err := m.sessionLocked(id)
	if err != nil {
		return nil, err
	}

	queued := session.Effects()
	rows := session.Snapshot().State.Rows
	commands := collectDisposeCancels(queued, rows)
	delete(m.sessions, id)
	return commands, nil
}

func collectDisposeCancels(queued []collection.Command, rows []collection.Row) []collection.Command {
	commands := make([]collection.Command, 0)
	seen := make(map[uint64]struct{}, len(queued)+len(rows))
	appendCancel := func(id uint64) {
		if id == 0 {
			return
		}
		if _, exists := seen[id]; exists {
			return
		}
		seen[id] = struct{}{}
		commands = append(commands, collection.Command{Kind: "cancel", ID: id})
	}

	for _, command := range queued {
		if command.Kind == "cancel" {
			appendCancel(command.ID)
		}
	}
	for _, row := range rows {
		if row.PendingID != 0 {
			appendCancel(uint64(row.PendingID))
		}
	}
	return commands
}

// List returns the active session IDs in ascending allocation order.
func (m *Manager) List() []SessionID {
	m.mu.Lock()
	defer m.mu.Unlock()

	ids := make([]SessionID, 0, len(m.sessions))
	for id := range m.sessions {
		ids = append(ids, id)
	}
	sort.Slice(ids, func(i, j int) bool { return ids[i] < ids[j] })
	return ids
}

func (m *Manager) sessionLocked(id SessionID) (*collection.Session, error) {
	session, ok := m.sessions[id]
	if !ok {
		return nil, fmt.Errorf("unknown session ID %d", id)
	}
	return session, nil
}
