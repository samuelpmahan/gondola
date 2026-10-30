// The Gobi Node to React element mapping, shared by every Node-side script: react-side.mjs renders the elements with
// renderToStaticMarkup, and the Inertia side (inertia-ssr.mjs, inertia-client.mjs) makes page and layout components of them.
process.env.NODE_ENV = process.env.GOBI_NODE_ENV || "production"; // as real servers run: no development warnings (the client harness asks for development, to read hydration errors in full)
const React = await import("react");
const { attributeName, booleanAttributes, eventName, styleKey } = await import("./react-map.gen.mjs");
const { createElement: h, Fragment } = React;

// toReact maps one Node (the JSON shape of gobi.Node: Kind 1 element, 2 text, 3 fragment) to a React element or string.
// A slot (see withSlot) is a Node whose Tag is slotTag; it becomes the children given to toReact.
export const slotTag = "gobi-slot";
export function toReact(node, children) {
  if (node.Kind === 2) return node.Text ?? "";
  if (node.Kind === 1 && node.Tag === slotTag) return children === undefined ? null : children;
  const kids = (node.Kids ?? []).map((kid) => toReact(kid, children));
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

export { React };
