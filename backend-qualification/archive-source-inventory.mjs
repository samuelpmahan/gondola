const invalidRelativePath = (path) => typeof path !== "string" ||
  path.length === 0 ||
  path.includes("\0") ||
  path.includes("\\") ||
  path.startsWith("/") ||
  path.split("/").some((part) => part === "" || part === "." || part === "..");

// Completes a measured attempt inventory with every file represented by the
// frozen source-pin map. The caller still hashes each returned path before
// archiving it, so this function only chooses names and never supplies bytes.
export function buildArchiveSourceInventory(filePaths, sourcePins) {
  if (!Array.isArray(filePaths)) throw new TypeError("archive file paths must be an array");
  if (sourcePins === null || typeof sourcePins !== "object" || Array.isArray(sourcePins)) {
    throw new TypeError("source pins must be an object keyed by repository path");
  }

  const inventory = new Set();
  for (const path of filePaths) {
    if (invalidRelativePath(path)) throw new TypeError(`unsafe archive file path: ${String(path)}`);
    inventory.add(path);
  }
  for (const path of Object.keys(sourcePins)) {
    if (invalidRelativePath(path)) throw new TypeError(`unsafe pinned source path: ${String(path)}`);
    const member = `source/${path}`;
    if (invalidRelativePath(member)) throw new TypeError(`unsafe archived source path: ${member}`);
    inventory.add(member);
  }
  return [...inventory].sort();
}
