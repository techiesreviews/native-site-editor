// The cards controller (src/controllers/cards-controller.ts) on the memory
// workspace and the real guarded edit module: no proof ports to fake. Shared by
// tests/cards-controller.test.ts in Node and in the page it bundles this into
// (card source locations use the browser's HTML parser).
import { createCardsController, type CardsControllerPorts } from "../../src/controllers/cards-controller";
import { createGuardedEdits } from "../../src/guarded-edit";
import type { NativeSite } from "../../shared/native-project";
import { createMemoryWorkspace } from "./memory-workspace";

export function cardsFixture(branch: Record<string, string>, site: NativeSite | undefined, mount = true) {
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
  } satisfies CardsControllerPorts;
  const controller = createCardsController(ports);
  if (mount) controller.mount();
  return { m, edits, ports, controller };
}
