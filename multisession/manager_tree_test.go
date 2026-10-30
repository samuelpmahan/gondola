package multisession

import (
	"reflect"
	"sort"
	"sync"
	"testing"

	"github.com/samuelpmahan/gondola/collection"
)

func TestCreateChildAndTreeAreOrderedAndDefensive(t *testing.T) {
	manager := NewManager()
	rootA := createSession(t, manager)
	rootB := createSession(t, manager)
	childA := createChildSession(t, manager, rootA)
	childB := createChildSession(t, manager, rootA)
	grandchildA := createChildSession(t, manager, childA)
	childOfB := createChildSession(t, manager, rootB)

	want := []SessionInfo{
		{SessionID: rootA, ParentID: 0, Depth: 1},
		{SessionID: rootB, ParentID: 0, Depth: 1},
		{SessionID: childA, ParentID: rootA, Depth: 2},
		{SessionID: childB, ParentID: rootA, Depth: 2},
		{SessionID: grandchildA, ParentID: childA, Depth: 3},
		{SessionID: childOfB, ParentID: rootB, Depth: 2},
	}
	got := manager.Tree()
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("Tree() = %#v; want %#v", got, want)
	}

	got[0] = SessionInfo{SessionID: 99, ParentID: 98, Depth: 97}
	got[2].ParentID = 99
	if again := manager.Tree(); !reflect.DeepEqual(again, want) {
		t.Fatalf("Tree() shares mutable records or storage: %#v", again)
	}

	empty := NewManager().Tree()
	if empty == nil || len(empty) != 0 {
		t.Fatalf("empty Tree() = %#v; want a non-nil empty slice", empty)
	}
}

func TestCreateChildRejectsInvalidAndDeadParentsWithoutConsumingIDs(t *testing.T) {
	manager := NewManager()
	for _, parent := range []SessionID{0, 123} {
		if _, err := manager.CreateChild(parent); err == nil {
			t.Fatalf("CreateChild(%d) succeeded without a live parent", parent)
		}
		if manager.nextID != 0 || len(manager.Tree()) != 0 {
			t.Fatalf("invalid CreateChild(%d) mutated manager: next=%d tree=%#v", parent, manager.nextID, manager.Tree())
		}
	}

	root := createSession(t, manager)
	if _, err := manager.Dispose(root); err != nil {
		t.Fatalf("Dispose(root): %v", err)
	}
	if _, err := manager.CreateChild(root); err == nil {
		t.Fatal("CreateChild succeeded with a disposed parent")
	}
	if manager.nextID != root || len(manager.Tree()) != 0 {
		t.Fatalf("dead-parent rejection mutated manager: next=%d tree=%#v", manager.nextID, manager.Tree())
	}

	nextRoot := createSession(t, manager)
	if nextRoot != root+1 {
		t.Fatalf("next root ID = %d after rejected child; want %d", nextRoot, root+1)
	}
}

func TestCreateChildEnforcesDepthAndSafeIDBounds(t *testing.T) {
	manager := NewManager()
	parent := createSession(t, manager)
	for depth := 2; depth <= MaxTreeDepth; depth++ {
		parent = createChildSession(t, manager, parent)
		info := manager.Tree()[depth-1]
		if info.SessionID != parent || info.Depth != depth {
			t.Fatalf("tree entry at depth %d = %#v; want session %d", depth, info, parent)
		}
	}
	lastID := manager.nextID
	if _, err := manager.CreateChild(parent); err == nil {
		t.Fatal("CreateChild succeeded beyond maximum tree depth")
	}
	if manager.nextID != lastID || len(manager.Tree()) != MaxTreeDepth {
		t.Fatalf("depth rejection mutated manager: next=%d tree len=%d", manager.nextID, len(manager.Tree()))
	}

	boundary := NewManager()
	root := createSession(t, boundary)
	boundary.nextID = SessionID(MaxSessionID - 1)
	lastSafe, err := boundary.CreateChild(root)
	if err != nil || uint64(lastSafe) != MaxSessionID {
		t.Fatalf("CreateChild at last safe ID = %d, %v; want %d", lastSafe, err, MaxSessionID)
	}
	if _, err := boundary.CreateChild(root); err == nil {
		t.Fatal("CreateChild succeeded after exhausting safe session IDs")
	}
	if got := boundary.Tree(); len(got) != 2 || got[1].SessionID != lastSafe {
		t.Fatalf("Tree() after ID exhaustion = %#v", got)
	}
}

