package probe

type State struct { Count int64 }
type Message struct { Name, Arg string }
type Effect struct { Kind, Name, Arg, Reply string }
type Node struct { Tag string }

func Init() State { return State{} }
func Update(s State, m Message) (State, []Effect) {
	if s.Count < 9007199254740990 {
			s.Count = bump(s.Count)
		}
	return s, nil
}
func View(s State) Node { return Node{} }
func bump(v int64) int64 { return v + 1 }
