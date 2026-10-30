// The React backend in miniature: map each Gobi Node to a React element using the tables Go generated, render it with
// react-dom/server's renderToStaticMarkup, and write the HTML per case.
// Usage: node react-side.mjs <cases.json> <output.json>   |   node react-side.mjs --versions
import { readFileSync, writeFileSync } from "node:fs";
process.env.NODE_ENV = "production"; // as real servers run: no development warnings
const React = await import("react");
const { renderToStaticMarkup } = await import("react-dom/server");
const { attributeName, booleanAttributes, eventName, styleKey } = await import("./react-map.gen.mjs");
const { createElement: h, Fragment } = React;

function toReact(node) {
  if (node.Kind === 2) return node.Text ?? "";
  const kids = (node.Kids ?? []).map(toReact);
  if (node.Kind === 3) return h(Fragment, node.Key ? { key: node.Key } : null, ...kids);
  const props = node.Key ? { key: node.Key } : {};
  for (const a of node.Attrs ?? []) {
    if (a.Flag) props[attributeName(a.Name)] = true;
    else if (a.Name === "style") {
      props.style = {};
      for (const s of a.Style ?? []) props.style[styleKey(s.Property)] = s.Value ?? "";
    } else props[attributeName(a.Name)] = a.Value ?? "";
  }
  for (const o of node.On ?? []) props[eventName(o.Event)] = () => {};
  if ("value" in props && !props.onChange && !props.onInput) props.onChange = () => {}; // React wants a handler; it adds nothing to the HTML
  if ("checked" in props && !props.onChange && !props.onInput) props.onChange = () => {};
  return h(node.Tag, props, ...kids);
}

if (process.argv[2] === "--versions") {
  const { __version } = await import("fast-check");
  const reactDom = await import("react-dom/server");
  console.log(JSON.stringify({ react: React.version, reactDom: reactDom.version, fastCheck: __version }));
} else {
  const cases = JSON.parse(readFileSync(process.argv[2], "utf8"));
  const results = cases.map((c) => {
    try {
      return { Name: c.Name, HTML: renderToStaticMarkup(toReact(c.Node)) };
    } catch (error) {
      return { Name: c.Name, Error: String(error && error.message) };
    }
  });
  writeFileSync(process.argv[3], JSON.stringify(results));
  console.log(`rendered ${cases.length} cases`);
}
