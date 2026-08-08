import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { redactTranscript } from "../app/lib/crypto.server";

describe("redactTranscript", () => {
  it("removes contact details, verification codes, and payment numbers", () => {
    const input = [
      "Customer: My email is alex@example.com.",
      "Agent: Your verification code is 482019.",
      "Customer: Call +1 (503) 555-0199 and use 4242 4242 4242 4242.",
    ].join("\n");

    const output = redactTranscript(input);

    assert.doesNotMatch(output, /alex@example\.com/);
    assert.doesNotMatch(output, /482019/);
    assert.doesNotMatch(output, /503/);
    assert.doesNotMatch(output, /4242 4242/);
    assert.match(output, /\[email redacted\]/);
    assert.match(output, /\[phone redacted\]/);
    assert.match(output, /\[payment number redacted\]/);
  });

  it("removes exact call-specific values while keeping dialogue readable", () => {
    const input = "Customer: Send it to 118 Cedar Street, Portland. Agent: I read that back.";
    const output = redactTranscript(input, ["118 Cedar Street", "Portland"]);

    assert.equal(
      output,
      "Customer: Send it to [redacted], [redacted]. Agent: I read that back.",
    );
  });
});
