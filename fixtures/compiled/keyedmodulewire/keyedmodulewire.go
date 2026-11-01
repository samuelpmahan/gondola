// Package keyedmodulewire carries identity alongside the existing module wire
// records when a host routes callbacks and publications for mounted children.
package keyedmodulewire

type ChildRef struct {
	Key        string `json:"key"`
	Generation int    `json:"generation"`
}

type KeyedPublication struct {
	Key        string  `json:"key"`
	Generation int     `json:"generation"`
	Count      float64 `json:"count"`
	Revision   int     `json:"revision"`
}
