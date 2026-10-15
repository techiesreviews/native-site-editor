import { button, node } from "../ui/dom";
import { input } from "./media-library-fields";
import { icon } from "../icons";
import { OUTSIDE_PICTURE_LABELS } from "./outside-pictures";
import type { ImproveImagesPlan, ImproveImagesRow, ImprovePicture } from "./improve-images";
import { runMaps, type ImproveImagesSession, type LeftPicture, type RowOutcome } from "./improve-images-run";
import { improvePictureLine, improvePictureName, improveProgress, improveRowLine, improveRowStatus, improveRunMessage, type ImproveRowState } from "./improve-images-words";
import { takeSheet, type LibrarySheet, type LibrarySheetContext } from "./media-library-sheet";
import type { MediaImproveEntry } from "./media-picker";
import "./media-clean-up-review.css";
import "./media-improve.css";

/** Kept by the Media view, so the Undo list and what a run found outlive leaving the screen. */
export interface ImproveMemory {
  outcomes: RowOutcome[];
  states: Map<string, { state: ImproveRowState; message?: string; notes?: string[] }>;
  /** Pictures a run could not bring in, by row file then picture key. */
  left: Map<string, Map<string, LeftPicture>>;
  own: Map<string, File>;
  /** Files an Undo kept because another changed row still used them. */
  kept: string[];
  maps: ReturnType<typeof runMaps>;
  known: Record<string, { width?: number; height?: number }>;
}
export const improveMemory = (): ImproveMemory => ({ outcomes: [], states: new Map(), left: new Map(), own: new Map(), kept: [], maps: runMaps(), known: {} });

export interface ImproveHost extends LibrarySheetContext {
  improve: MediaImproveEntry;
  memory: ImproveMemory;
  /** Back to the grid, focus to More. */
  close: () => void;
}

/** Improve images (ticket 11, Wix's step-by-step fixer): pages and components as rows with what
 * would change; a row opens to its pictures, each can be unticked (remembered); Fix one row or Fix
 * all, with progress and Cancel; then the changed rows, each with Undo, and Undo all. */
