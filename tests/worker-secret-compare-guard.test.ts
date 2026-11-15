// Secrets the Worker holds are compared in constant time (`sameHex`), never with === or !== (TOOLS-264 S5). It reads
// `env.<…TOKEN|SECRET>` beside the operator on one line; a secret first copied into a local name is not caught.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test("no secret from the Worker's environment is compared with === or !==", () => {
  const source = readFileSync(new URL("../worker/app.ts", import.meta.url), "utf8");
  const plain = source.split("\n").flatMap((line, index) =>
    /[!=]==\s*env\.\w*(TOKEN|SECRET)\b|env\.\w*(TOKEN|SECRET)\s*[!=]==/.test(line) ? [`worker/app.ts:${index + 1}: ${line.trim()}`] : []);
  assert.deepEqual(plain, []);
});
