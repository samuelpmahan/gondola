// Real-browser adversarial probes for the controlled-input renderer pair.
// The harness installs window.__inputExperiment with the host, both Go-backed
// renderers, captured Go runtimes, and an independent reference mount.

/**
 * Exercise the public browser renderers and host against edge cases that are
 * awkward to cover with static snapshots alone. Each result is an explicit
 * pass/fail record so the calling harness can retain every observation.
 */
export async function runAdversarial(page) {
  if (!page || typeof page.evaluate !== "function" || typeof page.locator !== "function" ||
      !page.keyboard || typeof page.keyboard.type !== "function") {
    throw new TypeError("runAdversarial(page) requires a Playwright-compatible page");
  }

  const result = await page.evaluate(async () => {
    const experiment = window.__inputExperiment;
    const probes = [];
    const expectedErrors = [];
    const runtimeSentinel = "__EXPECTED_INPUT_RUNTIME_FAILURE__";
    let rootSequence = 0;

    const assert = (condition, message) => {
      if (!condition) throw new Error(message);
    };
    const clone = (value) => structuredClone(value);
    const canonical = (value) => JSON.stringify(value);
    const errorText = (error) => String(error?.stack ?? error?.message ?? error);
    const errorChain = (error) => {
      const chain = [];
      const seen = new Set();
      let current = error;
      while (current && !seen.has(current)) {
        seen.add(current);
        chain.push(`${current.name ?? "Error"}: ${current.message ?? String(current)}`);
        current = current.cause;
      }
      return chain;
    };
    const record = (name, probe) => {
      try {
        probes.push({ name, pass: true, observations: probe() });
      } catch (error) {
        probes.push({ name, pass: false, observations: { error: errorText(error) } });
      }
    };
    const newRoot = (label) => {
      const root = document.createElement("div");
      root.id = `input-adversarial-${label}-${++rootSequence}`;
      root.dataset.inputAdversarialRoot = "true";
      document.body.appendChild(root);
      return root;
    };
    const removeRoot = (root) => root?.remove();
    const cleanup = (root, api) => {
      try { api?.unmount?.(); } finally { removeRoot(root); }
    };
    const fixedRuntime = (snapshot) => ({
      init: () => clone(snapshot),
      dispatch: () => clone(snapshot),
    });
    const recordedRuntime = (runtime) => {
      const calls = [];
      return {
        calls,
        runtime: {
          init() { return runtime.init(); },
          dispatch(step) {
            calls.push(clone(step));
            return runtime.dispatch(step);
          },
        },
      };
    };
    const inputAt = (root) => root.querySelector('input[type="text"][aria-label="Draft"]');
    const buttonAt = (root, name) => root.querySelector(`button.${name}`);
    const lastErrorAt = (api) => typeof api?.lastError === "function" ? api.lastError() : api?.lastError;

    if (!experiment || typeof experiment.createBackendHost !== "function" ||
        typeof experiment.renderers?.dom !== "function" || typeof experiment.renderers?.react !== "function" ||
        !experiment.runtimes?.dom || typeof experiment.runtimes.dom.init !== "function" ||
        typeof experiment.runtimes.dom.dispatch !== "function") {
      return {
        probes: [{
          name: "controlled-input fixture contract",
          pass: false,
          observations: {
            error: "window.__inputExperiment must expose createBackendHost, renderers.dom/react, and runtimes.dom",
          },
        }],
        expectedErrors,
      };
    }

    try {
      await experiment.readyPromise;
    } catch (error) {
      return {
        probes: [{ name: "controlled-input fixture readiness", pass: false, observations: { error: errorText(error) } }],
        expectedErrors,
      };
    }

    record("native disabled Save and Reset clicks dispatch nothing", () => {
      const observations = [];
      for (const backend of ["dom", "react"]) {
        const root = newRoot(`disabled-controls-${backend}`);
        const recorded = recordedRuntime(experiment.runtimes.dom);
        let host;
        try {
          host = experiment.createBackendHost(root, recorded.runtime, experiment.renderers, backend);
          const before = host.snapshot();
          const save = buttonAt(root, "save");
          const reset = buttonAt(root, "reset");
          assert(save && reset, `${backend} renderer did not produce Save and Reset buttons`);
          assert(save.disabled && reset.disabled, `${backend} Save and Reset must be disabled in the empty state`);
          save.click();
          reset.click();
          const after = host.snapshot();
          assert(recorded.calls.length === 0,
            `${backend} renderer called runtime.dispatch() ${recorded.calls.length} time(s) for disabled native clicks`);
          assert(canonical(after) === canonical(before), `${backend} native clicks changed the Go snapshot`);
          assert(after.messages.length === 0, `${backend} disabled native clicks appended messages`);
          observations.push({ backend, saveDisabled: save.disabled, resetDisabled: reset.disabled, dispatchCalls: recorded.calls.length });
        } finally {
          cleanup(root, host);
        }
      }
      return observations;
    });

    record("empty, Unicode, escaping, repeated save, and reset stay exact", () => {
      const root = newRoot("values");
      const host = experiment.createBackendHost(root, experiment.runtimes.dom, experiment.renderers, "dom");
      const input = inputAt(root);
      assert(input, "renderer did not produce the bound Draft input");
      const observations = [];
      try {
        input.value = "";
        input.dispatchEvent(new Event("input", { bubbles: true }));
        let snapshot = host.snapshot();
        assert(snapshot.state.Draft === "", "empty input value did not remain empty in Go state");
        assert(snapshot.messages.at(-1)?.Name === "edit" && snapshot.messages.at(-1)?.Arg === "",
          "empty input event was not delivered as edit with an empty Arg");
        host.click("3");
        snapshot = host.snapshot();
        assert(snapshot.state.Saves === 0, "disabled empty save changed the save count");
        observations.push({ emptyDraft: snapshot.state.Draft, saves: snapshot.state.Saves });

        const text = '雪🚀 <img src=x onerror="boom"> & "quotes"';
        const currentInput = inputAt(root);
        currentInput.value = text;
        currentInput.dispatchEvent(new Event("input", { bubbles: true }));
        host.click("3");
        host.click("3");
        snapshot = host.snapshot();
        const saved = root.querySelector("p")?.textContent ?? "";
        assert(snapshot.state.Draft === text && snapshot.state.Saved === text,
          "Unicode or markup-shaped text changed while editing or saving");
        assert(snapshot.state.Saves === 2, "repeated save did not increment the Go save count twice");
        assert(saved === `Saved: ${text}`, "saved text did not render as literal text content");
        assert(root.querySelector("img") === null, "markup-shaped input created an HTML element");
        assert(!root.innerHTML.includes("<img"), "markup-shaped input escaped the text rendering boundary");
        assert(snapshot.messages.at(-1)?.Name === "save" && snapshot.messages.at(-1)?.Arg === "",
          "Save did not retain its literal empty argument");
        observations.push({ draft: snapshot.state.Draft, saved, saves: snapshot.state.Saves });

        host.click("4");
        snapshot = host.snapshot();
        assert(snapshot.state.Draft === "" && snapshot.state.Saved === "" && snapshot.state.Saves === 0,
          "Reset did not clear all editor state");
        assert(buttonAt(root, "save").disabled && buttonAt(root, "reset").disabled,
          "reset render did not disable both controls again");
        observations.push({ reset: snapshot.state, messages: snapshot.messages.length });
        return observations;
      } finally {
        cleanup(root, host);
      }
    });

    record("literal button Arg cannot be overridden by input or DOM properties", () => {
      const observations = [];
      for (const backend of ["dom", "react"]) {
        const root = newRoot(`literal-${backend}`);
        const recorded = recordedRuntime(experiment.runtimes.dom);
        let host;
        try {
          host = experiment.createBackendHost(root, recorded.runtime, experiment.renderers, backend);
          const input = inputAt(root);
          assert(input, `${backend} renderer did not produce the bound Draft input`);
          input.value = "attempted-override";
          input.dispatchEvent(new Event("input", { bubbles: true }));
          const save = buttonAt(root, "save");
          assert(save && !save.disabled, `${backend} renderer did not enable Save after editing`);
          save.value = "forged-value";
          save.dataset.arg = "forged-argument";
          save.dataset.message = "forged-message";
          save.click();

          assert(recorded.calls.length === 2, `${backend} renderer dispatched an unexpected number of steps`);
          assert(canonical(recorded.calls[0]) === canonical({ Path: "0", Event: "input", Value: "attempted-override" }),
            `${backend} input binding did not dispatch currentTarget.value`);
          assert(canonical(recorded.calls[1]) === canonical({ Path: "3", Event: "click", Value: "" }),
            `${backend} Save click did not dispatch the declared literal empty Arg`);
          const finalMessage = host.snapshot().messages.at(-1);
          assert(finalMessage?.Name === "save" && finalMessage?.Arg === "",
            `${backend} Save message Arg was changed by a DOM property`);
          observations.push({ backend, steps: recorded.calls, finalMessage });
        } finally {
          cleanup(root, host);
        }
      }
      return observations;
    });

    record("invalid bindings, collisions, and unsupported source semantics are rejected", () => {
      const base = experiment.runtimes.dom.init();
      const input = (snapshot) => snapshot.tree.Kids[0];
      const invalidSnapshots = [
        ["duplicate path/event binding", /duplicate binding for "0" "input"/i,
          (snapshot) => snapshot.bindings.push(clone(snapshot.bindings[0]))],
        ["unsupported Node.On input event at the binding path", /Node\.On at 0 must contain non-empty Event and Message and string Arg fields/i,
          (snapshot) => {
          input(snapshot).On = [{ Event: "input", Message: "edit", Arg: "literal" }];
        }],
        ["unsupported source", /unsupported binding "input" from "target\.checked"/i,
          (snapshot) => { snapshot.bindings[0].Source = "target.checked"; }],
        ["unsupported event", /unsupported binding "change" from "target\.value"/i,
          (snapshot) => { snapshot.bindings[0].Event = "change"; }],
        ["non-canonical path", /path must be .* canonical child indexes/i,
          (snapshot) => { snapshot.bindings[0].Path = "00"; }],
        ["missing value attribute", /target\.value binding at "0" requires input\[type=text\]/i,
          (snapshot) => {
          input(snapshot).Attrs = input(snapshot).Attrs.filter((attr) => attr.Name !== "value");
        }],
        ["duplicate value attribute", /duplicate attribute "value" at 0/i,
          (snapshot) => {
          input(snapshot).Attrs.push(clone(input(snapshot).Attrs.find((attr) => attr.Name === "value")));
        }],
      ];
      const rejected = [];
      for (const backend of ["dom", "react"]) {
        const renderer = experiment.renderers[backend];
        for (const [label, expectedReason, mutate] of invalidSnapshots) {
          const snapshot = clone(base);
          mutate(snapshot);
          const root = newRoot(`invalid-${backend}`);
          let mounted = null;
          let rejection = null;
          try {
            try { mounted = renderer(root, fixedRuntime(snapshot)); }
            catch (error) { rejection = error; }
            assert(rejection, `${backend} renderer accepted ${label}`);
            const causes = errorChain(rejection);
            assert(expectedReason.test(causes.join("\n")),
              `${backend} rejected ${label} for the wrong reason; expected ${expectedReason}, got ${causes.join(" -> ")}`);
            assert(root.childElementCount === 0, `${backend} renderer left DOM behind after ${label}`);
            rejected.push({ backend, label, rejection: causes });
          } finally {
            cleanup(root, mounted);
          }
        }
      }
      return { rejected };
    });

    record("failed React mount leaves the actual browser root reusable", () => {
      const root = newRoot("react-reuse");
      const valid = experiment.runtimes.dom.init();
      const invalid = clone(valid);
      invalid.bindings[0].Source = "target.checked";
      let mounted = null;
      const warnings = [];
      const originalConsoleError = console.error;
      let initialError = null;
      try {
        console.error = (...args) => {
          warnings.push(args.map((arg) => String(arg)).join(" "));
          return originalConsoleError.apply(console, args);
        };
        try { experiment.renderers.react(root, fixedRuntime(invalid)); }
        catch (error) { initialError = error; }
        assert(initialError, "React renderer accepted an invalid initial sidecar");
        const initialErrorChain = errorChain(initialError);
        assert(/unsupported binding "input" from "target\.checked"/i.test(initialErrorChain.join("\n")),
          `React renderer rejected the bad sidecar for the wrong reason: ${initialErrorChain.join(" -> ")}`);
        assert(root.childElementCount === 0, "failed React mount left partial DOM in its root");

        mounted = experiment.renderers.react(root, fixedRuntime(valid));
        assert(inputAt(root), "valid React remount did not render into the reused root");
        const duplicateRootWarnings = warnings.filter((warning) =>
          /createRoot|already been passed|already has a root/i.test(warning));
        assert(duplicateRootWarnings.length === 0,
          `failed React mount leaked root ownership: ${duplicateRootWarnings.join(" | ")}`);
        return { initialError: initialErrorChain, reusedRoot: true, duplicateRootWarnings };
      } finally {
        console.error = originalConsoleError;
        cleanup(root, mounted);
      }
    });

    record("native input runtime errors are observed and fence each renderer", () => {
      const observations = [];
      const runtime = experiment.runtimes.dom;
      for (const backend of ["dom", "react"]) {
        const root = newRoot(`runtime-error-${backend}`);
        const empty = runtime.init();
        const armed = runtime.dispatch({ Path: "0", Event: "input", Value: "armed" });
        assert(armed.state.Draft === "armed", "could not prepare a valid enabled-input snapshot");
        const calls = [];
        const failingRuntime = {
          init() { return clone(armed); },
          dispatch(step) {
            calls.push(clone(step));
            return { error: runtimeSentinel };
          },
        };
        let renderer = null;
        try {
          renderer = experiment.renderers[backend](root, failingRuntime);
          const before = renderer.snapshot();
          const field = inputAt(root);
          assert(field, `${backend} renderer did not produce an input`);
          field.value = "first failure";
          field.dispatchEvent(new Event("input", { bubbles: true }));
          const observedError = lastErrorAt(renderer);
          assert(observedError, `${backend} renderer did not retain its input dispatch error`);
          assert(String(observedError.message ?? observedError).includes(runtimeSentinel),
            `${backend} renderer retained the wrong input dispatch error`);
          assert(calls.length === 1, `${backend} renderer called the failing runtime ${calls.length} times`);
          assert(canonical(renderer.snapshot()) === canonical(before),
            `${backend} renderer replaced its last accepted snapshot after an input error`);

          field.value = "must stay fenced";
          field.dispatchEvent(new Event("input", { bubbles: true }));
          assert(calls.length === 1, `${backend} renderer dispatched again after recording its input failure`);
          assert(canonical(renderer.snapshot()) === canonical(before),
            `${backend} renderer changed its last accepted snapshot after a second event`);
          observations.push({
            backend,
            dispatchCount: calls.length,
            dispatchedStep: calls[0],
            observedError: String(observedError.message ?? observedError),
            lastAcceptedDraft: before.state.Draft,
            rendererFenced: true,
          });
        } finally {
          cleanup(root, renderer);
        }
        // `empty` is intentionally read before the next backend to keep each
        // failing renderer's initial Go-side session isolated.
        assert(empty.state.Draft === "", "Go init did not start from an empty editor state");
      }
      return observations;
    });

    record("host remains snapshot-readable after a renderer-local native input error", () => {
      const root = newRoot("host-native-error");
      const base = experiment.runtimes.dom;
      const armed = base.dispatch({ Path: "0", Event: "input", Value: "armed" });
      const calls = [];
      const runtime = {
        init() { return clone(armed); },
        dispatch(step) {
          calls.push(clone(step));
          return { error: runtimeSentinel };
        },
      };
      let renderer = null;
      let host;
      try {
        const renderers = {
          ...experiment.renderers,
          dom(target, facade) {
            renderer = experiment.renderers.dom(target, facade);
            return renderer;
          },
        };
        host = experiment.createBackendHost(root, runtime, renderers, "dom");
        const before = host.snapshot();
        const field = inputAt(root);
        field.value = "native failure";
        field.dispatchEvent(new Event("input", { bubbles: true }));
        assert(lastErrorAt(renderer), "DOM renderer did not retain the native input error");
        assert(calls.length === 1, "host did not make exactly one native input dispatch");
        assert(canonical(host.snapshot()) === canonical(before),
          "native input error changed the host's last accepted snapshot");
        return {
          dispatchCount: calls.length,
          rendererError: String(lastErrorAt(renderer).message ?? lastErrorAt(renderer)),
          hostSnapshotReadable: true,
          hostSnapshotPreserved: true,
          limitation: "The unchanged host does not fence itself for direct native input failures; the renderer records lastError and fences its input callback.",
        };
      } finally {
        cleanup(root, host);
      }
    });

    record("detached inputs cannot dispatch after swaps or host unmount", () => {
      const root = newRoot("detached-inputs");
      const recorded = recordedRuntime(experiment.runtimes.dom);
      let host;
      try {
        host = experiment.createBackendHost(root, recorded.runtime, experiment.renderers, "dom");
        const before = host.snapshot();
        const staleDOMInput = inputAt(root);
        host.replaceBackend("react");
        staleDOMInput.value = "stale DOM input";
        staleDOMInput.dispatchEvent(new Event("input", { bubbles: true }));
        assert(recorded.calls.length === 0, "detached DOM input dispatched after swap to React");
        assert(canonical(host.snapshot()) === canonical(before), "detached DOM input changed the snapshot");

        const staleReactInput = inputAt(root);
        host.replaceBackend("dom");
        staleReactInput.value = "stale React input";
        staleReactInput.dispatchEvent(new Event("input", { bubbles: true }));
        assert(recorded.calls.length === 0, "detached React input dispatched after swap to DOM");
        assert(canonical(host.snapshot()) === canonical(before), "detached React input changed the snapshot");

        const inputBeforeUnmount = inputAt(root);
        host.unmount();
        host = null;
        inputBeforeUnmount.value = "after unmount";
        inputBeforeUnmount.dispatchEvent(new Event("input", { bubbles: true }));
        assert(recorded.calls.length === 0, "input dispatched after host unmount");
        assert(root.childElementCount === 0, "host unmount left editor DOM attached");
        return { dispatchCount: recorded.calls.length, detachedEvents: 3, afterUnmountChildren: root.childElementCount };
      } finally {
        cleanup(root, host);
      }
    });

    // Keep a unique root for the Playwright keyboard test. It runs last so
    // earlier probes may freely reset and reuse the captured Go session.
    const root = newRoot("keyboard-typing");
    const host = experiment.createBackendHost(root, experiment.runtimes.dom, experiment.renderers, "dom");
    window.__inputAdversarialTyping = { root, host };
    return {
      probes,
      expectedErrors,
      typingRootId: root.id,
      typingInitial: clone(host.snapshot()),
    };
  });

  if (!result?.typingRootId) return result;

  const typingProbe = { name: "ordinary multi-key typing keeps focus and controlled value after every render" };
  try {
    const selector = `#${result.typingRootId} input[type="text"][aria-label="Draft"]`;
    let expected = "";
    const typeChars = async (characters, backend) => {
      const input = page.locator(selector);
      await input.focus();
      // Renderer replacement remounts the DOM input and caret restoration is
      // outside this milestone. Place the caret explicitly at the end before
      // testing ordinary typing within each renderer.
      await input.press("End");
      const handle = await input.elementHandle();
      if (!handle) throw new Error(`${backend} input could not be selected`);
      for (const character of characters) {
        await page.keyboard.type(character);
        expected += character;
        const observation = await handle.evaluate((element) => {
          const mounted = window.__inputAdversarialTyping;
          const snapshot = mounted.host.snapshot();
          return {
            connected: element.isConnected,
            focused: document.activeElement === element,
            value: element.value,
            selectionStart: element.selectionStart,
            selectionEnd: element.selectionEnd,
            stateDraft: snapshot.state.Draft,
            lastMessage: snapshot.messages.at(-1) ?? null,
          };
        });
        if (!observation.connected) throw new Error(`${backend} render replaced the input element during typing`);
        if (!observation.focused) throw new Error(`${backend} render lost input focus after ${JSON.stringify(character)}`);
        if (observation.value !== expected || observation.stateDraft !== expected) {
          throw new Error(`${backend} controlled value mismatch after ${JSON.stringify(character)}: ${JSON.stringify(observation)}`);
        }
        if (observation.selectionStart !== expected.length || observation.selectionEnd !== expected.length) {
          throw new Error(`${backend} typing moved the caret unexpectedly after ${JSON.stringify(character)}: ${JSON.stringify(observation)}`);
        }
        if (observation.lastMessage?.Name !== "edit" || observation.lastMessage.Arg !== expected) {
          throw new Error(`${backend} did not dispatch the complete current input value after each key`);
        }
      }
      await handle.dispose();
    };

    await typeChars("abc", "DOM");
    const beforeSwap = await page.evaluate(() => window.__inputAdversarialTyping.host.snapshot());
    await page.evaluate(() => window.__inputAdversarialTyping.host.replaceBackend("react"));
    const afterSwap = await page.evaluate(() => window.__inputAdversarialTyping.host.snapshot());
    if (canonicalForNode(beforeSwap) !== canonicalForNode(afterSwap)) {
      throw new Error("renderer swap changed the Go state or ordered message history");
    }
    await typeChars("123", "React");
    const final = await page.evaluate(() => {
      const { root, host } = window.__inputAdversarialTyping;
      const input = root.querySelector('input[type="text"][aria-label="Draft"]');
      return {
        backend: host.backendName(),
        snapshot: host.snapshot(),
        inputValue: input?.value ?? null,
        domHTML: root.innerHTML,
      };
    });
    if (final.backend !== "react" || final.snapshot.state.Draft !== "abc123" || final.inputValue !== "abc123") {
      throw new Error(`final controlled input state was incorrect: ${JSON.stringify(final)}`);
    }
    typingProbe.pass = true;
    typingProbe.observations = {
      typed: ["a", "b", "c", "1", "2", "3"],
      backendAfterSwap: final.backend,
      draft: final.snapshot.state.Draft,
      editMessages: final.snapshot.messages.length,
      actualInputValue: final.inputValue,
      renderedHTML: final.domHTML,
      focusAndValueCheckedAfterEveryKeystroke: true,
    };
  } catch (error) {
    typingProbe.pass = false;
    typingProbe.observations = { error: String(error?.stack ?? error?.message ?? error) };
  } finally {
    try {
      await page.evaluate(() => {
        const mounted = window.__inputAdversarialTyping;
        try { mounted?.host?.unmount?.(); } finally { mounted?.root?.remove?.(); }
        delete window.__inputAdversarialTyping;
      });
    } catch (error) {
      typingProbe.cleanupError = String(error?.stack ?? error?.message ?? error);
      typingProbe.pass = false;
    }
  }

  return {
    probes: [...(result.probes ?? []), typingProbe],
    expectedErrors: result.expectedErrors ?? [],
  };
}

function canonicalForNode(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalForNode).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalForNode(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}
