/**
 * Install finite browser-level no-WASM observation controls before application
 * code runs. This covers public compilation/instantiation functions and the
 * WebAssembly constructors listed below; it does not claim to observe every
 * conceivable way a browser engine could execute WebAssembly.
 */
export async function installNoWasmGuards(page) {
  const requests = [];
  await page.route(/\.wasm(?:$|[?#])/i, async (route) => {
    requests.push(route.request().url());
    await route.abort("blockedbyclient");
  });
  await page.addInitScript(() => {
    const functionHooks = ["compile", "compileStreaming", "instantiate", "instantiateStreaming", "validate"];
    const constructorHooks = ["Module", "Instance", "Memory", "Table", "Global"];
    const attempts = [];
    const coverage = { status: "initializing", entries: [], failures: [] };
    Object.defineProperty(window, "__gobiNoWasmAttempts", { configurable: false, value: attempts });
    Object.defineProperty(window, "__gobiNoWasmGuardCoverage", { configurable: false, value: coverage });

    if (typeof WebAssembly === "undefined") {
      coverage.entries.push({ name: "WebAssembly", kind: "global", status: "absent" });
      coverage.status = "absent";
      return;
    }

    const fail = (name, kind, reason) => {
      coverage.entries.push({ name, kind, status: "failed", reason });
      coverage.failures.push({ name, reason });
    };
    const install = (property, kind) => {
      const name = `WebAssembly.${property}`;
      let original;
      let descriptor;
      try {
        original = WebAssembly[property];
        descriptor = Object.getOwnPropertyDescriptor(WebAssembly, property);
      } catch (error) {
        fail(name, kind, `could not inspect property: ${String(error?.message ?? error)}`);
        return;
      }
      if (typeof original !== "function") {
        coverage.entries.push({ name, kind, status: "absent", reason: "not exposed as a function" });
        return;
      }
      if (descriptor && !descriptor.configurable && (!Object.hasOwn(descriptor, "value") || descriptor.writable !== true)) {
        fail(name, kind, "property is non-configurable and non-writable");
        return;
      }

      let replacement;
      if (kind === "function") {
        replacement = function blockedWebAssemblyEntryPoint(..._args) {
          attempts.push(name);
          throw new Error(`WebAssembly disabled by conformance driver: ${name}`);
        };
      } else {
        replacement = new Proxy(original, {
          construct(_target, _args) {
            attempts.push(name);
            throw new Error(`WebAssembly disabled by conformance driver: ${name}`);
          },
          apply(_target, _thisArg, _args) {
            attempts.push(name);
            throw new Error(`WebAssembly disabled by conformance driver: ${name}`);
          },
        });
      }

      try {
        Object.defineProperty(WebAssembly, property, {
          configurable: descriptor?.configurable ?? true,
          enumerable: descriptor?.enumerable ?? false,
          writable: descriptor && Object.hasOwn(descriptor, "writable") ? descriptor.writable : true,
          value: replacement,
        });
        if (WebAssembly[property] !== replacement) {
          fail(name, kind, "replacement is not observable through the WebAssembly property");
          return;
        }
        coverage.entries.push({ name, kind, status: "installed" });
      } catch (error) {
        fail(name, kind, `could not install hook: ${String(error?.message ?? error)}`);
      }
    };

    for (const name of functionHooks) install(name, "function");
    for (const name of constructorHooks) install(name, "constructor");
    coverage.status = coverage.failures.length === 0 ? "complete" : "failed";
  });
  return {
    requests,
    async assertClear() {
      const observed = await page.evaluate(() => ({
        attempts: window.__gobiNoWasmAttempts ?? null,
        guardCoverage: window.__gobiNoWasmGuardCoverage ?? null,
      }));
      const guardCoverage = observed?.guardCoverage;
      if (!guardCoverage || !Array.isArray(guardCoverage.entries) || !Array.isArray(guardCoverage.failures)) {
        throw new Error("WebAssembly observation coverage is missing or unobservable");
      }
      if (guardCoverage.status === "failed" || guardCoverage.failures.length !== 0) {
        throw new Error(`WebAssembly guard coverage installation failed: ${JSON.stringify(guardCoverage)}`);
      }
      if (guardCoverage.status !== "complete" && guardCoverage.status !== "absent") {
        throw new Error(`WebAssembly guard coverage has invalid status: ${String(guardCoverage.status)}`);
      }
      if (guardCoverage.status === "absent" && !guardCoverage.entries.some((entry) =>
        entry.name === "WebAssembly" && entry.kind === "global" && entry.status === "absent")) {
        throw new Error("WebAssembly guard coverage reported absent without an absent global entry");
      }
      if (!Array.isArray(observed.attempts)) {
        throw new Error("WebAssembly API attempt observation is missing or unobservable");
      }
      if (requests.length !== 0 || observed.attempts.length !== 0) {
        throw new Error(`WASM fallback detected: requests=${JSON.stringify(requests)} API calls=${JSON.stringify(observed.attempts)}`);
      }
      return {
        wasmRequests: [...requests],
        wasmAPIAttempts: observed.attempts,
        guardCoverage,
      };
    },
  };
}
