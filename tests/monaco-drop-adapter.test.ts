import { test } from "node:test";
import assert from "node:assert/strict";
import { installPlainDropAdapter, type DropBulkService, type DropResourceEdit } from "../src/monaco-drop-adapter.ts";
// @ts-expect-error Monaco's internal JS modules have no declarations.
import { ResourceTextEdit } from "monaco-editor/editor/browser/services/bulkEditService.js";
// @ts-expect-error Monaco's internal JS modules have no declarations.
import { SnippetParser } from "monaco-editor/editor/contrib/snippet/browser/snippetParser.js";

function fixture() {
  const calls: { edits: DropResourceEdit[]; options: unknown }[] = [];
  const answer = { isApplied: true };
  const service: DropBulkService = { apply: async function (edits, options) {
    assert.equal(this, service);
    calls.push({ edits: edits as DropResourceEdit[], options });
    return answer;
  } };
  return { service, calls, answer };
}

test("plain drop text decodes escaped dollars, braces and backslashes without leaking $0", async () => {
  const f = fixture();
  installPlainDropAdapter(f.service);
  for (const text of ["index.html", "price$0${1:x}", "C:\\folder\\file", "{brace} and $VARIABLE"]) {
    const edit = new ResourceTextEdit({ path: "a" }, { range: { line: 1 }, text: SnippetParser.escape(text) + "$0", insertAsSnippet: true });
    await f.service.apply([edit]);
    assert.equal(f.calls.at(-1)!.edits[0].textEdit.text, text);
    assert.equal(f.calls.at(-1)!.edits[0].textEdit.insertAsSnippet, false);
    assert.equal(edit.textEdit.insertAsSnippet, true);
  }
});

test("mixed resources preserve noncanonical snippets, plain edits, metadata, versions, options and result", async () => {
  const f = fixture();
  installPlainDropAdapter(f.service);
  installPlainDropAdapter(f.service);
  const resource = { path: "a" }, range = { startLineNumber: 2 }, metadata = { label: "drop" }, options = { token: {}, editor: {} };
  const plain = new ResourceTextEdit(resource, { range, text: "literal$0" });
  const placeholder = new ResourceTextEdit({ path: "b" }, { range, text: "${1:choice}$0", insertAsSnippet: true });
  const variable = new ResourceTextEdit(resource, { range, text: "$TM_FILENAME$0", insertAsSnippet: true });
  const fileEdit = { newResource: { path: "new" } };
  const drop = new ResourceTextEdit(resource, { range, text: "path$0", insertAsSnippet: true, extra: "kept" }, 42, metadata);
  assert.equal(await f.service.apply([plain, placeholder, variable, fileEdit, drop], options), f.answer);
  const call = f.calls[0];
  assert.equal(f.calls.length, 1);
  assert.deepEqual(call.edits.slice(0, 4), [plain, placeholder, variable, fileEdit]);
  assert.equal(call.options, options);
  assert.equal(call.edits[4].resource, resource);
  assert.equal(call.edits[4].textEdit.range, range);
  assert.equal(call.edits[4].versionId, 42);
  assert.equal(call.edits[4].metadata, metadata);
  assert.equal(call.edits[4].textEdit.extra, "kept");
});

test("workspace envelopes are converted and original service rejection propagates", async () => {
  let received: DropResourceEdit[] = [];
  const refusal = new Error("bad state - model changed in the meantime");
  const service: DropBulkService = { apply: async edits => { received = edits as DropResourceEdit[]; throw refusal; } };
  installPlainDropAdapter(service);
  const edit = new ResourceTextEdit({ path: "a" }, { range: {}, text: "path$0", insertAsSnippet: true }, 7);
  await assert.rejects(service.apply({ edits: [edit] }, { token: {} }), error => error === refusal);
  assert.equal(received[0].versionId, 7);
  assert.equal(received[0].textEdit.text, "path");
});
