// Monaco 0.56's standalone bulk editor ignores insertAsSnippet. Decode only
// the canonical escaped plain-text + final tabstop emitted by its drop helper.
// Real snippets retain their original handling; this is an upstream baseline fix.
// @ts-expect-error Monaco's internal JS modules have no declarations.
import { SnippetParser } from "monaco-editor/editor/contrib/snippet/browser/snippetParser.js";
// @ts-expect-error Monaco's internal JS modules have no declarations.
import { ResourceEdit, ResourceTextEdit } from "monaco-editor/editor/browser/services/bulkEditService.js";

export interface DropTextEdit {
  range: unknown;
  text: string;
  insertAsSnippet?: boolean;
  [key: string]: unknown;
}
export interface DropResourceEdit {
  resource: unknown;
  textEdit: DropTextEdit;
  versionId?: number;
  metadata?: unknown;
}
export interface DropBulkService {
  apply(edits: unknown, options?: unknown): Promise<unknown>;
}
const installed = new WeakSet<DropBulkService>();

export function installPlainDropAdapter(service: DropBulkService): void {
  if (installed.has(service)) return;
  installed.add(service);
  const original = service.apply.bind(service);
  service.apply = (input, options) => {
    const edits: unknown[] = Array.isArray(input) ? input : ResourceEdit.convert(input);
    const adapted = edits.map(edit => {
      if (!(edit instanceof ResourceTextEdit)) return edit;
      const item = edit as DropResourceEdit;
      if (!item.textEdit.insertAsSnippet) return edit;
      const text: string = new SnippetParser().parse(item.textEdit.text).toString();
      if (SnippetParser.escape(text) + "$0" !== item.textEdit.text) return edit;
      return new ResourceTextEdit(item.resource, { ...item.textEdit, text, insertAsSnippet: false }, item.versionId, item.metadata);
    });
    return original(adapted, options);
  };
}
