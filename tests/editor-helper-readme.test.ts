// The helper's README says what it runs without asking and how its token travels (TOOLS-263 S2 and S3): each agent
// program it starts with `npx -y`, at the pinned version, and the start commands the editor copies.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { AGENT_COMMANDS } from "../helper/src/agents.ts";
import { HELPER_PACKAGE, helperDetached } from "../src/agent-prompts.ts";

const readme = readFileSync(new URL("../helper/README.md", import.meta.url), "utf8");

test("the README names every agent package the helper installs unasked, at its pinned version", () => {
  const security = readme.slice(readme.indexOf("## Security"));
  assert.ok(security.startsWith("## Security"), "a Security section");
  for (const command of Object.values(AGENT_COMMANDS)) {
    const pinned = command.find(part => /@\d/.test(part.slice(1)))!;
    assert.ok(security.includes(`\`${pinned}\``), pinned);
  }
  assert.match(security, /not checked against a hash/);
});

test("the README's start commands are the ones the editor copies", () => {
  const { systemd, nohup } = helperDetached("<url>", "<token>");
  assert.ok(readme.includes(`\`${systemd}\``), systemd);
  assert.ok(readme.includes(`\`${nohup}\``), nohup);
  assert.ok(readme.includes(HELPER_PACKAGE));
});
