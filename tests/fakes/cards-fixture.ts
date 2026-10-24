// The card operations (src/page-builder/cards.ts) on the memory workspace and
// the real guarded edit module: no proof ports to fake. Shared by
// tests/cards.test.ts in Node and in the page it bundles this into
// (card source locations use the browser's HTML parser).
import { createCards, type CardsDeps } from "../../src/page-builder/cards";
import { createGuardedEdits } from "../../src/guarded-edit";
import type { NativeSite } from "../../shared/native-project";
import { createMemoryWorkspace } from "./memory-workspace";

export function cardsFixture(branch: Record<string, string>, site: NativeSite | undefined) {
  const m = createMemoryWorkspace({ branch, open: "index.html", site });
  const edits = createGuardedEdits(m.workspace);
  const ports = {
    edits,
    editable: path => m.openFile() === path && Boolean(m.model(path)),
    siteRead: async () => undefined,
    preview: () => ({ selectedItemGrid: () => undefined }) as never,
    openPage: () => {},
    pageLabel: () => "Home",
    variantFiles: { site: () => undefined, read: () => undefined },
    announce: text => { m.announced.push(text); },
  } satisfies CardsDeps;
  return { m, edits, ports, cards: createCards(ports) };
}
