// Seeded random Node generator: writes a JSON array of {Name, Node} for the Go and React sides to render.
// Usage: node gen-cases.mjs <seed> <count> [<agent 0-9>]   |   node gen-cases.mjs --stats <seed> <count>
// The Node shape is gobi.Node's JSON shape (Kind 1 element, 2 text, 3 fragment). Attribute names are the DOM's.
import fc from "fast-check";

const tags = ["div", "span", "p", "a", "b", "i", "ul", "ol", "li", "button", "input", "textarea", "select", "option",
  "label", "img", "br", "hr", "svg", "path", "table", "tr", "td", "h1", "h2", "section"];
const voidTags = new Set(["input", "img", "br", "hr"]);
const valuedNames = ["class", "id", "title", "for", "tabindex", "maxlength", "minlength", "colspan", "rowspan", "stroke-width",
  "stroke", "fill", "viewBox", "d", "href", "src", "alt", "type", "name", "value", "placeholder", "width", "height", "role",
  "lang", "dir", "aria-label", "aria-hidden", "aria-describedby", "data-id", "data-x", "data-test-id"];
const flagNames = ["disabled", "checked", "hidden", "required", "multiple", "selected", "readonly"];
const styleProperties = ["font-size", "margin-top", "padding-left", "opacity", "line-height", "z-index", "width",
  "-webkit-line-clamp", "-webkit-box-orient", "-ms-filter", "--custom-color", "--Mixed-Case", "color", "background-color", "float"];
const styleValues = ["12px", "1.5em", "0", "0.5", "2", "100%", "red", "#fff", "calc(1px + 2px)", "  8px  ", "", "12PX", "-3px", "1e3px", "vertical"];
const events = ["click", "input", "change", "submit", "keydown", "mouseenter", "focus"];

const hardStrings = ["", " ", "  padded  ", "0", "1", "42", "true", "false", "a b c", "<", ">", "&", '"', "'", `<&>"'`, "&amp;",
  "\n", "\t", "\r\n", "🥏", "😀", "Café", "日本語", "ñ", "\ud800", "\udc00", "a\ud83dz", "\ude00\ud83d", "x\ud83d", "\udc00y",
  "javascript:void(0)", "  JAVA\nscript:x", "data:text/plain,x", "DATA:x", "https://example.com/a?b=c&d=e#f"];
const words = fc.stringMatching(/^[a-z]{1,8}( [a-z]{1,8}){0,2}$/);
const anyString = fc.oneof(
  { arbitrary: fc.constantFrom(...hardStrings), weight: 5 },
  { arbitrary: words, weight: 3 },
  { arbitrary: fc.array(fc.constantFrom(...hardStrings), { minLength: 2, maxLength: 3 }).map((parts) => parts.join("")), weight: 2 },
  { arbitrary: fc.string({ unit: "grapheme", maxLength: 6 }), weight: 1 });
const shortKey = fc.stringMatching(/^[a-z0-9]{1,4}$/);

// attributesFor draws a list of attributes with unique names; the order is random because attribute order is output order.
const styleDeclaration = fc.record({ Property: fc.constantFrom(...styleProperties), Value: fc.constantFrom(...styleValues) });
const attributeChoice = fc.oneof(
  { arbitrary: fc.record({ Name: fc.constantFrom(...valuedNames), Value: anyString }), weight: 6 },
  { arbitrary: fc.record({ Name: fc.constantFrom(...flagNames), Flag: fc.constant(true) }), weight: 3 },
  { arbitrary: fc.record({ Name: fc.constant("style"), Style: fc.array(styleDeclaration, { minLength: 1, maxLength: 4 }) }), weight: 2 });
const attributes = fc.array(attributeChoice, { maxLength: 5 }).map((list) => {
  const seen = new Set();
  return list.filter((a) => (seen.has(a.Name) ? false : seen.add(a.Name)));
});
const handlers = fc.array(fc.record({ Event: fc.constantFrom(...events), Message: shortKey, Arg: fc.oneof(fc.constant(""), shortKey) }), { maxLength: 2 });
const maybeKey = fc.oneof({ arbitrary: fc.constant(""), weight: 7 }, { arbitrary: shortKey, weight: 3 });

// clean leaves out empty members so the JSON stays small.
function clean(node) {
  const out = { Kind: node.Kind };
  for (const [name, value] of Object.entries(node)) {
    if (name === "Kind") continue;
    if (value === "" || value === undefined || (Array.isArray(value) && value.length === 0)) continue;
    out[name] = value;
  }
  return out;
}

