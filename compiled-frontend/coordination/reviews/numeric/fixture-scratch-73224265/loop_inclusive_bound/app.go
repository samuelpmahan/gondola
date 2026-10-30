package probe

type State struct { Count int64 }
type Message struct { Name, Arg string }
type Effect struct { Kind, Name, Arg, Reply string }
type Node struct { Tag string }

func Init() State { return State{} }
func Update(s State, m Message) (State, []Effect) {
	for i := int64(0); i <= 9007199254740991; i++ {
		}
	return s, nil
}
func View(s State) Node { return Node{} }
