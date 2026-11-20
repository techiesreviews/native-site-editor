// The helper's README says what it runs without asking and how its token travels (TOOLS-264 S2 and S3): each agent
// program it starts with `npx -y`, at the pinned version, and the start commands the editor copies.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { AGENT_COMMANDS } from "../helper/src/agents.ts";
import { HELPER_PACKAGE, HELPER_TOKEN_FILE, helperDetached } from "../src/agent-prompts.ts";

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
  const { systemd, nohup } = helperDetached("<url>");
  assert.ok(readme.includes(`\`${systemd}\``), systemd);
  assert.ok(readme.includes(`\`${nohup}\``), nohup);
  assert.ok(readme.includes(HELPER_PACKAGE));
});

test("the README says where the token file is, how to save it outside shell history, and no command holds a token (TOOLS-270)", () => {
  assert.ok(readme.includes(`\`${HELPER_TOKEN_FILE}\``));
  assert.ok(readme.includes(`\`(umask 077 && mkdir -p ~/.config/editor-helper && cat > ${HELPER_TOKEN_FILE})\``));
  assert.doesNotMatch(readme, /EDITOR_HELPER_TOKEN=|<token>/);
});
