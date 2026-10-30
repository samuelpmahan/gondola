// The Inertia side of a Gobi page: components made of the Nodes that Go drew. Go draws one layer per layout and one for
// the page itself (inertia.Layers); this file turns each layer into a React component and hands the layouts to Inertia
// as persistent layouts (the static `layout` list of a page component), so Inertia, not this file, nests them.
// The layers come from Go over HTTP, from the address in layersURL, because Go owns the views.
const { toReact } = await import("./react-nodes.mjs");

// One component per layout name, made once: Inertia keeps a persistent layout's state across visits only while the
// component stays the same function.
const layoutComponents = new Map();
function layoutComponent(name) {
  if (!layoutComponents.has(name)) {
    const Layout = ({ children, node }) => toReact(node, children);
    Layout.displayName = `Layout(${name})`;
    layoutComponents.set(name, Layout);
  }
  return layoutComponents.get(name);
}

// layersOf asks Go to draw component from props.
async function layersOf(layersURL, component, props) {
  const response = await fetch(layersURL, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ component, props }) });
  const text = await response.text();
  if (!response.ok) throw new Error(`Go could not draw ${component}: ${text}`);
  return JSON.parse(text);
}

// resolver returns the `resolve` function createInertiaApp wants: name and page object in, page component out.
export function resolver(layersURL) {
  return async (name, page) => {
    const layers = await layersOf(layersURL, name, page.props);
    const Page = () => toReact(layers.page);
    Page.displayName = `Page(${name})`;
    if (layers.names.length > 0) Page.layout = layers.names.map((layoutName, i) => [layoutComponent(layoutName), { node: layers.layouts[i] }]);
    return Page;
  };
}
