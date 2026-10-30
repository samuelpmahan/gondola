import assert from "node:assert/strict";
import { createCompositionReference } from "../../reference.mjs";

const manager = createCompositionReference();
const root = manager.create();
const child = manager.createChild(root);
manager.dispatch(child, { Path: "0", Event: "click", Value: "", Key: "add" });
manager.dispatch(root, { Path: "0", Event: "click", Value: "", Key: "add" });

const publishNode = (id) => manager.snapshot(id).tree.Kids[2].Kids[0].Kids[9];
const emptyChildDisabled = publishNode(child).Attrs.some((attr) => attr.Name === "disabled" && attr.Flag);
const rootDisabled = publishNode(root).Attrs.some((attr) => attr.Name === "disabled" && attr.Flag);
assert.equal(emptyChildDisabled, true);
assert.equal(rootDisabled, true);

manager.changes();
const beforeChild = manager.snapshot(child);
const beforeRoot = manager.snapshot(root);
let unsavedError = "";
try {
  manager.publish(child, 1, 0);
} catch (error) {
  unsavedError = error.message;
}
assert.match(unsavedError, /row 1 has no saved value to publish/);
assert.deepEqual(manager.snapshot(child), beforeChild);
assert.deepEqual(manager.snapshot(root), beforeRoot);
const dirtyAfterUnsuccessfulPublish = manager.changes();
assert.deepEqual(dirtyAfterUnsuccessfulPublish, []);

const rootBeforeDisabledDispatch = manager.snapshot(root);
manager.dispatch(root, {
  Path: "2/0/9", Event: "click", Value: "1/0", Key: "row-1-publish",
});
const rootAfterDisabledDispatch = manager.snapshot(root);
assert.deepEqual(rootAfterDisabledDispatch, rootBeforeDisabledDispatch);
const dirtyAfterRootDispatch = manager.changes();
assert.deepEqual(dirtyAfterRootDispatch, []);

process.stdout.write(JSON.stringify({
  root,
  child,
  emptyChildDisabled,
  rootDisabled,
  unsavedError,
  dirtyAfterUnsuccessfulPublish,
  rootDisabledDispatchUnchanged: true,
  dirtyAfterRootDispatch,
}) + "\n");
