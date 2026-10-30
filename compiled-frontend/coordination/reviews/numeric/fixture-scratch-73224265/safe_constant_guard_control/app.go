package probe

type State struct { Count int64 }
type Message struct { Name, Arg string }
type Effect struct { Kind, Name, Arg, Reply string }
type Node struct { Tag string }

const MaxSafe int64 = 9007199254740991
func Init() State { return State{} }
func Update(s State, m Message) (State, []Effect) {
	if s.Count < MaxSafe {
			s.Count++
		}
	return s, nil
}
func View(s State) Node { return Node{} }