func TestDisposeRejectsNonLeafBeforeDrainingOrMutating(t *testing.T) {
	manager := NewManager()
	root := createSession(t, manager)
	child := createChildSession(t, manager, root)
	grandchild := createChildSession(t, manager, child)
	prepareSave(t, manager, child, "queued cancel")
	effects(t, manager, child) // drain start, leaving the request live
	dispatch(t, manager, child, "2/0/6", "click", "", "row-1-remove")
	before := manager.Tree()

	if _, err := manager.Dispose(child); err == nil {
		t.Fatal("Dispose succeeded for a non-leaf session")
	}
	if got := manager.Tree(); !reflect.DeepEqual(got, before) {
		t.Fatalf("rejected Dispose mutated tree: got %#v, want %#v", got, before)
	}
	if got, want := effects(t, manager, child), []collection.Command{{Kind: "cancel", ID: 1}}; !reflect.DeepEqual(got, want) {
		t.Fatalf("rejected Dispose drained or changed effects: got %#v, want %#v", got, want)
	}
	if _, err := manager.Snapshot(grandchild); err != nil {
		t.Fatalf("grandchild disappeared after rejected Dispose: %v", err)
	}

	if _, err := manager.Dispose(grandchild); err != nil {
		t.Fatalf("Dispose(leaf): %v", err)
	}
	if got, err := manager.Dispose(child); err != nil || !reflect.DeepEqual(got, []collection.Command{}) {
		t.Fatalf("Dispose(child after leaf removal) = %#v, %v; want empty commands", got, err)
	}
	if got, want := manager.Tree(), []SessionInfo{{SessionID: root, ParentID: 0, Depth: 1}}; !reflect.DeepEqual(got, want) {
		t.Fatalf("Tree() after leaf disposals = %#v; want %#v", got, want)
	}
}

func TestDisposeTreeIsPostorderAtomicAndPreservesUnrelatedBranches(t *testing.T) {
	manager := NewManager()
	root := createSession(t, manager)
	otherRoot := createSession(t, manager)
	childA := createChildSession(t, manager, root)
	childB := createChildSession(t, manager, root)
	grandchildA := createChildSession(t, manager, childA)
	otherChild := createChildSession(t, manager, otherRoot)

	// Grandchild A has an undrained queued cancel. Child B and both root
	// sessions have live requests; their pending IDs are local to each session.
	prepareSave(t, manager, grandchildA, "grandchild")
	effects(t, manager, grandchildA)
	dispatch(t, manager, grandchildA, "2/0/6", "click", "", "row-1-remove")
	prepareSave(t, manager, childA, "child A")
	prepareSave(t, manager, childB, "child B")
	preparePendingRows(t, manager, root, []string{"root one", "root two"})
	prepareSave(t, manager, otherRoot, "other root")
	prepareSave(t, manager, otherChild, "other child")

	disposals, err := manager.DisposeTree(root)
	if err != nil {
		t.Fatalf("DisposeTree(root): %v", err)
	}
	want := []Disposal{
		{SessionID: grandchildA, Commands: []collection.Command{{Kind: "cancel", ID: 1}}},
		{SessionID: childA, Commands: []collection.Command{{Kind: "cancel", ID: 1}}},
		{SessionID: childB, Commands: []collection.Command{{Kind: "cancel", ID: 1}}},
		{SessionID: root, Commands: []collection.Command{{Kind: "cancel", ID: 1}, {Kind: "cancel", ID: 2}}},
	}
	if !reflect.DeepEqual(disposals, want) {
		t.Fatalf("DisposeTree() = %#v; want %#v", disposals, want)
	}
	if len(disposals) == 0 || disposals[0].Commands == nil {
		t.Fatalf("DisposeTree returned nil bundle commands: %#v", disposals)
	}
	// The bundles own their slices too; caller mutation cannot change another
	// live session's state or any manager-owned registry data.
	disposals[0].Commands[0].ID = 99
	disposals[0].SessionID = 99
	wantTree := []SessionInfo{
		{SessionID: otherRoot, ParentID: 0, Depth: 1},
		{SessionID: otherChild, ParentID: otherRoot, Depth: 2},
	}
	if got := manager.Tree(); !reflect.DeepEqual(got, wantTree) {
		t.Fatalf("Tree() after subtree disposal = %#v; want %#v", got, wantTree)
	}
	if got := manager.List(); !reflect.DeepEqual(got, []SessionID{otherRoot, otherChild}) {
		t.Fatalf("List() after subtree disposal = %v", got)
	}
	if got := snapshot(t, manager, otherChild).State.Rows[0].Draft; got != "other child" {
		t.Fatalf("unrelated child draft changed to %q", got)
	}
	if got := effects(t, manager, otherChild); !reflect.DeepEqual(got, []collection.Command{{Kind: "start", ID: 1, Value: "other child"}}) {
		t.Fatalf("unrelated child effects changed: %#v", got)
	}

	for _, disposed := range []SessionID{grandchildA, childA, childB, root} {
		if _, err := manager.Snapshot(disposed); err == nil {
			t.Errorf("Snapshot(%d) succeeded after DisposeTree", disposed)
		}
		if _, err := manager.Dispatch(disposed, collection.Step{}); err == nil {
			t.Errorf("Dispatch(%d) succeeded after DisposeTree", disposed)
		}
		if _, err := manager.Effects(disposed); err == nil {
			t.Errorf("Effects(%d) succeeded after DisposeTree", disposed)
		}
		if _, err := manager.Complete(disposed, collection.Reply{ID: 1}); err == nil {
			t.Errorf("Complete(%d) succeeded after DisposeTree", disposed)
		}
		if _, err := manager.Audit(disposed); err == nil {
			t.Errorf("Audit(%d) succeeded after DisposeTree", disposed)
		}
		if _, err := manager.Dispose(disposed); err == nil {
			t.Errorf("Dispose(%d) succeeded after DisposeTree", disposed)
		}
	}
	if _, err := manager.DisposeTree(root); err == nil {
		t.Fatal("DisposeTree succeeded for a disposed root")
	}
}

