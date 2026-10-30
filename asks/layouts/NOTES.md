# Notes for asks/layouts

## Planner rulings (asks/README.md, round 0, layouts) that settle earlier open points

1. A layout receives the same resolved props as its page: the shared props merged with the page's own props.
   TestLayoutDrawsSharedUserNameAndFlash relies on this.
2. When a page prop and a shared prop share a key, the page prop wins.
   TestPagePropWinsOverSharedPropWithSameKey asserts this. The shared data doc
   (https://inertiajs.com/shared-data) says only that the two "are merged together" and advises namespacing; it does
   not state the winner.
3. Layouts listed in App.Page nest outermost first (the contract in inertia/inertia.go).
   TestNestedLayoutsWrapOutermostFirst relies on this. The layouts doc
   (https://inertiajs.com/docs/v3/the-basics/layouts) does not state which layout is outermost.

## Open point that remains

4. The protocol (https://inertiajs.com/the-protocol) says the first request is a full page load and later Inertia
   visits are XHR. It does not name the layout case. TestVisitBetweenPagesSharingLayoutIsXHRWithVersionAndNoFullReload
   and TestVisitBetweenLayoutAndNoLayoutPagesIsNoFullReload assume the protocol applies.

## Added in round 1

- TestAdjacentTextInLayoutAndPageFirstPaintMatchesInertia: a layout and a page each draw two adjacent text nodes;
  first paint matches Inertia and the HTML carries React's <!-- --> between them.
- TestFlashSetByPostAppearsAfterRedirectedVisit: a flash set by a POST appears in the page props after the redirected
  visit, and the layout draws it on the next GET that carries the cookie. The contract has no flash API, so the check
  keeps the flash in a cookie written and read by its own handlers.

## Fixes to my own checks

None so far.
