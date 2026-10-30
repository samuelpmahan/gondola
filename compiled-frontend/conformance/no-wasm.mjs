/**
 * Install browser-level no-WASM controls before application code runs.
 * Requests are aborted and all public compilation/instantiation entry points
 * throw while recording the attempt, so a caught failure cannot look like a
 * successful JavaScript-only run.
 */
export async function installNoWasmGuards(page) {
  const requests = [];
  await page.route(/\.wasm(?:$|[?#])/i, async (route) => {
    requests.push(route.request().url());
    await route.abort("blockedbyclient");
  });
  await page.addInitScript(() => {
    const attempts = [];
    Object.defineProperty(window, "__gobiNoWasmAttempts", { configurable: false, value: attempts });
    if (typeof WebAssembly === "undefined") return;
    const reject = (name) => function blockedWasmEntryPoint() {
      attempts.push(name);
      throw new Error(`WebAssembly disabled by conformance driver: ${name}`);
    };
    for (const name of ["instantiate", "instantiateStreaming", "compile", "compileStreaming"]) {
      const descriptor = Object.getOwnPropertyDescriptor(WebAssembly, name);
      if (!descriptor || descriptor.configurable || descriptor.writable) {
        Object.defineProperty(WebAssembly, name, {
          configurable: true,
          enumerable: descriptor?.enumerable ?? false,
          writable: true,
          value: reject(`WebAssembly.${name}`),
        });
      }
    }
    for (const name of ["Module", "Instance", "Memory", "Table", "Global"]) {
      const original = WebAssembly[name];
      const descriptor = Object.getOwnPropertyDescriptor(WebAssembly, name);
      if (typeof original !== "function" || (descriptor && !descriptor.configurable && !descriptor.writable)) continue;
      const blocked = new Proxy(original, {
        construct(_target, _args) {
          attempts.push(`WebAssembly.${name}`);
          throw new Error(`WebAssembly disabled by conformance driver: WebAssembly.${name}`);
        },
        apply(_target, _thisArg, _args) {
          attempts.push(`WebAssembly.${name}`);
          throw new Error(`WebAssembly disabled by conformance driver: WebAssembly.${name}`);
        },
      });
      Object.defineProperty(WebAssembly, name, {
        configurable: true,
        enumerable: descriptor?.enumerable ?? false,
        writable: true,
        value: blocked,
      });
    }
  });
  return {
    requests,
    async assertClear() {
      const apiAttempts = await page.evaluate(() => window.__gobiNoWasmAttempts ?? ["guard-not-installed"]);
      if (requests.length !== 0 || apiAttempts.length !== 0) {
        throw new Error(`WASM fallback detected: requests=${JSON.stringify(requests)} API calls=${JSON.stringify(apiAttempts)}`);
      }
      return { wasmRequests: [...requests], wasmAPIAttempts: apiAttempts };
    },
  };
}
