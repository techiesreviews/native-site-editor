import { node, button } from "../ui/dom";
import { icon } from "../icons";
import "./edit-bar-pictures.css";

// The edit bar's picture panel (TOOLS-185): the site's pictures as small
// tiles, the current one ringed and ticked, and Upload… under them, which
// also takes a file dropped anywhere on the panel. A pick or a finished upload
// closes the panel; a refused file (here, or dropped on the picture: `refused`)
// says why on the panel itself. The panel is
// kept across the bar's re-renders (`fill` hands it the new control), so an
// upload under way and tiles still loading stay where they are.

export interface PicturesControl {
  kind: "pictures";
  /** The bar button's text (Replace). */
  label: string;
  /** The bar button's and the panel's accessible name (Replace the picture). */
  ariaLabel?: string;
  /** The panel's heading (Site pictures). */
  title: string;
  /** The value of the picture shown now. */
  current?: string;
  /** The pictures to pick from; `url` is a small copy, absent while it loads. */
  items: { value: string; label: string; url?: string }[];
  /** Files from the computer: resolves to why the file was refused, or nothing once it is placed. */
  upload?: { label: string; accept?: string; onFiles: (files: File[]) => Promise<string | undefined> };
  /** Opened as soon as the bar renders (a double-click on the picture). */
  open?: boolean;
  /** Why a file dropped on the picture itself was refused: the panel says it beside Upload…. */
  refused?: string;
  /** Runs once when the panel opens (the bar asks for the tiles' small copies). */
  onOpen?: () => void;
  onPick: (value: string) => void;
}

export function createPicturesPanel(first: PicturesControl, close: () => void) {
  let control = first;
  let uploading = false;
  let problem: string | undefined;
  const element = node("div", "edit-bar__pictures");
  const title = node("p", "edit-bar__title");
  const grid = node("div", "edit-bar__tiles");
  grid.setAttribute("role", "group");
  const row = node("div", "edit-bar__upload");
  const input = document.createElement("input");
  input.type = "file";
  input.hidden = true;
  const pick = button("", () => input.click(), "edit-bar__menu-item edit-bar__upload-button");
  // Why a file was refused, beside Upload…; empty otherwise (no explainer, S1).
  const refusal = node("span", "edit-bar__upload-problem");
  refusal.setAttribute("role", "status");
  row.append(pick, input, refusal);
  element.append(title, grid, row);

  async function take(files: File[]) {
    const upload = control.upload;
    if (!upload || uploading || !files.length) return;
    uploading = true;
    problem = undefined;
    drawUpload();
    try {
      problem = await upload.onFiles(files.slice(0, 1));
    } catch {
      problem = "That picture could not be added";
    } finally {
      uploading = false;
    }
    if (!element.isConnected) return;
    if (problem === undefined) close();
    else drawUpload();
  }
  input.addEventListener("change", () => {
    const files = [...(input.files ?? [])];
    input.value = "";
    void take(files);
  });
  element.addEventListener("dragover", (event) => {
    if (!control.upload || !event.dataTransfer?.types.includes("Files")) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
    element.closest(".edit-bar__popover")?.classList.add("is-drop-target");
  });
  element.addEventListener("dragleave", (event) => {
    if (!element.contains(event.relatedTarget as Node | null)) element.closest(".edit-bar__popover")?.classList.remove("is-drop-target");
  });
  element.addEventListener("drop", (event) => {
    element.closest(".edit-bar__popover")?.classList.remove("is-drop-target");
    if (!control.upload || !event.dataTransfer?.files.length) return;
    event.preventDefault();
    void take([...event.dataTransfer.files]);
  });

  function drawUpload() {
    const upload = control.upload;
    row.hidden = !upload;
    if (!upload) return;
    if (upload.accept) input.accept = upload.accept;
    input.setAttribute("aria-label", upload.label);
    pick.textContent = uploading ? "Uploading…" : upload.label;
    pick.disabled = uploading;
    refusal.textContent = problem ?? "";
  }

  function fill(next: PicturesControl) {
    control = next;
    if (next.refused && !uploading) problem = next.refused;
    title.textContent = next.title;
    grid.setAttribute("aria-label", next.title);
    // The tile with the focus keeps it as the tiles are drawn again (a small copy arrived).
    const focused = grid.contains(document.activeElement) ? (document.activeElement as HTMLElement).dataset.value : undefined;
    grid.replaceChildren(...next.items.map((item) => {
      const tile = button("", () => { control.onPick(item.value); close(); }, "edit-bar__tile");
      tile.dataset.value = item.value;
      tile.title = item.label;
      tile.setAttribute("aria-label", item.label);
      const chosen = item.value === next.current;
      tile.setAttribute("aria-pressed", String(chosen));
      if (item.url) {
        const image = document.createElement("img");
        image.src = item.url;
        image.alt = "";
        tile.append(image);
      } else {
        tile.append(icon("image-square", 20, "edit-bar__tile-waiting"));
      }
      if (chosen) {
        const check = node("span", "edit-bar__tile-check");
        check.setAttribute("aria-hidden", "true");
        check.append(icon("check", 12));
        tile.append(check);
      }
      return tile;
    }));
    if (focused) [...grid.querySelectorAll<HTMLElement>(".edit-bar__tile")].find((tile) => tile.dataset.value === focused)?.focus();
    drawUpload();
  }
  fill(first);

  return {
    element,
    fill,
    /** The first thing to reach with the keyboard: the current picture, else the first one, else Upload…. */
    focus() {
      (grid.querySelector<HTMLElement>("[aria-pressed='true']") ?? grid.querySelector<HTMLElement>(".edit-bar__tile") ?? pick).focus();
    },
  };
}
