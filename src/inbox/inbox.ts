// The Inbox's checks, list, dots and panel (TOOLS-222), loaded once the site is read or the Inbox opens
// (src/inbox/inbox-host.ts). Mock-up 05 v2: an orange dot on the tray while something waits, never a number; a panel
// under it headed "Inbox", one row per item (its icon, what and where), "All done" with a check when nothing waits; a
// small dot on each page and picture with something waiting in Pages and Media. TOOLS-253 (Lex's prototype
// tools-253-inbox-next): each row's actions sit on a strip under it (Fix with AI, a wave-off named for what it means,
// a heading's one-press fix); Fix with AI shows the agent's suggestion in the row to change and accept; Fix all with
// AI over the list asks for every row at once, and Accept all writes them; a shared part's row, Accept button and
// spot say how many pages it changes.
import "./inbox.css";
import { NATIVE_CONFIG_PATH, nativeSitePrefix, type NativeSite } from "../../shared/native-project";
import { icon } from "../icons";
import { elementIcon } from "../components/element-icons";
import { componentIcon } from "../page-builder/component-icon";
import { componentLabel } from "../native-insert";
import { elementPathAt } from "../native-source-location";
import { componentUsage } from "../page-builder/component-model";
import { descendants, parseSource } from "../page-builder/source-tree";
import { button, node } from "../ui/dom";
import type { RangeEdit } from "../guarded-edit";
import type { InboxItem } from "./inbox-item";
import type { InboxPorts } from "./inbox-host";
import { markDecorative } from "./decorative";
import { createInboxAgent } from "./inbox-agent";
import { createInboxFixes, fixEdits, type FixState, type InboxFix } from "./inbox-fixes";
import { forgetPages, pictureVerdict, siteFile, siteItems, type InboxPart } from "./site-items";

// The shared parts the last check read: counted again only when a page or template changed.
let partsRead: { site: NativeSite; texts: (string | undefined)[]; parts: InboxPart[] } | undefined;
/** The site's shared parts that a page shows, each with those pages (counted as Edit component mode counts them). */
function sharedParts(ports: InboxPorts, pages: readonly string[]): InboxPart[] {
  const site = ports.site();
  if (!site) return [];
  const files = [...pages, ...Object.values(site.components)];
  const texts = files.map(file => ports.source(file));
  if (partsRead?.site === site && partsRead.texts.length === texts.length && partsRead.texts.every((text, n) => text === texts[n])) return partsRead.parts;
  const sources: Record<string, string> = {};
  files.forEach((file, n) => { if (texts[n] !== undefined) sources[file] = texts[n]!; });
  const parts = Object.entries(site.components).flatMap(([tag, file]) => {
    const used = componentUsage(site, sources, tag).pages.map(page => page.file);
    return used.length ? [{ file, tag, name: componentLabel(tag), pages: used, source: sources[file] }] : [];
  });
  partsRead = { site, texts, parts };
  return parts;
}

/** The site's items now; `unsure` while a picture's verdict is not known yet (`settle`: judge it by its alt text). */
function findItems(ports: InboxPorts, settle: boolean) {
  let unsure = false;
  const prefix = nativeSitePrefix(ports.source(NATIVE_CONFIG_PATH));
  const pages = ports.pages().map(file => ({ file, label: ports.label(file), route: ports.route(file) ?? file, source: ports.source(file) }));
  let held: Set<string> | undefined;
  const items = siteItems(pages, {
    picture: (page, src, alt) => {
      // Unknown only while a picture stored in the site waits for the Media rules; one from another address is judged by its alt text.
      const stored = !settle && siteFile(src, page, prefix, () => true) !== undefined;
      const verdict = pictureVerdict(alt, alt === undefined ? undefined : ports.picture(page, src, alt), stored);
      if (!verdict) unsure = true;
      return verdict;
    },
    file: (page, src) => siteFile(src, page, prefix, path => (held ??= new Set(ports.files())).has(path)),
  }, sharedParts(ports, pages.map(page => page.file)));
  return { items, unsure };
}