func TestDisposeTreeReturnsNonNilEmptySlicesForEmptyLeaf(t *testing.T) {
	manager := NewManager()
	root := createSession(t, manager)
	disposals, err := manager.DisposeTree(root)
	if err != nil {
		t.Fatalf("DisposeTree(empty root): %v", err)
	}
	if len(disposals) != 1 || disposals[0].SessionID != root || disposals[0].Commands == nil || len(disposals[0].Commands) != 0 {
		t.Fatalf("DisposeTree(empty root) = %#v; want one non-nil empty command list", disposals)
	}
}

func TestConcurrentTreeCreationAndDisposalAreRaceSafe(t *testing.T) {
	manager := NewManager()
	root := createSession(t, manager)
	otherRoot := createSession(t, manager)
	const count = 64
	ids := make(chan SessionID, count)
	start := make(chan struct{})
	var wg sync.WaitGroup
	for range count {
		wg.Add(1)
		go func() {
			defer wg.Done()
			<-start
			id, err := manager.CreateChild(root)
			if err != nil {
				t.Errorf("CreateChild(root): %v", err)
				return
			}
			ids <- id
			_ = manager.Tree()
			_ = manager.List()
		}()
	}
	close(start)
	wg.Wait()
	close(ids)

	children := make([]SessionID, 0, count)
	for id := range ids {
		children = append(children, id)
	}
	if len(children) != count {
		t.Fatalf("created %d concurrent children; want %d", len(children), count)
	}
	sort.Slice(children, func(i, j int) bool { return children[i] < children[j] })
	for index := 1; index < len(children); index++ {
		if children[index] == children[index-1] {
			t.Fatalf("duplicate child IDs returned concurrently: %v", children)
		}
	}

	start = make(chan struct{})
	for _, child := range children {
		child := child
		wg.Add(1)
		go func() {
			defer wg.Done()
			<-start
			_, _ = manager.Dispose(child)
			_ = manager.Tree()
		}()
	}
	wg.Add(1)
	go func() {
		defer wg.Done()
		<-start
		_, _ = manager.DisposeTree(root)
	}()
	close(start)
	wg.Wait()

	want := []SessionInfo{{SessionID: otherRoot, ParentID: 0, Depth: 1}}
	if got := manager.Tree(); !reflect.DeepEqual(got, want) {
		t.Fatalf("Tree() after concurrent disposal = %#v; want %#v", got, want)
	}
	if _, err := manager.Snapshot(root); err == nil {
		t.Fatal("root remained live after concurrent DisposeTree")
	}
}

func createChildSession(t *testing.T, manager *Manager, parent SessionID) SessionID {
	t.Helper()
	id, err := manager.CreateChild(parent)
	if err != nil {
		t.Fatalf("CreateChild(%d): %v", parent, err)
	}
	return id
}
