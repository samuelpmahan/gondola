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

// MaxTreeDepth is the greatest permitted depth for a session in a manager's
// parent tree. Root sessions have depth 1.
const MaxTreeDepth = 32

// SessionInfo describes one live session's immutable position in its
// manager's tree. ParentID is zero for a root.
type SessionInfo struct {
	SessionID SessionID
	ParentID  SessionID
	Depth     int
}

// Disposal pairs one removed session with the cancellation commands that
// must be delivered to that session's effect host.
type Disposal struct {
	SessionID SessionID
	Commands  []collection.Command
}

// Manager owns independent collection sessions and their scoped effects and
// audits. A Manager may be called concurrently; operations for one session are
// serialized with operations for every other session.
type Manager struct {
	mu       sync.Mutex
	nextID   SessionID
	sessions map[SessionID]*collection.Session
	tree     map[SessionID]SessionInfo
}

// NewManager returns an empty manager whose first session ID is 1.
func NewManager() *Manager {
	return &Manager{
		sessions: make(map[SessionID]*collection.Session),
		tree:     make(map[SessionID]SessionInfo),
	}
}

// Create allocates a fresh session with an ID that is never reused by this
// manager. IDs are bounded to JavaScript's safe integer range.
func (m *Manager) Create() (SessionID, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	return m.createLocked(0, 1)
}

// CreateChild allocates a fresh session beneath an existing parent. Parentage
// is immutable for the lifetime of both sessions.
func (m *Manager) CreateChild(parent SessionID) (SessionID, error) {
	m.mu.Lock()
	defer m.mu.Unlock()

	if _, err := m.sessionLocked(parent); err != nil {
		return 0, err
	}
	parentInfo, ok := m.tree[parent]
	if !ok {
		return 0, fmt.Errorf("unknown session ID %d", parent)
	}
	if parentInfo.Depth >= MaxTreeDepth {
		return 0, fmt.Errorf("session ID %d is already at maximum tree depth %d", parent, MaxTreeDepth)
	}
	return m.createLocked(parent, parentInfo.Depth+1)
}

func (m *Manager) createLocked(parent SessionID, depth int) (SessionID, error) {
	if uint64(m.nextID) >= MaxSessionID {
		return 0, fmt.Errorf("session ID space exhausted at %d", m.nextID)
	}
	m.nextID++
	if m.sessions == nil {
		m.sessions = make(map[SessionID]*collection.Session)
	}
	if m.tree == nil {
		m.tree = make(map[SessionID]SessionInfo)
	}
	m.sessions[m.nextID] = collection.NewSession()
	m.tree[m.nextID] = SessionInfo{SessionID: m.nextID, ParentID: parent, Depth: depth}
	return m.nextID, nil
}

// Tree returns all live sessions in ascending SessionID order. Its records
// and backing array are freshly allocated on every call.
func (m *Manager) Tree() []SessionInfo {
	m.mu.Lock()
	defer m.mu.Unlock()

	ids := make([]SessionID, 0, len(m.tree))
	for id := range m.tree {
		ids = append(ids, id)
	}
	sort.Slice(ids, func(i, j int) bool { return ids[i] < ids[j] })

	result := make([]SessionInfo, len(ids))
	for index, id := range ids {
		result[index] = m.tree[id]
	}
	return result
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

	if _, err := m.sessionLocked(id); err != nil {
		return nil, err
	}
	if m.hasChildLocked(id) {
		return nil, fmt.Errorf("session ID %d has live children", id)
	}
	return m.disposeOneLocked(id), nil
}

// DisposeTree removes id and all of its descendants atomically and returns
// cancellations in deterministic depth-first postorder. Siblings are visited
// in ascending SessionID order.
func (m *Manager) DisposeTree(id SessionID) ([]Disposal, error) {
	m.mu.Lock()
	defer m.mu.Unlock()

	if _, err := m.sessionLocked(id); err != nil {
		return nil, err
	}
	postorder := m.postorderLocked(id)
	result := make([]Disposal, 0, len(postorder))
	for _, childID := range postorder {
		result = append(result, Disposal{SessionID: childID, Commands: m.disposeOneLocked(childID)})
	}
	return result, nil
}

func (m *Manager) postorderLocked(root SessionID) []SessionID {
	ids := make([]SessionID, 0)
	var visit func(SessionID)
	visit = func(id SessionID) {
		children := make([]SessionID, 0)
		for childID, info := range m.tree {
			if info.ParentID == id {
				children = append(children, childID)
			}
		}
		sort.Slice(children, func(i, j int) bool { return children[i] < children[j] })
		for _, childID := range children {
			visit(childID)
		}
		ids = append(ids, id)
	}
	visit(root)
	return ids
}

func (m *Manager) hasChildLocked(id SessionID) bool {
	for _, info := range m.tree {
		if info.ParentID == id {
			return true
		}
	}
	return false
}

// disposeOneLocked assumes id is live and removes exactly that session.
// Queued cancels retain effect order; cancels for still-pending rows follow in
// current row order. The returned command slice is independently allocated.
func (m *Manager) disposeOneLocked(id SessionID) []collection.Command {
	session := m.sessions[id]
	queued := session.Effects()
	rows := session.Snapshot().State.Rows
	commands := collectDisposeCancels(queued, rows)
	delete(m.sessions, id)
	delete(m.tree, id)
	return commands
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
