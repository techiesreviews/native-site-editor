import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { parse, ts } from "./support/source-guard.ts";

// The hosts that take the shared host modules (src/host-modules.ts) whole, in place of their loose callbacks.
const HOSTS = [
  { file: "src/pages-and-files-host.ts", ports: "PagesAndFilesPorts", ceiling: 30 },
  { file: "src/workspace-boot.ts", ports: "WorkspaceBootPorts", ceiling: 30 },
];
const SHARED = ["notices", "session", "repo", "view", "panels", "preview"];
// Members of a shared module: a host takes them through the module, never as a loose port of their own.
const MODULE_MEMBERS = ["status", "settleStatus", "clearError", "errorMessage", "announce", "workspaceSession", "nextLoad", "currentLoad", "stampOf", "draftScope",
  "api", "apiResponse", "readFile", "readFiles", "entryAt", "findEntry", "fileGeneration", "setCurrentPage", "showDirectory", "openNewDraft", "openEntry", "mountSource",
  "restoreFile", "loadSnapshot", "updateAgentContext", "updateCurrentPageLabel", "updatePreview", "content", "files", "explorerDropdown", "siteActions", "branchSelect"];

function portNames(source: string, file: string, name: string): string[] {
  const tree = parse(source, file);
  const declared = tree.statements.find((at): at is ts.InterfaceDeclaration => ts.isInterfaceDeclaration(at) && at.name.text === name);
  assert.ok(declared, `${file} declares ${name}`);
  return declared.members.map((item) => item.name?.getText(tree) ?? "");
}

for (const host of HOSTS) {
  test(`${host.ports} takes the shared host modules whole and stays within ${host.ceiling} ports`, () => {
    const names = portNames(readFileSync(new URL(`../${host.file}`, import.meta.url), "utf8"), host.file, host.ports);
    for (const shared of SHARED) assert.ok(names.includes(shared), `${host.ports} takes ${shared}`);
    assert.deepEqual(names.filter((item) => MODULE_MEMBERS.includes(item)), [], `${host.ports} takes these through a module`);
    assert.ok(names.length <= host.ceiling, `${host.ports} has ${names.length} ports, above ${host.ceiling}`);
  });
}

test("a loose port that belongs to a shared module, and a ports list over its ceiling, are named", () => {
  const source = "export interface P { notices: N; session: S; repo: R; view: V; panels: X; preview: Y; status(m: string): void; readFile(): void; extra: 1 }";
  const names = portNames(source, "p.ts", "P");
  assert.deepEqual(names.filter((item) => MODULE_MEMBERS.includes(item)), ["status", "readFile"]);
  assert.equal(names.length, 9);
});
