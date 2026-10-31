import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

const [directHelperURL, modulePath, helpersPath, fixturePath] = process.argv.slice(2);
const { replayDirectJavaScript } = await import(directHelperURL);
const compiled = await import(pathToFileURL(modulePath).href);
const helpers = await import(pathToFileURL(helpersPath).href);
const fixtureScript = JSON.parse(await readFile(fixturePath, "utf8"));
const trace = replayDirectJavaScript({ compiled: compiled.gobiCompiled, helpers, fixtureScript });
process.stdout.write(JSON.stringify(trace));
