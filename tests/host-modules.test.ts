import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { parse, ts } from "./support/source-guard.ts";

// The hosts that take the shared host modules (src/host-modules.ts) whole, in place of their loose callbacks.
const HOSTS = [
  { file: "src/pages-and-files-host.ts", ports: "PagesAndFilesPorts", ceiling: 30 },
  { file: "src/workspace-boot.ts", ports: "WorkspaceBootPorts", ceiling: 30 },
];
const SHARED = ["notices", "session", "repo", "view", "panels", "preview", "textIndex"];
// Members of a shared module or a host handed over whole: a host takes them through it, never as a loose port of their own.
const MODULE_MEMBERS = ["status", "settleStatus", "clearError", "errorMessage", "announce", "workspaceSession", "nextLoad", "currentLoad", "stampOf", "draftScope",
  "api", "apiResponse", "readFile", "readFiles", "entryAt", "findEntry", "fileGeneration", "setCurrentPage", "showDirectory", "openNewDraft", "openEntry", "mountSource",
  "restoreFile", "loadSnapshot", "updateAgentContext", "updateCurrentPageLabel", "updatePreview", "updateNativePreview", "updateNativePreviewSources",
  "nativeRouteForPath", "nativeRouteInfo", "nativeTitles", "nativeFallbackPage", "nativeModeActive", "nativeComponentTagForPath",
  "afterNativePaint", "ensureNativeTextIndex", "startNativeTextIndex", "flushPendingNativePageTitles", "clearPendingTitles",
  "mediaController", "readMediaText", "mediaOrigins", "uploadFilesTo", "discardUpload",
  "cards", "nativeNavigationTarget", "writeNativePageMeta", "refreshNativeRoutes", "openNativePageSettings", "openNativeNavigation",
  "takeStartingPoint", "writeStartingPoint", "readPartialStart", "offerFinishStarter", "removeFinishStarter",
  "nativeSite", "nativeSourcesRequest", "nativePaintedRequest", "nativePaintedPaths", "baseText",
  "content", "files", "refreshButton", "branchSelect", "repositorySelect", "repositoryMenu", "explorerDropdown", "siteActions"];

function portNames(source: string, file: string, name: string): string[] {
  const tree = parse(source, file);
  const declared = tree.statements.find((at): at is ts.InterfaceDeclaration => ts.isInterfaceDeclaration(at) && at.name.text === name);
  assert.ok(declared, `${file} declares ${name}`);
  return declared.members.map((item) => item.name?.getText(tree) ?? "");
}

// What is wrong with a host's ports: a shared module it does not take, a module member taken loose, or more ports than its ceiling.
function problems(names: string[], ceiling: number): string[] {
  return [
    ...SHARED.filter((shared) => !names.includes(shared)).map((shared) => `no ${shared}`),
    ...names.filter((item) => MODULE_MEMBERS.includes(item)).map((item) => `loose ${item}`),
    ...(names.length > ceiling ? [`${names.length} ports, above ${ceiling}`] : []),
  ];
}

for (const host of HOSTS) {
  test(`${host.ports} takes the shared host modules whole and stays within ${host.ceiling} ports`, () => {
    assert.deepEqual(problems(portNames(readFileSync(new URL(`../${host.file}`, import.meta.url), "utf8"), host.file, host.ports), host.ceiling), []);
  });
}

test("a missing shared module, a loose port that belongs to a module, and a ports list over its ceiling, are named", () => {
  const source = "export interface P { notices: N; session: S; repo: R; view: V; panels: X; preview: Y; status(m: string): void; afterNativePaint(): void; uploadFilesTo(): void }";
  assert.deepEqual(problems(portNames(source, "p.ts", "P"), 8), ["no textIndex", "loose status", "loose afterNativePaint", "loose uploadFilesTo", "9 ports, above 8"]);
});