export function showImproveImages(sheet: LibrarySheet, h: ImproveHost) {
  const m = h.memory;
  let plan: ImproveImagesPlan | undefined, session: ImproveImagesSession | undefined;
  let reading = "Checking the pictures on your pages…";
  let running: { abort: AbortController; line: string } | undefined;
  const open = new Set<string>();
  /** Still this screen: Back or another screen ends its redraws (a run or Undo still finishes). */
  const shown = () => h.alive() && sheet.element.dataset.mode === "improve";

  async function load() {
    session ??= await h.adapter.improveImages!();
    const first = await session.plan(m.known);
    // Widths come from the pictures themselves; the listing only knows file sizes.
    const missing = first.missingFacts.filter(path => !m.known[path]);
    if (missing.length) {
      let done = 0;
      const read = async (path: string) => {
        try { const bytes = await h.cache.get(path); m.known[path] = { width: bytes.width, height: bytes.height }; } catch { m.known[path] = {}; }
        reading = `Reading pictures: ${++done} of ${missing.length}`; if (shown() && !plan) draw(false);
      };
      for (let index = 0; index < missing.length; index += 4) await Promise.all(missing.slice(index, index + 4).map(read));
      plan = await session.plan(m.known);
    } else plan = first;
    h.improve.known(m.known);
  }
  const reload = () => h.task(async () => { await load(); if (shown()) draw(false); }, false);

  function draw(focus: boolean | string = true) {
    const { element } = sheet;
    const keep = element.dataset.mode === "improve" ? element.scrollTop : 0;
    // The run is the sheet's work, so closing Media cancels it; this screen's own redraws do not.
    if (running && sheet.work === running.abort) sheet.work = undefined;
    takeSheet(sheet);
    if (running) sheet.work = running.abort;
    element.dataset.mode = "improve";
    const version = sheet.version;
    sheet.redraw = () => {
      if (version !== sheet.version) return;
      const active = document.activeElement;
      draw(active instanceof HTMLElement && element.contains(active) ? active.dataset.focusKey ?? false : false);
    };
    const head = node("header", "media-detail__head");
    const back = button("", () => h.close(), "media-detail__back");
    back.setAttribute("aria-label", "Back"); back.dataset.focusKey = "back"; back.append(icon("arrow-left", 20));
    const title = node("h3", "", "Improve images"); title.tabIndex = -1;
    head.append(back, title);
    element.append(head);
    drawUndo();
    if (running) {
      const progress = node("div", "media-cleanup__notice media-improve__progress");
      const line = node("span", "", running.line); line.setAttribute("aria-live", "polite");
      const cancel = button("Cancel", () => running?.abort.abort(), "button secondary");
      cancel.dataset.mediaCancel = "run"; cancel.dataset.focusKey = "cancel";
      progress.append(line, cancel);
      element.append(progress);
    }
    if (!plan) element.append(node("p", "media-check__empty", reading));
    else if (!plan.rows.length) element.append(node("p", "media-check__empty", "Every picture is in good shape."));
    else drawRows(plan.rows);
    h.sync();
    element.scrollTop = keep;
    if (focus === false) return;
    const target = typeof focus === "string" && element.querySelector<HTMLElement>(`[data-focus-key="${CSS.escape(focus)}"]`);
    (target || title).focus();

    function drawUndo() {
      const files = [...new Set(m.outcomes.map(outcome => outcome.file))];
      if (!files.length) return;
      const box = node("section", "media-cleanup__notice media-improve__changed");
      const list = node("ul", "media-improve__undo");
      for (const file of files) {
        const label = m.outcomes.find(outcome => outcome.file === file)!.label;
        const item = node("li");
        const undo = button("Undo", () => void undoRows(m.outcomes.filter(outcome => outcome.file === file)), "button secondary");
        undo.dataset.focusKey = `undo:${file}`; undo.setAttribute("aria-label", `Undo ${label}`);
        item.append(node("span", "", label), undo);
        list.append(item);
      }
      const all = files.length > 1 ? [button("Undo all", () => void undoRows(m.outcomes), "button secondary")] : [];
      all.forEach(control => { control.dataset.focusKey = "undo-all"; });
      box.append(node("strong", "", "Changed"), list, node("p", "media-library__muted", "Nothing goes live until you publish."), ...all);
      element.append(box);
    }

    function drawRows(rows: ImproveImagesRow[]) {
      element.append(node("p", "media-library__muted", "Lighter files, copies for every screen and size details. Open a row to leave a picture as it is."));
      const list = node("ul", "media-improve__rows");
      for (const row of rows) list.append(drawRow(row));
      const fix = rows.filter(row => row.count);
      const footer = node("div", "media-cleanup__footer");
      const sum = node("span", "media-cleanup__sum", fix.length === 1 ? "1 to improve" : `${fix.length} to improve`);
      const all = button(fix.length > 1 ? "Fix all" : "Fix", () => void run(fix.map(row => row.file)), "button primary");
      all.dataset.focusKey = "fix-all"; all.disabled = !fix.length;
      footer.append(sum, all);
      element.append(list, footer);
    }

    function drawRow(row: ImproveImagesRow) {
      const item = node("li", "media-improve__row"); item.dataset.file = row.file;
      const top = node("div", "media-improve__top");
      const toggle = button("", () => { if (open.has(row.file)) open.delete(row.file); else open.add(row.file); draw(`open:${row.file}`); }, "media-improve__open");
      toggle.dataset.focusKey = `open:${row.file}`;
      toggle.setAttribute("aria-expanded", String(open.has(row.file)));
      const text = node("span", "media-improve__text");
      text.append(node("strong", "", row.label), node("span", "media-library__muted", improveRowLine(row)));
      const status = m.states.get(row.file);
      if (status) text.append(node("span", `media-improve__status is-${status.state}`, improveRowStatus(status.state, status.message)),
        ...status.notes?.map(note => node("span", "media-library__muted", note)) ?? []);
      toggle.append(icon(open.has(row.file) ? "caret-down" : "caret-right", 16), text);
      const fix = button("Fix", () => void run([row.file]), "button secondary");
      fix.dataset.focusKey = `fix:${row.file}`; fix.setAttribute("aria-label", `Fix ${row.label}`); fix.disabled = !row.count;
      top.append(toggle, fix);
      item.append(top);
      if (open.has(row.file)) item.append(drawPictures(row));
      return item;
    }

    function drawPictures(row: ImproveImagesRow) {
      const box = node("div", "media-improve__pictures");
      const list = node("ul", "media-improve__list");
      const seen = new Set<string>();
      for (const picture of row.pictures) {
        if (!picture.changes.length || seen.has(picture.key)) continue;
        seen.add(picture.key);
        const line = node("li", "media-improve__picture"); line.dataset.key = picture.key;
        const words = node("div", "media-improve__words");
        const name = node("strong", "", improvePictureName(picture)); name.title = picture.address;
        words.append(name, node("span", "media-library__muted", improvePictureLine(picture)));
        const left = m.left.get(row.file)?.get(picture.key);
        if (left && picture.ticked) words.append(drawLeft(row, picture, left));
        const tick = input(`Improve ${improvePictureName(picture)}`, "checkbox"); tick.checked = picture.ticked;
        tick.dataset.focusKey = `tick:${row.file}:${picture.key}`;
        tick.addEventListener("change", () => void h.task(async () => {
          await session!.leftAsIs({ picture: picture.key, row: row.file }, !tick.checked);
          await load(); if (shown()) draw(tick.dataset.focusKey!);
        }));
        const check = node("label", "media-improve__tick"); check.append(tick);
        line.append(preview(picture), words, check);
        list.append(line);
      }
      box.append(list);
      if (row.leftAlone.length) box.append(node("p", "media-library__muted", row.leftAlone.length === 1 ? "1 more picture stays as it is: a script, sample code or structured data uses it." : `${row.leftAlone.length} more pictures stay as they are: scripts, sample code or structured data use them.`));
      return box;
    }

    /** "website gone" or "not allowed", and Lex's own copy in its place. */
    function drawLeft(row: ImproveImagesRow, picture: ImprovePicture, left: LeftPicture) {
      const line = node("span", "media-improve__left");
      const reason = left.reason === "gone" || left.reason === "not-allowed" ? OUTSIDE_PICTURE_LABELS[left.reason] : left.note ?? "not changed";
      line.append(node("span", "media-improve__reason", reason));
      if (picture.kind !== "outside" && picture.kind !== "sharing") return line;
      const choose = input(`Use your own copy of ${improvePictureName(picture)}`, "file");
      choose.accept = "image/*"; choose.hidden = true;
      choose.addEventListener("change", () => {
        const file = choose.files?.[0];
        if (!file) return;
        m.own.set(picture.key, file);
        void run([row.file]);
      });
      const pick = button("Use my own copy", () => choose.click(), "button secondary");
      pick.dataset.focusKey = `own:${row.file}:${picture.key}`;
      line.append(pick, choose);
      return line;
    }
  }

  async function run(files: string[]) {
    if (running || !session) return;
    const abort = new AbortController(), measure = (path: string, node: number[], size: { width?: number; height?: number }) => h.improve.measure(path, node, size);
    running = { abort, line: "" }; sheet.work = abort;
    let changed = 0, failed = 0;
    await h.task(async () => {
      try {
        for (const [index, file] of files.entries()) {
          if (abort.signal.aborted || !h.alive()) break;
          const row = plan?.rows.find(item => item.file === file);
          running!.line = improveProgress(index, files.length, row?.label ?? file); if (shown()) draw("cancel");
          // A page is shown so its pictures are measured there; a component's template uses the safe sizes.
          if (row?.kind === "page") await h.improve.show(file);
          if (abort.signal.aborted) break;
          try {
            const outcome = await session!.row({ row: file, known: m.known, maps: m.maps, signal: abort.signal, own: m.own, measure, siteUrl: h.improve.url() });
            if (outcome.changed) { m.outcomes.push(outcome); changed++; }
            m.states.set(file, { state: outcome.changed ? "done" : "unchanged", ...outcome.notes.length ? { notes: [...new Set(outcome.notes)] } : {} });
            m.left.set(file, new Map(outcome.left.map(item => [item.key, item])));
            for (const picture of row?.pictures ?? []) m.own.delete(picture.key);
          } catch (error) {
            if (abort.signal.aborted || error instanceof DOMException && error.name === "AbortError") break;
            failed++;
            m.states.set(file, { state: "failed", message: error instanceof Error ? error.message : undefined });
          }
        }
      } finally {
        const stopped = abort.signal.aborted;
        running = undefined;
        if (sheet.work === abort) sheet.work = undefined;
        h.tell(improveRunMessage(changed, stopped, failed));
        if (h.alive()) { await load(); if (shown()) draw(m.outcomes.length ? "undo-all" : "fix-all"); }
      }
    }, true, true);
  }

  async function undoRows(outcomes: RowOutcome[]) {
    const undone = new Set(outcomes);
    await h.task(async () => {
      m.kept = await session!.undo(outcomes, m.kept);
      m.outcomes = m.outcomes.filter(outcome => !undone.has(outcome));
      for (const outcome of undone) m.states.delete(outcome.file);
      h.tell(outcomes.length === 1 ? `Undone: ${outcomes[0].label}.` : "Undone.");
      await load();
      if (shown()) draw();
    });
  }

  /** The picture: own files from the library's bytes, outside ones from their website, players as a sign. */
  function preview(picture: ImprovePicture) {
    const frame = node("span", "media-improve__thumb");
    const sign = () => { frame.classList.add("is-file"); frame.replaceChildren(icon(picture.kind === "youtube" || picture.kind === "vimeo" ? "play" : "image-square", 20)); };
    const image = node("img"); image.alt = ""; image.decoding = "async"; image.loading = "lazy"; image.referrerPolicy = "no-referrer";
    image.addEventListener("error", sign, { once: true });
    if (picture.path) void h.cache.get(picture.path).then(data => { if (h.alive() && frame.isConnected) image.src = data.url; }).catch(sign);
    else if (picture.url) image.src = picture.url;
    else { sign(); return frame; }
    frame.append(image);
    return frame;
  }

  draw();
  void reload();
}
