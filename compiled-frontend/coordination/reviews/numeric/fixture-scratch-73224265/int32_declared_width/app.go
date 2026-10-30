package probe

type State struct { Count int32 }
type Message struct { Name, Arg string }
type Effect struct { Kind, Name, Arg, Reply string }
type Node struct { Tag string }

func Init() State { return State{} }
func Update(s State, m Message) (State, []Effect) {
	if s.Count < 2147483647 {
			s.Count += 2147483647
		}
	return s, nil
}
func View(s State) Node { return Node{} }
