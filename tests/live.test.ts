import { test } from "node:test";
import assert from "node:assert/strict";
import { fingerprint, notifyChat } from "../lib/live";

test("the fingerprint is stable and changes with the content", () => {
  assert.equal(fingerprint({ a: 1, b: [1, 2] }), fingerprint({ a: 1, b: [1, 2] }));
  assert.notEqual(fingerprint({ a: 1 }), fingerprint({ a: 2 }));
});

test("notifying a chat with nobody waiting is harmless", () => {
  assert.doesNotThrow(() => notifyChat(123));
});