/** The sentence a shared part's spot shows (Edit component mode's note): a change there shows on every page using it. */
export const sharedNote = (shared: NonNullable<InboxItem["shared"]>) =>
  `${shared.name} is a shared part. A change here shows on ${shared.pages.length === 1 ? "the one page" : `all ${shared.pages.length} pages`} that use${shared.pages.length === 1 ? "s" : ""} it.`;

/** Goes to a shared part's item: a page that shows the part (the one shown, if it does) in Edit component mode, with
 * the part's note, and the element selected in its template. */
async function goToShared(item: InboxItem, shared: NonNullable<InboxItem["shared"]>, ports: InboxPorts) {
  const showing = shared.pages.find(page => ports.appStore.openFile.value === page && ports.showing() === ports.route(page));
  const page = showing ?? shared.pages[0];
  const stamp = ports.stamp();
  if (!showing && page) await ports.open(page);
  if (!stamp.holds()) return;
  const source = page === undefined ? undefined : ports.source(page);
  const host = source === undefined ? undefined : [...descendants(parseSource(source))].find(element => element.name.toLowerCase() === shared.tag);
  const node = host && source !== undefined ? elementPathAt(source, host.tag.start) : undefined;
  await ports.editComponent(shared.tag, node && page ? { path: page, node } : undefined, [sharedNote(shared)]);
  const template = ports.source(item.page);
  const at = template === undefined || item.at === undefined ? undefined : elementPathAt(template, item.at);
  if (at && stamp.holds()) ports.select({ path: item.page, node: at }, false);
}

/** Goes to an item's spot: its element selected on its page (in its shared part's template), or a page's details for its title. */
async function goTo(item: InboxItem, ports: InboxPorts) {
  if (item.shared) { await goToShared(item, item.shared, ports); return; }
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
  const at = item.at === undefined || source === undefined ? undefined : elementPathAt(source, item.at);
  const request = at && { path: item.page, node: at };
  if (request && shown) { ports.select(request, false); return; }
  if (request) ports.select(request, true);
  if (!shown) await ports.open(item.page);
}

/** A picture's Decorative, on the session its row was found in (src/inbox/decorative.ts). */
function decorative(item: InboxItem, ports: InboxPorts, found: { holds(): boolean }) {
  return markDecorative(item, found, async () => {
    const { createMediaWorkspace } = await import("../page-builder/media-workspace");
    return createMediaWorkspace(() => ports.media());
  });
}

// The Inbox's own icons for pictures, titles and links; a heading's and a video's are Page Structure's (element-icons.ts).
const kinds: Record<InboxItem["kind"], () => SVGElement> = {
  picture: () => icon("image-square", 16), title: () => icon("file", 16), link: () => icon("link", 16),
  heading: () => elementIcon("h2", 16), video: () => elementIcon("video", 16),
};
/** What a fix writes, as its Undo step names it. */
const doneWords = ({ item, words }: InboxFix) => item.kind === "video" ? "Marked No speech" : item.kind === "heading" ? `Heading made level ${words}`
  : item.fix === "alt" ? "Description added" : item.fix === "name" ? "Link named" : "Link words changed";
const fieldWords = { alt: "description", name: "link name", words: "link words" } as const;
/** A strip's button: the Button part, compact (inbox.css), in its quiet tone or, for Accept, its primary one. */
const act = (words: string, action: () => void, extra = "", tone: "primary" | "secondary" = "secondary") =>
  button(words, action, `button ${tone} inbox__act ${extra}`.trim());
/** Busy, or done: the keyboard stays on it (aria-disabled, not disabled). */
const hold = (control: HTMLButtonElement, busy = true) => {
  control.setAttribute("aria-disabled", "true");
  if (busy) control.setAttribute("aria-busy", "true");
  return control;
};
const held = (control: Element) => control.getAttribute("aria-disabled") === "true";

