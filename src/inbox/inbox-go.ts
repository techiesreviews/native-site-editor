// Going to an Inbox row's spot (TOOLS-222, TOOLS-253; moved out of src/inbox/inbox.ts for TOOLS-331): its element
// selected on its page, a page's details for its title, or a shared part's Edit component mode through the parts it
// sits in. Each step after a wait (the page opening, the mode entered) acts only while the session the row was pressed
// on holds. Pure but for the ports; tested in tests/inbox-go.test.ts.
import { componentLabel } from "../native-insert";
import { elementPathAt } from "../native-source-location";
import type { InboxItem } from "./inbox-item";
import type { InboxPorts } from "./inbox-host";
import { partChain } from "./site-items";

/** The editor as going to a spot uses it. */
export interface GoPorts extends Pick<InboxPorts, "source" | "showing" | "route" | "stamp" | "open" | "pageDetails" | "editComponent" | "select"> {
  readonly appStore: { readonly openFile: { readonly value: string | undefined } };
  site(): { readonly components: Readonly<Record<string, string>> } | undefined;
}
/** The path of the element whose start tag is at `at` (the browser's parser; tests give their own). */
type PathAt = (source: string, at: number) => number[] | undefined;

/** The sentence a shared part's spot shows (Edit component mode's note): a change there shows on every page using it. */
const sharedNote = (shared: NonNullable<InboxItem["shared"]>, within?: string) =>
  `${shared.name}${within ? `, inside ${within},` : ""} is a shared part. A change here shows on ${shared.pages.length === 1 ? "the one page" : `all ${shared.pages.length} pages`} that use${shared.pages.length === 1 ? "s" : ""} it.`;

/** Goes to a shared part's item: a page that shows the part (the one shown, if it does) in Edit component mode, with
 * the part's note, and the element selected in its template. */
async function goToShared(item: InboxItem, shared: NonNullable<InboxItem["shared"]>, ports: GoPorts, pathAt: PathAt) {
  const components = ports.site()?.components ?? {}, read = (file: string) => ports.source(file);
  // The page shown when it shows the part, else the first page that shows it (not only in a hidden template).
  const showing = shared.pages.find(page => ports.appStore.openFile.value === page && ports.showing() === ports.route(page) && partChain(page, components, read, shared.tag));
  const page = showing ?? shared.pages.find(page => partChain(page, components, read, shared.tag)) ?? shared.pages[0];
  const stamp = ports.stamp();
  if (!showing && page) await ports.open(page);
  if (!stamp.holds()) return;
  // The part's instance on the page, through the parts it sits in (a logo inside the header): each opened in turn.
  const chain = page === undefined ? undefined : partChain(page, components, read, shared.tag);
  const steps = (chain ?? []).map(step => {
    const text = ports.source(step.path);
    return { ...step, node: text === undefined ? undefined : pathAt(text, step.at) };
  });
  // No framed instance to open it on: its code opens, with its note.
  if (!steps.length || steps.some(step => !step.node)) { await ports.editComponent(shared.tag, undefined, [sharedNote(shared)]); return; }
  for (const [n, step] of steps.entries()) {
    if (!stamp.holds()) return;
    // The mode keeps the notes it was entered with (a nested part opens behind a breadcrumb, without notes of its own),
    // so the part's note rides on the first step.
    // Worded for the chain when the part sits inside another ("Site mark, inside Site header, is a shared part…").
    const within = steps.length > 1 ? componentLabel(steps[0].tag) : undefined;
    const entered = await ports.editComponent(step.tag, { path: step.path, node: step.node! }, n ? [] : [sharedNote(shared, within)]);
    if (entered !== "mode") return;
  }
  const template = ports.source(item.page);
  const at = template === undefined || item.at === undefined ? undefined : pathAt(template, item.at);
  if (at && stamp.holds()) ports.select({ path: item.page, node: at }, false);
}

/** Goes to an item's spot: its element selected on its page (in its shared part's template), or a page's details for its title. */
export async function goTo(item: InboxItem, ports: GoPorts, pathAt: PathAt = elementPathAt) {
  if (item.shared) { await goToShared(item, item.shared, ports, pathAt); return; }
  // Shown: the page is the open file and on the canvas (a Ctrl+click on a link takes the canvas away alone).
  const shown = ports.appStore.openFile.value === item.page && ports.showing() === ports.route(item.page);
  if (item.kind === "title") {
    // Page settings open only for the page opened, on the site it was asked on.
    const stamp = ports.stamp();
    if (!shown) await ports.open(item.page);
    if (stamp.holds() && ports.appStore.openFile.value === item.page) ports.pageDetails(item.page);
    return;
  }
  const source = ports.source(item.page);
  const at = item.at === undefined || source === undefined ? undefined : pathAt(source, item.at);
  const request = at && { path: item.page, node: at };
  if (request && shown) { ports.select(request, false); return; }
  if (request) ports.select(request, true);
  if (!shown) await ports.open(item.page);
}
