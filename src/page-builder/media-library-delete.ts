import { button, node } from "../ui/dom";
import { cancellation } from "./media-busy-lock";
import { takeSheet, type LibrarySheet, type LibrarySheetContext } from "./media-library-sheet";

type DeleteContext = Pick<LibrarySheetContext, "alive" | "library" | "loading" | "tell" | "task" | "refresh" | "adapter">;

/** Ask before deleting; afterwards focus the thumbnail now at the deleted one's place. */
export function confirmMediaDelete(sheet: LibrarySheet, grid: HTMLElement, c: DeleteContext, paths: string[], unusedOnly = false) {
  const { element } = sheet, { tell } = c;
  if (!c.alive()) return;
  if (c.loading()) { tell("Repository images are refreshing. Wait for them to finish before deleting images."); return; }
  takeSheet(sheet);
  if (!paths.length) { element.append(node("p", "", "None of the selected images are unused. References in components and CSS also count.")); return; }
  element.dataset.mode = "delete"; element.dataset.deletePath = paths[0];
  const confirmationVersion = sheet.version;
  const { usage } = c.library();
  const pages = new Set(paths.flatMap((path) => usage[path]?.pages ?? []));
  element.append(node("h3", "", `Delete ${paths.length} ${paths.length === 1 ? "image" : "images"}?`), node("p", "", pages.size
    ? `Used on ${pages.size} pages. Their references will break if you delete these images.`
    : "These images have no page usage. Check any component and CSS references below."));
  for (const path of paths) element.append(node("p", "media-library__hint",
    `${path}${usage[path]?.files.length ? ` · Referenced by ${usage[path].files.join(", ")}` : " · No source references"}`));
  element.append(node("p", "media-library__muted", "Deletion stays a draft until Save. Restore a repository image from the Files panel."),
    cancellation("Cancel", () => { sheet.version++; element.hidden = true; delete element.dataset.mode; }),
    button("Delete images", () => void c.task(async () => {
      if (confirmationVersion !== sheet.version || element.dataset.mode !== "delete") {
        tell("This delete confirmation has expired. Open a new confirmation to review current image references."); return;
      }
      const thumbnails = [...grid.querySelectorAll<HTMLElement>(".media-library__thumbnail")];
      const deletedIndex = thumbnails.findIndex(control => paths.includes(control.closest<HTMLElement>(".media-library__card")!.dataset.path!));
      const initiatingFocus = document.activeElement;
      const restoreBrowseFocus = initiatingFocus instanceof Element && element.contains(initiatingFocus);
      await c.adapter.remove(paths, unusedOnly); element.hidden = true; delete element.dataset.mode; await c.refresh();
      if (restoreBrowseFocus && (document.activeElement === initiatingFocus || document.activeElement === document.body)) {
        const remaining = [...grid.querySelectorAll<HTMLElement>(".media-library__thumbnail")];
        const target = remaining[Math.min(Math.max(deletedIndex, 0), remaining.length - 1)] ?? grid;
        if (target === grid) grid.tabIndex = -1;
        target.focus();
      }
      tell("Images deleted as drafts.");
    })));
}
