// Inertia's own server-side rendering, as a process Go talks to: one request per line on standard input, one answer per
// line on standard output, and it stops when standard input closes (so it never outlives Go).
//   request: {"id": n, "layers": "http://.../layers", "page": "<the page object, as the JSON text Go wrote>"}
//   answer:  [{"Name": "n", "HTML": "<body>"}]  or  [{"Name": "n", "Error": "..."}]   (the shape wire.DecodeResults reads)
// This is the documented entry (createInertiaApp with render: renderToString) called directly, the same call that
// @inertiajs/react/server makes for POST /render; `--server <port>` starts the real server instead, for the check that
// the two agree.
import { createInterface } from "node:readline";
const { React } = await import("./react-nodes.mjs"); // sets NODE_ENV before React loads
const h = React.createElement;
const { createInertiaApp } = await import("@inertiajs/react");
const { renderToString } = await import("react-dom/server");
const { resolver } = await import("./inertia-pages.mjs");

async function render(page, layersURL) {
  return createInertiaApp({ page, render: renderToString, resolve: resolver(layersURL), setup: ({ App, props }) => h(App, props) });
}

if (process.argv[2] === "--server") {
  // The real Inertia SSR server. Layers come from the address in the environment, because /render only carries the page.
  const { default: createServer } = await import("@inertiajs/react/server");
  createServer((page) => render(page, process.env.GOBI_LAYERS), { port: Number(process.argv[3]) });
} else if (process.argv[2] === "--versions") {
  const core = JSON.parse((await import("node:fs")).readFileSync("node_modules/@inertiajs/core/package.json", "utf8")).version;
  const react = JSON.parse((await import("node:fs")).readFileSync("node_modules/@inertiajs/react/package.json", "utf8")).version;
  const jsdom = JSON.parse((await import("node:fs")).readFileSync("node_modules/jsdom/package.json", "utf8")).version;
  console.log(JSON.stringify({ inertiaCore: core, inertiaReact: react, jsdom, react: (await import("react")).version, reactDom: (await import("react-dom/server")).version }));
} else {
  const answer = (name, fields) => JSON.stringify([{ Name: String(name), ...fields }]);
  const lines = createInterface({ input: process.stdin });
  let queue = Promise.resolve();
  lines.on("line", (line) => {
    queue = queue.then(async () => {
      const request = JSON.parse(line);
      try {
        const result = await render(JSON.parse(request.page), request.layers);
        console.log(answer(request.id, { HTML: result.body }));
      } catch (error) {
        console.log(answer(request.id, { Error: String((error && error.stack) || error) }));
      }
    });
  });
  lines.on("close", () => process.exit(0));
}
