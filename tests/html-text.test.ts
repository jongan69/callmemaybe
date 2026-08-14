import assert from "node:assert/strict";
import test from "node:test";

import { stripHtml } from "../app/lib/html-text";

test("stripHtml keeps quoted greater-than signs inside tags", () => {
  assert.equal(
    stripHtml('<a title="1 > 0">Policy &amp; support</a>'),
    "Policy & support",
  );
});

test("stripHtml preserves malformed and non-tag text", () => {
  assert.equal(stripHtml("Value < 5 and <span"), "Value < 5 and <span");
});