// Depth is bounded by passing the level down: elements at level 4 only get text kids, so nothing nests deeper.
const textNode = anyString.map((Text) => clean({ Kind: 2, Text }));
// Children often follow real structure (a select holds options, a table holds rows) so that rules about those pairs are
// exercised often; the rest of the time any tag may be a child.
const usualChild = { select: "option", ul: "li", ol: "li", table: "tr", tr: "td" };
function kidsAt(level, maximum, parentTag) {
  const preferred = usualChild[parentTag];
  return fc.array(fc.nat(100).chain((roll) =>
    level > 4 || roll < 15 ? textNode : roll < 22 ? fragmentAt(level) : preferred && roll < 65 ? elementAt(level, preferred) : elementAt(level)),
  { maxLength: maximum });
}
function fragmentAt(level) {
  return fc.record({ Key: maybeKey, Kids: kidsAt(level + 1, 3, "") }).map((x) => clean({ Kind: 3, ...x }));
}
// A <textarea> is valid React input only with one text child or none (two children throw, an element child is written
// as "[object Object]") and not with both a value attribute and children (that throws too).
function textareaRules(element) {
  if (element.Tag !== "textarea") return element;
  const kids = (element.Kids || []).filter((kid) => kid.Kind === 2).slice(0, 1);
  const attrs = kids.length > 0 ? (element.Attrs || []).filter((a) => a.Name !== "value") : element.Attrs;
  return clean({ ...element, Kids: kids, Attrs: attrs });
}
function elementAt(level, forcedTag) {
  return (forcedTag ? fc.constant(forcedTag) : fc.constantFrom(...tags)).chain((Tag) =>
    fc.record({ Tag: fc.constant(Tag), Key: maybeKey, Attrs: attributes, On: handlers,
      Kids: voidTags.has(Tag) ? fc.constant([]) : level >= 4 ? fc.array(textNode, { maxLength: 2 }) : Tag === "option" ? fc.array(textNode, { maxLength: 2 }) : kidsAt(level + 1, 3, Tag) })
      .map((x) => textareaRules(clean({ Kind: 1, ...x }))));
}
// A root is an element mostly, sometimes a fragment or a text node. Elements sit at depth 0.
const root = fc.nat(100).chain((roll) => (roll < 8 ? textNode : roll < 18 ? fragmentAt(0) : elementAt(0)));

function generate(seed, count) {
  return fc.sample(root, { seed, numRuns: count }).map((Node, index) => ({ Name: "case-" + String(index).padStart(5, "0"), Node }));
}

function walk(n, visit) {
  visit(n);
  for (const kid of n.Kids || []) walk(kid, visit);
}
function depthOf(n) {
  return 1 + Math.max(-1, ...(n.Kids || []).map(depthOf));
}

const args = process.argv.slice(2);
if (args[0] === "--stats") {
  const cases = generate(Number(args[1]), Number(args[2]));
  const counts = { cases: cases.length, loneSurrogate: 0, fragment: 0, key: 0, styleAttribute: 0, flag: 0, handler: 0, emptyText: 0 };
  const perTag = {};
  let deepest = 0;
  const lone = /[\ud800-\udbff](?![\udc00-\udfff])|(?<![\ud800-\udbff])[\udc00-\udfff]/;
  for (const c of cases) {
    const seen = { loneSurrogate: false, fragment: false, key: false, styleAttribute: false, flag: false, handler: false, emptyText: false };
    deepest = Math.max(deepest, depthOf(c.Node));
    walk(c.Node, (n) => {
      if (n.Kind === 3) seen.fragment = true;
      if (n.Key) seen.key = true;
      if (n.Kind === 2 && n.Text === undefined) seen.emptyText = true;
      if (n.Text && lone.test(n.Text)) seen.loneSurrogate = true;
      if (n.On) seen.handler = true;
      if (n.Tag) perTag[n.Tag] = (perTag[n.Tag] || 0) + 1;
      for (const a of n.Attrs || []) {
        if (a.Flag) seen.flag = true;
        if (a.Name === "style") seen.styleAttribute = true;
        if (a.Value && lone.test(a.Value)) seen.loneSurrogate = true;
      }
    });
    for (const name of Object.keys(seen)) if (seen[name]) counts[name]++;
  }
  console.log("cases containing: " + Object.entries(counts).map(([k, v]) => `${k} ${v}`).join(", "));
  console.log("deepest element depth (root 0): " + (deepest - 1));
  console.log("tag occurrences: " + Object.entries(perTag).sort().map(([k, v]) => `${k} ${v}`).join(", "));
} else {
  const [seed, count, agent] = args;
  let cases = generate(Number(seed), Number(count));
  if (agent !== undefined) cases = cases.filter((c, index) => index % 10 === Number(agent));
  process.stdout.write(JSON.stringify(cases));
}
