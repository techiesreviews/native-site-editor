import { strict as assert } from "node:assert";
import { test } from "node:test";
import { choosePinAgent, pinAgent } from "../src/pins-go-to.ts";

// "Pins go to" (ticket am-12): one choice per site (account and repository, every branch) in this browser.
const items = new Map<string, string>();
let broken = false;
Object.defineProperty(globalThis, "localStorage", {
  configurable: true,
  value: {
    getItem: (key: string) => { if (broken) throw new Error("SecurityError"); return items.get(key) ?? null; },
    setItem: (key: string, value: string) => { if (broken) throw new Error("SecurityError"); items.set(key, value); },
  } satisfies Pick<Storage, "getItem" | "setItem">,
});

test("each site keeps its own choice, whatever the account name's capitals; Claude Code until one is picked", () => {
  assert.equal(pinAgent({ account: "Lex", repoId: 1 }), "Claude Code");
  choosePinAgent({ account: "Lex", repoId: 1 }, "Codex");
  assert.equal(pinAgent({ account: "lex", repoId: 1 }), "Codex");
  assert.equal(pinAgent({ account: "LEX", repoId: 1 }), "Codex");
  assert.equal(pinAgent({ account: "lex", repoId: 2 }), "Claude Code");
});

test("an unknown kept value, or storage that refuses, reads as Claude Code", () => {
  choosePinAgent({ account: "lex", repoId: 3 }, "Someone else");
  assert.equal(pinAgent({ account: "lex", repoId: 3 }), "Claude Code");
  broken = true;
  try {
    assert.equal(pinAgent({ account: "lex", repoId: 1 }), "Claude Code");
    assert.doesNotThrow(() => choosePinAgent({ account: "lex", repoId: 1 }, "Codex"));
  } finally { broken = false; }
});
