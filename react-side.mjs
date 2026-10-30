// The React backend in miniature: map each Gobi Node to a React element using the tables Go generated, render it with
// react-dom/server's renderToStaticMarkup, and write the HTML per case.
// Usage: node react-side.mjs <cases.json> <output.json>   |   node react-side.mjs --versions
import { readFileSync, writeFileSync } from "node:fs";
const { React, toReact } = await import("./react-nodes.mjs");
const { renderToStaticMarkup } = await import("react-dom/server");

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
