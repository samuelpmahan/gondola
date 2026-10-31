package backendqualification

// The registry is the Go-owned qualification policy. The input report can
// describe measurements, but it cannot choose a case's expected channel rule.
type registryCase struct {
	id                 string
	backend            string
	fault              string
	requiredChannels   []string
	allowedChannels    []string
	channelRule        string
	activationEvent    *int
	activationTarget   *string
	expectedStateIndex int
	expectedEvents     int
	expectedTicks      int
}

func qualificationRegistry() []registryCase {
	zero := 0
	textTarget := "0/0/0"
	orderTarget := "1"
	controlTarget := "0/1"
	clickTarget := "1/0/1"
	return []registryCase{
		{id: "healthy-react", backend: "react", fault: "none", channelRule: "exact", expectedStateIndex: 45, expectedEvents: 50, expectedTicks: 46},
		{id: "healthy-dom", backend: "dom", fault: "none", channelRule: "exact", expectedStateIndex: 45, expectedEvents: 50, expectedTicks: 46},
		{id: "healthy-swap", backend: "swap", fault: "none", channelRule: "exact", expectedStateIndex: 45, expectedEvents: 50, expectedTicks: 46},
		{id: "fault-react-text-corruption", backend: "react", fault: "text-corruption", requiredChannels: []string{"dom"}, allowedChannels: []string{"dom"}, channelRule: "all", activationTarget: &textTarget, expectedStateIndex: 0, expectedEvents: 0, expectedTicks: 1},
		{id: "fault-react-key-order", backend: "react", fault: "key-order", requiredChannels: []string{"dom"}, allowedChannels: []string{"dom"}, channelRule: "all", activationTarget: &orderTarget, expectedStateIndex: 0, expectedEvents: 0, expectedTicks: 1},
		{id: "fault-react-enabled-control", backend: "react", fault: "enabled-control", requiredChannels: []string{"disabled"}, allowedChannels: []string{"disabled", "dom"}, channelRule: "all", activationTarget: &controlTarget, expectedStateIndex: 0, expectedEvents: 0, expectedTicks: 1},
		{id: "fault-react-drop-click", backend: "react", fault: "drop-click", requiredChannels: []string{"dispatch-count", "trace-count", "state"}, allowedChannels: []string{"dispatch-count", "trace-count", "state", "dom"}, channelRule: "any", activationEvent: &zero, activationTarget: &clickTarget, expectedStateIndex: 1, expectedEvents: 1, expectedTicks: 2},
		{id: "fault-react-duplicate-click", backend: "react", fault: "duplicate-click", requiredChannels: []string{"dispatch-count"}, allowedChannels: []string{"dispatch-count", "trace-count", "state", "dom"}, channelRule: "all", activationEvent: &zero, activationTarget: &clickTarget, expectedStateIndex: 1, expectedEvents: 1, expectedTicks: 2},
		{id: "fault-dom-text-corruption", backend: "dom", fault: "text-corruption", requiredChannels: []string{"dom"}, allowedChannels: []string{"dom"}, channelRule: "all", activationTarget: &textTarget, expectedStateIndex: 0, expectedEvents: 0, expectedTicks: 1},
		{id: "fault-dom-key-order", backend: "dom", fault: "key-order", requiredChannels: []string{"dom"}, allowedChannels: []string{"dom"}, channelRule: "all", activationTarget: &orderTarget, expectedStateIndex: 0, expectedEvents: 0, expectedTicks: 1},
		{id: "fault-dom-enabled-control", backend: "dom", fault: "enabled-control", requiredChannels: []string{"disabled"}, allowedChannels: []string{"disabled", "dom"}, channelRule: "all", activationTarget: &controlTarget, expectedStateIndex: 0, expectedEvents: 0, expectedTicks: 1},
		{id: "fault-dom-drop-click", backend: "dom", fault: "drop-click", requiredChannels: []string{"dispatch-count", "trace-count", "state"}, allowedChannels: []string{"dispatch-count", "trace-count", "state", "dom"}, channelRule: "any", activationEvent: &zero, activationTarget: &clickTarget, expectedStateIndex: 1, expectedEvents: 1, expectedTicks: 2},
		{id: "fault-dom-duplicate-click", backend: "dom", fault: "duplicate-click", requiredChannels: []string{"dispatch-count"}, allowedChannels: []string{"dispatch-count", "trace-count", "state", "dom"}, channelRule: "all", activationEvent: &zero, activationTarget: &clickTarget, expectedStateIndex: 1, expectedEvents: 1, expectedTicks: 2},
	}
}

func channelOrder() []string {
	return []string{"dom", "disabled", "dispatch-count", "trace-count", "state"}
}
