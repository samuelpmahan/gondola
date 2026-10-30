// Per-request fetch completion tracking for held HTTP lab scenarios.
// The request record owns a promise in `done`; completion is tracked separately
// so a pending promise can never be mistaken for a truthy completion flag.

function errorText(error) {
  return String(error?.stack ?? error?.message ?? error);
}

/** Wrap fetch so tests can wait for one response without waiting on held peers. */
export function createFetchTracker(fetchCall, baseURL) {
  if (typeof fetchCall !== "function") throw new TypeError("fetchCall must be a function");
  if (typeof baseURL !== "string") throw new TypeError("baseURL must be a string");
  const records = new Map();

  function finish(id, error = null) {
    const record = records.get(id);
    if (!record || record.doneState) return;
    record.doneState = true;
    record.error = error ? errorText(error) : null;
    record.resolve();
  }

  const fetchImpl = async (url, init) => {
    const parsed = new URL(String(url), baseURL);
    const body = typeof init?.body === "string" ? JSON.parse(init.body) : null;
    const id = Number(body?.ID);
    if (!Number.isSafeInteger(id) || id < 1) throw new Error("tracked collection fetch did not contain its request ID");
    let resolve;
    const done = new Promise((ready) => { resolve = ready; });
    records.set(id, {
      id,
      mode: parsed.searchParams.get("mode") ?? "success",
      url: parsed.href,
      done,
      resolve,
      doneState: false,
      error: null,
    });
    try {
      const response = await fetchCall(url, init);
      if (!response || typeof response.text !== "function") throw new TypeError("fetch response must expose text()");
      const readText = response.text.bind(response);
      return {
        status: response.status,
        text: async () => {
          try {
            const content = await readText();
            finish(id);
            return content;
          } catch (error) {
            finish(id, error);
            throw error;
          }
        },
      };
    } catch (error) {
      finish(id, error);
      throw error;
    }
  };

  return {
    records,
    fetchImpl,
    finish,
    async waitFor(id) {
      const record = records.get(id);
      if (!record) throw new Error(`no tracked fetch was started for request ${id}`);
      await record.done;
      return record.error;
    },
  };
}
