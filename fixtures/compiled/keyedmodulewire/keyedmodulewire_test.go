package keyedmodulewire

import "testing"

func TestChildIdentityAndPublicationCarryTheSameKeyGeneration(t *testing.T) {
	child := ChildRef{Key: "a", Generation: 2}
	publication := KeyedPublication{Key: child.Key, Generation: child.Generation, Count: 3, Revision: 4}
	if publication.Key != child.Key || publication.Generation != child.Generation || publication.Count != 3 || publication.Revision != 4 {
		t.Fatalf("keyed publication = %#v for child %#v", publication, child)
	}
}
