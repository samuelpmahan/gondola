# Haiku 1 notes (plain pages)

## Fix 1: entity check narrowed to HTML entities

The first draft of TestDataPageScriptEscapesSlashesAndAvoidsHTMLEntities required the literal text `x=1&y=2` in the
data-page script. The protocol says only that HTML entity encoding is not allowed. It does not forbid a JSON escape of
an ampersand. The check now fails only on HTML entity forms (`&amp;`, `&lt;`, `&gt;`, `&quot;`, `&#`), which is what the
protocol rules out. The byte comparison in TestAwkwardPropPassesSameFirstPaint still checks the exact bytes against
Inertia's own rendering.

## Fix 2: less-than escape in the data-page script

TestDataPageScriptEscapesSlashesAndAvoidsHTMLEntities first wanted the close tag written as a slash-escaped close tag
only. Inertia writes the less-than sign inside the data-page script as the JSON escape for less-than (backslash, u,
0, 0, 3, c), then the slash as backslash-slash. So a close tag inside a string appears as that escape followed by the
escaped slash and the rest of the tag. The check now wants exactly that form. The tool's rules table
(inertia/rules_test.go, the escaping rows) and Inertia's own rendering agree on this form, and by the planner ruling
for round 0 the oracle output is the judge.

## Fix 3: the root element is matched by its id, not its exact tag

TestFirstVisitIsAnHTMLDocumentWithAppDivAndPageScript wanted the literal `<div id="app"`. Inertia's server-side
rendering writes `<div data-server-rendered="true" id="app">`, which is the root the tool must write. The check now
matches a div whose id is app with any other attributes before or after it (regexp `<div\b[^>]*\bid="app"`). The
protocol asks for a root element with id app, and that still holds.
