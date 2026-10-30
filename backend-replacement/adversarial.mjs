// Browser-level adversarial probes for the replaceable renderer host.
// The harness installs window.__replacement with the real host, DOM/React
// renderers, and the Go counter runtime before calling runAdversarial(page).

/**
 * Exercise the public replacement API in a real browser page.
 *
 * Returns one human-readable {name, pass, observations} entry per probe. The
 * caller should fail its process when any entry has pass === false.
 */
export async function runAdversarial(page) {
  if (!page || typeof page.evaluate !== "function") {
    throw new TypeError("runAdversarial(page) requires a Playwright-compatible page");
  }

  return page.evaluate(async () => {
    const results = [];
    const expectedErrors = [];
    const expectedRuntimeSentinel = "__EXPECTED_RUNTIME_FAILURE__";
    const expectedRuntimeError = `backend host: runtime.dispatch() returned a runtime error: ${expectedRuntimeSentinel}`;
    const assert = (condition, message) => {
      if (!condition) throw new Error(message);
    };
    const canonical = (value) => {
      if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
      if (value && typeof value === "object") {
        return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
      }
      return JSON.stringify(value);
    };
    const clone = (value) => JSON.parse(JSON.stringify(value));
    const record = async (name, probe) => {
      try {
        results.push({ name, pass: true, observations: await probe() });
      } catch (error) {
        results.push({ name, pass: false, observations: { error: String(error?.stack ?? error?.message ?? error) } });
      }
    };
    const replacement = window.__replacement;

    if (!replacement || typeof replacement.createBackendHost !== "function" ||
        typeof replacement.renderers?.dom !== "function" || typeof replacement.renderers?.react !== "function" ||
        !replacement.runtime || typeof replacement.runtime.init !== "function") {
      return [{
        name: "replacement fixture contract",
        pass: false,
        observations: {
          error: "window.__replacement must expose createBackendHost, renderers.dom, renderers.react, and runtime.init",
        },
      }];
    }

    const newRoot = () => {
      const root = document.createElement("div");
      root.dataset.adversarialRoot = "true";
      document.body.appendChild(root);
      return root;
    };
    const newHost = (root = newRoot()) => ({
      root,
      // The harness captures this Go runtime after main parity traces. Its
      // synchronous init() can safely start each isolated host probe fresh.
      host: replacement.createBackendHost(root, replacement.runtime, replacement.renderers, "dom"),
    });
    const removeRoot = (root) => root.remove();
    const resetAndCleanup = (root, host) => {
      try { host?.unmount?.(); } catch { /* preserve the probe's original failure */ }
      removeRoot(root);
    };
    const count = (snapshot) => snapshot?.state?.Count ?? snapshot?.state?.count;
    const messages = (snapshot) => snapshot?.messages ?? snapshot?.Messages ?? [];
    const buttons = (root) => Array.from(root.querySelectorAll("button"));

    await record("disabled reset native click sends no message", () => {
      const { root, host } = newHost();
      try {
        const before = host.snapshot();
        const reset = buttons(root).find((button) => button.textContent.trim().toLowerCase() === "reset");
        assert(reset, "the initial renderer did not produce the Reset button");
        assert(reset.disabled, "Reset should be disabled when the Go counter is zero");
        reset.click(); // Call the native control API directly, bypassing host.click().
        const after = host.snapshot();
        assert(canonical(after) === canonical(before), "native click on disabled Reset changed the Go snapshot");
        assert(messages(after).length === 0, "native click on disabled Reset appended a Go message");
        return { disabled: reset.disabled, messagesBefore: 0, messagesAfter: messages(after).length };
      } finally {
        resetAndCleanup(root, host);
      }
    });

    await record("same-backend replacement is idempotent", async () => {
      const { root, host } = newHost();
      try {
        host.click("1");
        const observations = [];
        for (const backend of ["dom", "react"]) {
          await host.replaceBackend(backend);
          const before = host.snapshot();
          const domBefore = host.domSnapshot();
          await host.replaceBackend(backend);
          await host.replaceBackend(backend);
          const after = host.snapshot();
          const domAfter = host.domSnapshot();
          assert(host.backendName() === backend, `same-backend replacement changed selected backend ${backend}`);
          assert(canonical(after) === canonical(before), `same-backend replacement changed state or log on ${backend}`);
          assert(domAfter.html === domBefore.html, `same-backend replacement changed ${backend} rendered HTML`);
          assert(canonical(domAfter.disabled) === canonical(domBefore.disabled), `same-backend replacement changed ${backend} disabled controls`);
          observations.push({ backend, state: after.state, messageCount: messages(after).length });
        }
        return { backends: observations };
      } finally {
        resetAndCleanup(root, host);
      }
    });

    await record("invalid backend leaves the current backend usable", async () => {
      const { root, host } = newHost();
      try {
        const before = host.snapshot();
        const beforeDOM = host.domSnapshot();
        let rejected = false;
        let rejection = null;
        try {
          const result = await host.replaceBackend("__unsupported_backend__");
          rejected = result === false;
        } catch (error) {
          rejected = true;
          rejection = String(error?.message ?? error);
        }
        assert(rejected, "invalid backend selection was not reported as a rejection");
        assert(host.backendName() === "dom", "invalid backend selection displaced the current backend");
        assert(canonical(host.snapshot()) === canonical(before), "invalid backend selection changed the runtime snapshot");
        assert(canonical(host.domSnapshot()) === canonical(beforeDOM), "invalid backend selection changed rendered DOM");
        host.click("1");
        const afterClick = host.snapshot();
        assert(count(afterClick) === 1, "the existing backend stopped dispatching after an invalid selection");
        assert(messages(afterClick).length === 1, "usable backend did not append exactly one message after invalid selection");
        return { rejected, rejection, backend: host.backendName(), count: count(afterClick), messageCount: messages(afterClick).length };
      } finally {
        resetAndCleanup(root, host);
      }
    });

    await record("rapid backend swaps preserve Go state and message log", async () => {
      const { root, host } = newHost();
      try {
        host.click("1");
        host.click("1");
        host.click("2");
        host.click("1");
        const expected = host.snapshot();
        const swapTrace = [];
        for (let index = 0; index < 12; index++) {
          const backend = index % 2 === 0 ? "react" : "dom";
          await host.replaceBackend(backend);
          const actual = host.snapshot();
          assert(canonical(actual) === canonical(expected), `swap ${index + 1} to ${backend} changed state or messages`);
          assert(host.backendName() === backend, `swap ${index + 1} did not select ${backend}`);
          swapTrace.push({ backend, count: count(actual), messageCount: messages(actual).length });
        }
        return { initialCount: count(expected), messageCount: messages(expected).length, swaps: swapTrace };
      } finally {
        resetAndCleanup(root, host);
      }
    });

    await record("detached controls cannot dispatch after swap or unmount", async () => {
      const { root, host } = newHost();
      try {
        const staleAfterSwap = buttons(root)[0];
        assert(staleAfterSwap, "the DOM renderer did not produce an Add button");
        const beforeSwap = host.snapshot();
        await host.replaceBackend("react");
        staleAfterSwap.click();
        const afterStaleSwapClick = host.snapshot();
        assert(canonical(afterStaleSwapClick) === canonical(beforeSwap), "detached DOM control dispatched after backend swap");
        return { swapClickMessages: messages(afterStaleSwapClick).length };
      } finally {
        resetAndCleanup(root, host);
      }
    });

    await record("detached controls cannot dispatch after host unmount", () => {
      const root = newRoot();
      const initial = {
        state: { count: 0 },
        messages: [],
        tree: {
          Kind: 1,
          Tag: "div",
          Kids: [{
            Kind: 1,
            Tag: "button",
            On: [{ Event: "click", Message: "add", Arg: "" }],
            Kids: [{ Kind: 2, Text: "Add" }],
          }],
        },
        effects: [],
      };
      let dispatchCalls = 0;
      const runtime = {
        init() { return clone(initial); },
        dispatch() {
          dispatchCalls++;
          return clone(initial);
        },
      };
      let host;
      try {
        host = replacement.createBackendHost(root, runtime, replacement.renderers, "dom");
        const detached = buttons(root)[0];
        assert(detached, "the DOM renderer did not produce an Add button");
        host.unmount();
        detached.click();
        assert(dispatchCalls === 0, "a detached control called the runtime after host unmount");
        assert(root.childElementCount === 0, "host unmount left rendered children attached");
        return { dispatchCalls, afterUnmountChildren: root.childElementCount };
      } finally {
        resetAndCleanup(root, host);
      }
    });

    await record("runtime errors fail closed and preserve the last snapshot", () => {
      const root = newRoot();
      const initial = {
        state: { count: 0 },
        messages: [],
        tree: {
          Kind: 1,
          Tag: "div",
          Kids: [{
            Kind: 1,
            Tag: "button",
            On: [{ Event: "click", Message: "fail", Arg: "" }],
            Kids: [{ Kind: 2, Text: "Fail" }],
          }],
        },
        effects: [],
      };
      let dispatchCalls = 0;
      let initCalls = 0;
      let domApi;
      const failingRuntime = {
        init() {
          initCalls++;
          return clone(initial);
        },
        dispatch() {
          dispatchCalls++;
          return { error: expectedRuntimeSentinel };
        },
      };
      const backends = {
        ...replacement.renderers,
        dom(target, facade) {
          domApi = replacement.renderers.dom(target, facade);
          return domApi;
        },
      };
      let host;
      try {
        host = replacement.createBackendHost(root, failingRuntime, backends, "dom");
        const before = host.snapshot();
        const beforeHTML = root.innerHTML;
        let thrown = null;
        const expectedRuntimeErrorListener = (event) => {
          const message = event.error?.message ?? event.message;
          if (message !== expectedRuntimeError) return;
          event.preventDefault();
          expectedErrors.push({
            probe: "runtime errors fail closed and preserve the last snapshot",
            source: "window.error",
            message,
          });
        };
        const originalConsoleError = console.error;
        console.error = (...args) => {
          const exact = args.find((arg) => arg === expectedRuntimeError || arg === expectedRuntimeSentinel);
          if (exact !== undefined) {
            expectedErrors.push({
              probe: "runtime errors fail closed and preserve the last snapshot",
              source: "console.error",
              message: String(exact),
            });
            return;
          }
          return originalConsoleError.apply(console, args);
        };
        window.addEventListener("error", expectedRuntimeErrorListener);
        try {
          try { host.click("0"); } catch (error) { thrown = String(error?.message ?? error); }
        } finally {
          window.removeEventListener("error", expectedRuntimeErrorListener);
          console.error = originalConsoleError;
        }
        let hostClosed = false;
        try { host.snapshot(); } catch { hostClosed = true; }
        assert(dispatchCalls === 1, `expected exactly one dispatch, got ${dispatchCalls}`);
        assert(initCalls === 1, `host unexpectedly reinitialized the runtime ${initCalls} times`);
        assert(canonical(domApi.snapshot()) === canonical(before), "runtime error corrupted the last good renderer snapshot");
        assert(root.innerHTML === beforeHTML, "runtime error changed the last good rendered DOM");
        assert(hostClosed, "host did not fail closed after its renderer reported a runtime error");
        let secondClickRejected = false;
        try { host.click("0"); } catch { secondClickRejected = true; }
        assert(secondClickRejected, "closed host accepted another click");
        assert(dispatchCalls === 1, "closed host retried the runtime dispatch");
        assert(initCalls === 1, "closed host hid the failure by reinitializing Go");
        return {
          dispatchCalls,
          initCalls,
          surfacedError: thrown,
          hostClosed,
          lastGoodSnapshotPreserved: true,
          expectedErrors: expectedErrors.slice(),
        };
      } finally {
        resetAndCleanup(root, host);
      }
    });

    const renderer = replacement.renderers.react;
    const rejectReactSnapshot = (name, snapshot, expectedMessage) => {
      const root = newRoot();
      try {
        let error = null;
        try {
          renderer(root, { init: () => clone(snapshot), dispatch: () => clone(snapshot) });
        } catch (caught) {
          error = caught;
        }
        assert(error, `${name}: React adapter accepted an unsupported snapshot`);
        const message = String(error?.message ?? error);
        if (expectedMessage) {
          assert(expectedMessage.test(message), `${name}: error did not explain the rejected input: ${message}`);
        }
        assert(root.childElementCount === 0, `${name}: failed mount left partial DOM behind`);
        return { rejection: message };
      } finally {
        root.remove();
      }
    };

    await record("React adapter explicitly rejects invalid Node kinds", () => rejectReactSnapshot(
      "invalid Node.Kind",
      { tree: { Kind: 99 }, state: {}, messages: [], effects: [] },
      /kind|node|unsupported/i,
    ));

    await record("React adapter explicitly rejects malformed Nodes", () => rejectReactSnapshot(
      "malformed text Node",
      { tree: { Kind: 2, Text: 12 }, state: {}, messages: [], effects: [] },
      /text|node|string|invalid/i,
    ));

    await record("React adapter explicitly rejects unsupported Node.On events", () => rejectReactSnapshot(
      "unsupported Node.On event",
      {
        tree: {
          Kind: 1,
          Tag: "button",
          On: [{ Event: "unsupported-event", Message: "noop", Arg: "" }],
          Kids: [],
        },
        state: {},
        messages: [],
        effects: [],
      },
      /event|unsupported-event|handler/i,
    ));

    await record("React adapter explicitly rejects Go effects", () => rejectReactSnapshot(
      "unsupported Go effects",
      { tree: { Kind: 2, Text: "ok" }, state: {}, messages: [], effects: [{ Name: "unsupported" }] },
      /effect/i,
    ));

    await record("failed React mount leaves its root reusable", () => {
      const root = newRoot();
      const invalid = { tree: { Kind: 99 }, state: {}, messages: [], effects: [] };
      const valid = { tree: { Kind: 2, Text: "valid remount" }, state: {}, messages: [], effects: [] };
      const warnings = [];
      const originalConsoleError = console.error;
      let mounted;
      let initialError = null;
      try {
        console.error = (...args) => {
          warnings.push(args.map((arg) => String(arg)).join(" "));
          return originalConsoleError.apply(console, args);
        };
        try {
          renderer(root, { init: () => clone(invalid), dispatch: () => clone(invalid) });
        } catch (error) {
          initialError = String(error?.message ?? error);
        }
        assert(initialError, "React adapter accepted an invalid initial tree");

        mounted = renderer(root, { init: () => clone(valid), dispatch: () => clone(valid) });
        assert(root.textContent === "valid remount", "valid remount did not render into the reused root");
        const duplicateRootWarnings = warnings.filter((warning) =>
          /createRoot|already been passed|already has a root/i.test(warning));
        assert(duplicateRootWarnings.length === 0, `failed mount leaked a React root: ${duplicateRootWarnings.join(" | ")}`);
        return { initialError, reusedRootText: root.textContent, duplicateRootWarnings };
      } finally {
        console.error = originalConsoleError;
        try { mounted?.unmount(); } catch { /* preserve the probe's original failure */ }
        root.remove();
      }
    });

    await record("React adapter fails closed after an accepted snapshot has an invalid tree", () => {
      const root = newRoot();
      const initial = {
        state: { count: 0 },
        messages: [],
        tree: {
          Kind: 1,
          Tag: "div",
          Kids: [{
            Kind: 1,
            Tag: "button",
            On: [{ Event: "click", Message: "add", Arg: "" }],
            Kids: [{ Kind: 2, Text: "Add" }],
          }],
        },
        effects: [],
      };
      const acceptedButInvalid = {
        state: { count: 1 },
        messages: [{ Name: "add", Arg: "" }],
        tree: { Kind: 99 },
        effects: [],
      };
      let dispatchCalls = 0;
      let mounted;
      try {
        mounted = renderer(root, {
          init: () => clone(initial),
          dispatch: () => {
            dispatchCalls++;
            return clone(acceptedButInvalid);
          },
        });
        const staleButton = root.querySelector("button");
        assert(staleButton, "the valid initial React tree did not render its button");
        let clickError = null;
        try { mounted.click("0"); } catch (error) { clickError = String(error?.message ?? error); }
        assert(clickError, "React adapter accepted a dispatch result with an invalid Node.Kind");
        assert(canonical(mounted.snapshot()) === canonical(initial), "React adapter replaced its last valid snapshot with the invalid tree");

        // Native events on any retained old control and API calls after the
        // failed update must not ask Go for another state transition.
        staleButton.click();
        let secondClickRejected = false;
        try { mounted.click("0"); } catch { secondClickRejected = true; }
        assert(secondClickRejected, "React adapter accepted another click after failing closed");
        assert(dispatchCalls === 1, `failed renderer dispatched ${dispatchCalls} times instead of once`);
        return { dispatchCalls, lastValidSnapshotPreserved: true, secondClickRejected, failClosedError: clickError };
      } finally {
        try { mounted?.unmount(); } catch { /* preserve the probe's original failure */ }
        root.remove();
      }
    });

    return { probes: results, expectedErrors };
  });
}
