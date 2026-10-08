import { test } from "node:test";
import assert from "node:assert/strict";
import { forgetBootMemory, memoryMatches, provenFiles, readBootMemory, writeBootMemory, type BootMemory } from "../src/boot-memory.ts";

function store() {
  const values = new Map<string, string>();
  return {
    values,
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); },
    removeItem: (key: string) => { values.delete(key); },
    key: (index: number) => [...values.keys()][index] ?? null,
    get length() { return values.size; },
  };
}
const sha = (n: number) => n.toString(16).padStart(40, "0");
const memory = (repoId = 7, extra: Partial<BootMemory> = {}): BootMemory => ({
  login: "Lex", repoId, fullName: "lex/site", branch: "main", commit: sha(99),
  files: [{ path: "index.html", sha: sha(1) }, { path: "styles/site.css", sha: sha(2) }], ...extra,
});

test("round trip keeps names and SHAs under a versioned per-repository key", () => {
  const s = store();
  writeBootMemory(s, memory());
  assert.deepEqual([...s.values.keys()], ["ase:boot-memory:v1:7"]);
  assert.deepEqual(readBootMemory(s, 7), memory());
  assert.equal(readBootMemory(s, 8), undefined);
});

test("malformed, foreign or oversized records are ignored and removed", () => {
  for (const raw of ["{", "null", JSON.stringify({ ...memory(), repoId: 8 }), JSON.stringify({ ...memory(), files: [{ path: "a", sha: "zz" }] }),
    JSON.stringify({ ...memory(), login: 3 }), "x".repeat(5000)]) {
    const s = store();
    s.setItem("ase:boot-memory:v1:7", raw);
    assert.equal(readBootMemory(s, 7), undefined, raw.slice(0, 40));
    assert.equal(s.values.size, 0);
  }
});

test("files are capped by count and bytes; storage errors are swallowed", () => {
  const s = store();
  writeBootMemory(s, memory(7, { files: Array.from({ length: 60 }, (_, i) => ({ path: `p/${"x".repeat(150)}${i}.css`, sha: sha(i + 1) })) }));
  const kept = readBootMemory(s, 7)!;
  assert.ok(kept.files.length <= 20 && kept.files.length > 0);
  assert.ok(s.values.get("ase:boot-memory:v1:7")!.length <= 4096);
  const broken = { getItem() { throw new Error("no"); }, setItem() { throw new Error("no"); }, removeItem() { throw new Error("no"); } };
  assert.equal(readBootMemory(broken, 7), undefined);
  writeBootMemory(broken, memory());
  forgetBootMemory(broken);
});

test("at most five records; the oldest goes; forget clears one or all", async () => {
  const s = store();
  for (let id = 1; id <= 6; id++) {
    writeBootMemory(s, memory(id));
    await new Promise((resolve) => setTimeout(resolve, 2));
  }
  assert.equal(readBootMemory(s, 1), undefined);
  assert.ok(readBootMemory(s, 6));
  assert.equal(s.values.size, 5);
  forgetBootMemory(s, 6);
  assert.equal(s.values.size, 4);
  s.setItem("other", "kept");
  forgetBootMemory(s);
  assert.deepEqual([...s.values.keys()], ["other"]);
});

test("adoption needs the same account (any case), repository id and name, and branch", () => {
  const m = memory();
  assert.ok(memoryMatches(m, "lex", { id: 7, full_name: "lex/site" }, "main"));
  assert.ok(!memoryMatches(m, "other", { id: 7, full_name: "lex/site" }, "main"));
  assert.ok(!memoryMatches(m, undefined, { id: 7, full_name: "lex/site" }, "main"));
  assert.ok(!memoryMatches(m, "lex", { id: 7, full_name: "lex/renamed" }, "main"));
  assert.ok(!memoryMatches(m, "lex", { id: 8, full_name: "lex/site" }, "main"));
  assert.ok(!memoryMatches(m, "lex", { id: 7, full_name: "lex/site" }, "dev"));
});

test("only files whose path still has the remembered SHA are proven", () => {
  assert.deepEqual(provenFiles(memory(), [{ path: "index.html", sha: sha(1) }, { path: "styles/site.css", sha: sha(3) }]), [{ path: "index.html", sha: sha(1) }]);
  assert.deepEqual(provenFiles(memory(), [{ path: "about.html", sha: sha(1) }]), []);
});