export function createInboxList(ports: InboxPorts) {
  let items: readonly InboxItem[] = [];
  let retry: ReturnType<typeof setTimeout> | undefined, retries = 0, checked = false;
  // The session of the last full check: its site and branch, until the next load.
  let session: { holds(): boolean } | undefined;
  // Opened while the pages were still being checked: the first row takes the keyboard once it is there.
  let focusFirst = false;
  // The dots in Pages and Media: the rows and tiles named here wear theirs (inbox.css), however often they are drawn.
  const dots = new CSSStyleSheet();
  document.adoptedStyleSheets = [...document.adoptedStyleSheets, dots];
  const panel = () => document.getElementById("inbox");
  const redraw = () => { const open = panel(); if (open?.matches(":popover-open")) draw(open); };

  /** Writes fixes as one Undo step, each only over the text its row was found in (src/guarded-edit.ts). */
  async function write(list: readonly InboxFix[]) {
    if (!session?.holds()) throw new Error("The site changed since it was checked. Nothing was changed.");
    const done = list.length === 1 ? doneWords(list[0]) : `${list.length} Inbox fixes accepted`;
    const outcome = await ports.edits.run(r => {
      const files = new Map<string, RangeEdit[]>();
      for (const { item, words } of list) {
        const source = r.source(item.page);
        if (source === undefined || source !== item.found) return { refuse: "The page changed since it was checked. Nothing was changed." };
        const planned = fixEdits(item, words, source);
        if ("refuse" in planned) return planned;
        files.set(item.page, [...files.get(item.page) ?? [], ...planned].sort((a, b) => a.start - b.start));
      }
      return { edits: files, done, undone: `Undid: ${done}` };
    }, { finish: true });
    if (!outcome.ok) throw new Error(outcome.message);
  }
  const agent = createInboxAgent({
    link: () => ports.agent(),
    async element(item) {
      const site = ports.site(), source = ports.source(item.page);
      const at = source === undefined || item.at === undefined ? undefined : elementPathAt(source, item.at);
      if (!site || !at) return undefined;
      const { agentElement } = await import("../agent-site");
      const route = ports.route(item.shared?.pages[0] ?? item.page);
      return agentElement({ path: item.page, node: at, tag: item.kind === "picture" ? "img" : "a", text: item.words ?? "", ...route ? { route } : {} }, site, source);
    },
  });
  const fixes = createInboxFixes({ agent: () => agent, write, changed: redraw, error: error => ports.error(error) });

  // What was last shown: the list, the dots' rules and the panel are written again only when they change, since each
  // write makes the browser restyle the page (an edit's next layout would pay for it).
  let shownKeys: string | undefined, shownChecked = false, shownSession: typeof session, dotRules = "";
  function show(next: readonly InboxItem[]) {
    // A row's spot (`at`) and the page text it was found in are part of it: drawn rows act on the items they hold.
    const keys = next.map(item => `${item.key}\n${item.where}\n${item.wave ?? ""}\n${item.at ?? ""}`).join("\n\n");
    // Rows drawn on another session (a reload with the same items) act on it no more: they are drawn again.
    const same = keys === shownKeys && checked === shownChecked && session === shownSession && next.every((item, n) => item.found === items[n]?.found);
    items = next;
    fixes.keep(next);
    if (same) return;
    shownSession = session;
    shownKeys = keys;
    shownChecked = checked;
    const root = document.documentElement;
    if (root.hasAttribute("data-inbox-waiting") !== items.length > 0) root.toggleAttribute("data-inbox-waiting", items.length > 0);
    const any = (attribute: string, values: (string | undefined)[]) =>
      [...new Set(values.filter((value): value is string => Boolean(value)))].map(value => `[${attribute}="${CSS.escape(value)}"]`).join(",");
    const pages = any("data-file", items.map(item => item.page)), media = any("data-path", items.map(item => item.media));
    const rules = `${pages ? `.pages-item:is(${pages}) > .pages-row { --inbox-dot: block; }` : ""}${media ? `.media-library__card:is(${media}) { --inbox-dot-size: 100% 100%; }` : ""}`;
    if (rules !== dotRules) dots.replaceSync(dotRules = rules);
    const open = panel();
    if (open?.matches(":popover-open")) draw(open);
  }

  /** Checks the site again (the host waits for a pause in the changes). */
  function check(again = false) {
    clearTimeout(retry);
    if (!again) retries = 0;
    // No pages: none yet while a site loads; a repository opened without a site has nothing waiting.
    if (!ports.pages().length) {
      forgetPages();
      session = undefined;
      checked = Boolean(ports.appStore.snapshot.value);
      show([]);
      return;
    }
    // Until a site's pages are all read the list would be partial (or another site's, after a switch): nothing is listed
    // and the text index asks again once it has them. A re-read of the same site (after a save, even one that fails)
    // goes on checking the pages it already holds.
    if (!ports.indexed() && !session?.holds()) {
      forgetPages();
      session = undefined;
      checked = false;
      show([]);
      return;
    }
    // One stamp per load, so the rows drawn on it stay its own until another site, branch or reload opens.
    if (ports.indexed() && !session?.holds()) session = ports.stamp();
    // A picture's verdict waits for the Media rules, which load on the first ask: look again shortly. Past ten looks
    // (the rules or the records could not be read) a stored picture is judged by its alt text alone.
    const found = findItems(ports, retries >= 10);
    // "All done" only once every picture's verdict is known.
    checked = !found.unsure;
    show(found.items);
    if (found.unsure) {
      retries++;
      retry = setTimeout(() => check(true), 1000);
    }
  }

  // A row acts only on the session it was found in: drawn before a switch to another site or branch, it checks again
  // instead (the new site's list replaces it).
  async function go(item: InboxItem, found: { holds(): boolean } | undefined) {
    if (!found?.holds()) { check(); return; }
    panel()?.hidePopover();
    try { await goTo(item, ports); } catch (error) { ports.error(error); }
  }

  // Busy until the change, which checks the site again, takes the row away; a refusal leaves it ready for another go.
  // Marked busy with aria-disabled rather than disabled, so the keyboard stays on it (a disabled button drops focus).
  async function wave(item: InboxItem, button: HTMLButtonElement, found: { holds(): boolean } | undefined) {
    if (button.getAttribute("aria-disabled") === "true") return;
    if (!found?.holds()) { check(); return; }
    button.setAttribute("aria-disabled", "true");
    button.setAttribute("aria-busy", "true");
    try { await (item.kind === "video" ? write([{ item, words: "" }]) : decorative(item, ports, found)); } catch (error) {
      button.removeAttribute("aria-disabled");
      button.removeAttribute("aria-busy");
      ports.error(error);
    }
  }

  /** A heading's one press (the edit bar's Use H3), from its row. */
  async function level(item: InboxItem, control: HTMLButtonElement, found: { holds(): boolean } | undefined) {
    if (held(control) || !item.level) return;
    if (!found?.holds()) { check(); return; }
    hold(control);
    try { await write([{ item, words: String(item.level.to) }]); } catch (error) {
      control.removeAttribute("aria-disabled");
      control.removeAttribute("aria-busy");
      ports.error(error);
    }
  }

  /** Fix with AI on a row: its state on the button itself. */
  function aiButton(item: InboxItem, state: FixState | undefined, found: { holds(): boolean } | undefined) {
    const label = `${item.what}, ${item.where}`;
    if (!fixes.connected()) {
      const off = hold(act("No agent connected", () => undefined, "inbox__ai"), false);
      off.prepend(icon("sparkle", 16));
      off.title = "Connect an agent from the project menu to use Fix with AI. Choose the row to fix it by hand.";
      off.setAttribute("aria-label", `Fix with AI: no agent connected. ${label}`);
      return off;
    }
    const thinking = state?.status === "thinking";
    const made: HTMLButtonElement = act(thinking ? "Thinking…" : state?.status === "failed" ? "No suggestion · Try again" : "Fix with AI", () => {
      if (held(made)) return;
      if (!found?.holds()) { check(); return; }
      void fixes.suggest(item);
    }, "inbox__ai");
    if (thinking) hold(made); else made.prepend(icon("sparkle", 16));
    made.setAttribute("aria-label", `${made.textContent}: ${label}`);
    return made;
  }

  /** A row's strip of actions: Fix with AI, a heading's one press, the wave-off. */
  function actions(item: InboxItem, state: FixState | undefined, found: { holds(): boolean } | undefined) {
    const row = node("div", "inbox__actions");
    if (item.fix) row.append(aiButton(item, state, found));
    if (item.level) {
      const press: HTMLButtonElement = act(`Use H${item.level.to}`, () => void level(item, press, found));
      press.setAttribute("aria-label", `Use H${item.level.to}: ${item.what}, ${item.where}`);
      row.append(press);
    }
    if (item.wave) {
      const off: HTMLButtonElement = act(item.wave, () => void wave(item, off, found), "inbox__wave");
      off.setAttribute("aria-label", `${item.wave}: ${item.what}, ${item.where}`);
      row.append(off);
    }
    for (const control of row.querySelectorAll<HTMLElement>("button")) control.dataset.act = control.classList.contains("inbox__ai") ? "ai" : control.classList.contains("inbox__wave") ? "wave" : "level";
    return row;
  }

  /** The agent's suggestion in its row: its words to change, then Accept (on how many pages) or Not now. */
  function suggestion(item: InboxItem, state: FixState, found: { holds(): boolean } | undefined) {
    const box = node("div", "inbox__suggest"), field = fieldWords[item.fix!];
    const input = node("input", "inline-field inbox__field");
    input.value = state.draft ?? "";
    input.dataset.act = "draft";
    input.autocomplete = "off";
    input.setAttribute("aria-label", `${field[0].toUpperCase()}${field.slice(1)}, suggested by AI. Change it if you like.`);
    input.readOnly = state.status !== "suggested";
    if (state.invalid) input.setAttribute("aria-invalid", "true");
    const accept = () => {
      if (state.status !== "suggested") return;
      if (!found?.holds()) { check(); return; }
      void fixes.accept(item);
    };
    input.addEventListener("input", () => { fixes.edit(item.key, input.value); input.removeAttribute("aria-invalid"); });
    input.addEventListener("keydown", event => { if (event.key === "Enter") { event.preventDefault(); accept(); } });
    const buttons = node("div", "inbox__buttons");
    if (state.status === "accepted") {
      const done = hold(act("Accepted", () => undefined, "inbox__done"), false);
      done.prepend(icon("check", 16));
      buttons.append(done);
    } else {
      const yes = act(state.status === "accepting" ? "Accepting…" : fixes.acceptLabel(item), accept, "", "primary");
      if (state.status === "accepting") hold(yes);
      buttons.append(yes);
      if (state.status === "suggested") buttons.append(act("Not now", () => fixes.dismiss(item.key)));
    }
    buttons.querySelectorAll<HTMLElement>("button").forEach((control, n) => { control.dataset.act = n ? "dismiss" : "accept"; });
    box.append(node("small", "", `AI suggests this ${field}. Change it if you like.`), input, buttons);
    return box;
  }

  /** Over the list: Fix all with AI, then Accept all (on how many pages in total), each with its state on itself. */
  function allStrip(found: { holds(): boolean } | undefined) {
    if (!items.some(item => item.fix)) return undefined;
    const all = fixes.all(items), top = node("div", "inbox__all");
    top.dataset.key = "all";
    let made: HTMLButtonElement;
    if (all.status === "suggested") made = act(fixes.acceptAllLabel(items), () => {
      if (held(made)) return;
      if (!found?.holds()) { check(); return; }
      void fixes.acceptAll(items).then(ok => { if (!ok) panel()?.querySelector<HTMLElement>(".inbox__field[aria-invalid='true']")?.focus(); });
    }, "", "primary");
    else if (all.status === "thinking" || all.status === "accepting") made = hold(act(all.status === "thinking" ? "Thinking…" : "Accepting…", () => undefined));
    else if (all.status === "accepted") { made = hold(act("Accepted", () => undefined, "inbox__done"), false); made.prepend(icon("check", 16)); }
    else if (!fixes.connected()) {
      made = hold(act("Fix all with AI: no agent connected", () => undefined), false);
      made.prepend(icon("sparkle", 16));
      made.title = "Connect an agent from the project menu to use Fix with AI. Each row can still be fixed by hand.";
    } else {
      made = act("Fix all with AI", () => {
        if (held(made)) return;
        if (!found?.holds()) { check(); return; }
        void fixes.suggestAll(items);
      });
      made.prepend(icon("sparkle", 16));
      if (!all.count) hold(made, false);
    }
    made.dataset.act = "all";
    top.append(made);
    return top;
  }

  /** A row's second line: where it is; for a shared part, its name and how many pages a fix changes. */
  function whereLine(item: InboxItem) {
    const line = node("small", "");
    if (!item.shared) { line.textContent = item.where; return { line, words: item.where }; }
    const words = `${item.shared.name} · changes ${item.shared.pages.length} page${item.shared.pages.length === 1 ? "" : "s"}`;
    const note = node("span", "inbox__shared");
    note.append(componentIcon(12), words);
    line.append(note);
    return { line, words };
  }

  /** Draws the list into the panel, keeping focus (and a field's caret) on the same row's control, or the first. */
  function draw(into: HTMLElement) {
    const active = document.activeElement instanceof HTMLElement && into.contains(document.activeElement) ? document.activeElement : undefined;
    const focusKey = active?.closest<HTMLElement>("[data-key]")?.dataset.key, focusAct = active?.dataset.act;
    const caret = active instanceof HTMLInputElement ? [active.selectionStart, active.selectionEnd] as const : undefined;
    const title = node("h2", "inbox__title", "Inbox");
    // With no row left to take it (the last one fixed, or the list being read again), the keyboard stays in the panel
    // on its heading, so Escape still hands it back to the tray.
    title.tabIndex = -1;
    const keep = () => { if (active) title.focus(); };
    // Nothing found yet before the pages are read (or a picture's verdict is known): busy, rather than an "All done"
    // not yet known.
    if (!checked && !items.length) {
      const busy = node("p", "inbox__empty", "Checking pages…");
      busy.setAttribute("aria-busy", "true");
      into.replaceChildren(title, busy);
      keep();
      return;
    }
    if (!items.length) {
      const done = node("p", "inbox__empty");
      done.append(icon("check", 16), "All done");
      into.replaceChildren(title, done);
      keep();
      return;
    }
    const list = node("ul", "inbox__list"), found = session;
    for (const item of items) {
      const row = node("li", "inbox__row"), state = fixes.state(item.key);
      row.dataset.key = item.key;
      row.dataset.kind = item.kind;
      row.dataset.status = state?.status ?? "open";
      // The Button part (src/ui/dom.ts) in the panel's own row look.
      const spot = button("", () => go(item, found), "button secondary inbox__item");
      const where = whereLine(item);
      spot.dataset.act = "go";
      spot.append(kinds[item.kind](), node("b", "", item.what), where.line);
      spot.setAttribute("aria-label", `${item.what}, ${where.words}`);
      row.append(spot);
      if (item.fix && state && ["suggested", "accepting", "accepted"].includes(state.status)) row.append(suggestion(item, state, found));
      else {
        const bar = actions(item, state, found);
        if (bar.childElementCount) row.append(bar);
      }
      list.append(row);
    }
    const top = allStrip(found);
    into.replaceChildren(title, ...top ? [top] : [], list);
    const at = focusKey && into.querySelector(`[data-key="${CSS.escape(focusKey)}"]`);
    const back = at && (at.querySelector<HTMLElement>(`[data-act="${focusAct}"]`) ?? at.querySelector<HTMLElement>(".inbox__field, .inbox__actions button, .inbox__buttons button") ?? at.querySelector<HTMLElement>(".inbox__item, [data-act]"));
    if (back) {
      back.focus();
      if (caret && back instanceof HTMLInputElement) back.setSelectionRange(caret[0], caret[1]);
    } else if (active || focusFirst) list.querySelector<HTMLElement>(".inbox__item")?.focus();
    focusFirst = false;
  }

  return {
    check,
    /** The panel opening: drawn before it shows, its first row focused once it does. */
    opened(into: HTMLElement, drawing: boolean) {
      // Not known yet, or found on a session a switch has since ended: checked again before it shows.
      if (drawing && (!checked || !session?.holds())) check();
      if (drawing) draw(into);
      else if (into.matches(":popover-open")) {
        const first = into.querySelector<HTMLElement>(".inbox__item");
        if (first) first.focus(); else focusFirst = !checked;
      }
    },
  };
}
