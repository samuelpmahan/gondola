import { createKeyedHost } from "../keyed-editor/host.mjs";
import { validateManifest, validateSnapshotAgainstManifest } from "./protocol.mjs";

function fail(message, cause) {
  throw new Error(`renderer registry: ${message}`, cause === undefined ? undefined : { cause });
}

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function descriptorEntries(descriptors) {
  if (Array.isArray(descriptors)) return descriptors.map((value) => [value?.name, value]);
  if (descriptors instanceof Map) return [...descriptors.entries()];
  if (isRecord(descriptors)) return Object.entries(descriptors);
  fail("descriptors must be an array, Map, or name-to-descriptor object");
}

/** Make a renderer declaration from the generated Go manifest. */
export function descriptor(name, mount, manifest) {
  validateManifest(manifest);
  if (typeof name !== "string" || name.length === 0) fail("descriptor name must be a non-empty string");
  if (typeof mount !== "function") fail(`descriptor ${JSON.stringify(name)} mount must be a function`);
  return {
    name,
    protocol: manifest.protocol,
    version: manifest.version,
    capabilities: [...manifest.capabilities],
    methods: [...manifest.methods],
    mount,
  };
}

/** Validate declarations without calling a runtime, renderer, or transport. */
export function validateNegotiation(descriptors, untrustedManifest) {
  const manifest = validateManifest(untrustedManifest);
  const entries = descriptorEntries(descriptors);
  const result = new Map();
  for (const [entryName, value] of entries) {
    if (!isRecord(value)) fail(`descriptor ${JSON.stringify(entryName)} must be an object`);
    const name = value.name;
    if (typeof name !== "string" || name.length === 0) fail("descriptor name must be a non-empty string");
    if (entryName !== name) fail(`descriptor key ${JSON.stringify(entryName)} does not match its name ${JSON.stringify(name)}`);
    if (result.has(name)) fail(`duplicate renderer descriptor ${JSON.stringify(name)}`);
    if (value.protocol !== manifest.protocol) {
      fail(`renderer ${JSON.stringify(name)} protocol ${JSON.stringify(value.protocol)} does not match ${JSON.stringify(manifest.protocol)}`);
    }
    if (value.version !== manifest.version) {
      fail(`renderer ${JSON.stringify(name)} version ${JSON.stringify(value.version)} does not match ${JSON.stringify(manifest.version)}`);
    }
    if (!Array.isArray(value.capabilities) || manifest.capabilities.some((capability) => !value.capabilities.includes(capability))) {
      fail(`renderer ${JSON.stringify(name)} is missing a required capability`);
    }
    if (!Array.isArray(value.methods) || manifest.methods.some((method) => !value.methods.includes(method))) {
      fail(`renderer ${JSON.stringify(name)} is missing a declared method required by the manifest`);
    }
    if (typeof value.mount !== "function") fail(`renderer ${JSON.stringify(name)} must declare a mount function`);
    result.set(name, value);
  }
  if (result.size === 0) fail("at least one renderer descriptor is required");
  return result;
}

function guardedMount(name, declaration, manifest) {
  return (root, facade) => {
    // Reject a snapshot outside the generated profile before the candidate
    // renderer gets a chance to mutate the host DOM during mount.
    validateSnapshotAgainstManifest(facade.init(), manifest);
    const checkedFacade = {
      init() { return validateSnapshotAgainstManifest(facade.init(), manifest); },
      dispatch(...args) { return validateSnapshotAgainstManifest(facade.dispatch(...args), manifest); },
      rendererFailed(error) {
        return typeof facade.rendererFailed === "function" ? facade.rendererFailed(error) : false;
      },
    };

    let api;
    try {
      api = declaration.mount(root, checkedFacade);
      if (!api || typeof api !== "object" || Array.isArray(api)) {
        fail(`renderer ${JSON.stringify(name)} mount must return an API object`);
      }
      for (const method of manifest.methods) {
        if (typeof api[method] !== "function") {
          fail(`renderer ${JSON.stringify(name)} API must provide ${method}()`);
        }
      }

      const checkedApi = {};
      for (const method of manifest.methods) {
        checkedApi[method] = (...args) => {
          if (method === "update" && args.length > 0) validateSnapshotAgainstManifest(args[0], manifest);
          const result = Reflect.apply(api[method], api, args);
          return method === "snapshot" ? validateSnapshotAgainstManifest(result, manifest) : result;
        };
      }
      return checkedApi;
    } catch (error) {
      if (api && typeof api.unmount === "function") {
        try { api.unmount(); } catch { /* preserve the mount or API-shape failure */ }
      }
      throw error;
    }
  };
}

/** Create the existing keyed host only after every candidate declaration passes negotiation. */
export function createNegotiatedHost(root, runtime, descriptors, transport, initialBackend, manifest) {
  const admitted = validateNegotiation(descriptors, manifest);
  if (typeof initialBackend !== "string" || !admitted.has(initialBackend)) {
    fail(`unknown initial renderer ${JSON.stringify(initialBackend)}`);
  }
  const mounts = new Map();
  for (const [name, declaration] of admitted) {
    mounts.set(name, guardedMount(name, declaration, manifest));
  }
  const host = createKeyedHost(root, runtime, mounts, transport, initialBackend);
  return {
    ...host,
    snapshot() { return validateSnapshotAgainstManifest(host.snapshot(), manifest); },
  };
}
