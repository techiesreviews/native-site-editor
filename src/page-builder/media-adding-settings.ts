import "./media-adding-settings.css";
import { button, node } from "../ui/dom";
import { icon } from "../icons";
import { repoSizeStatus } from "./media-limits";
import { sheetHead, takeSheet, type LibrarySheet, type LibrarySheetContext } from "./media-library-sheet";
import {
  MEDIA_ADDING_CHOICES, mediaAddingIsDefault, mediaAddingSettings, type MediaAddingChoices, type MediaAddingKind,
} from "./media-settings";

/** What Adding settings needs beyond the sheet context. */
export interface AddingSettingsHost extends LibrarySheetContext {
  /** Back to the grid, focus to More. */
  close: () => void;
}

const GROUPS: [MediaAddingKind, string][] = [["image", "Images"], ["video", "Video"], ["audio", "Audio"]];

/** One choice row: the title, its hint, and what marks it chosen (a trailing ✓ for a radio, a switch for a checkbox). */
function choiceRow(input: HTMLInputElement, title: string, hint: string, mark?: Element) {
  const row = node("label", "media-settings__choice");
  const text = node("span", "media-settings__text");
  text.append(node("span", "media-settings__title", title), node("span", "media-settings__hint", hint));
  row.append(input, text);
  if (mark) row.append(mark);
  return row;
}

/** More → Adding settings (media-manager ticket 07; look from audit slice 112): each kind's quality
 * choices in one grouped card, the chosen one ticked; Keep original as a switch row; Reset to defaults
 * only when something differs; then the repository's size as a storage card. Each change is
 * remembered for this site at once (`.editor/media.json`, one Undo step) and applies to files added
 * from then on. */
export function showAddingSettings(sheet: LibrarySheet, h: AddingSettingsHost) {
  const { element } = sheet;
  takeSheet(sheet);
  element.dataset.mode = "adding-settings";
  const version = sheet.version;
  const { title } = sheetHead(element, "Adding settings", h.close, "For files you add from now on. Files already in the site stay as they are.");

  const form = node("form", "media-settings");
  form.addEventListener("submit", event => event.preventDefault());
  const radios = new Map<string, HTMLInputElement>();
  for (const [kind, legend] of GROUPS) {
    const group = node("fieldset", "media-settings__group");
    const card = node("div", "media-settings__card");
    for (const [value, label, hint] of MEDIA_ADDING_CHOICES[kind]) {
      const radio = node("input"); radio.type = "radio"; radio.name = `adding-${kind}`; radio.value = value;
      radio.addEventListener("change", () => { if (radio.checked) save({ [kind]: value }); });
      radios.set(`${kind}:${value}`, radio);
      card.append(choiceRow(radio, label, hint, icon("check", 20, "media-settings__tick")));
    }
    group.append(node("legend", "", legend), card);
    form.append(group);
  }
  const keep = node("input", "media-switch"); keep.type = "checkbox"; keep.name = "keep-original";
  keep.addEventListener("change", () => save({ keepOriginal: keep.checked }));
  const keepCard = node("div", "media-settings__card");
  const keepRow = choiceRow(keep, "Keep original", "Also keeps each changed file as you added it, in media/originals. Anyone can download it by its address.");
  keepRow.classList.add("media-settings__keep");
  keepCard.append(keepRow);
  const reset = button("Reset to defaults", () => save("reset"), "text-button media-settings__reset");
  form.append(keepCard, reset);
  element.append(form);

  const size = repoSizeStatus(h.library().repoSize);
  if (size) {
    const section = node("section", "media-settings__card media-settings__size");
    section.setAttribute("aria-labelledby", "media-settings-size");
    const heading = node("h4", "", "Repository size"); heading.id = "media-settings-size";
    const used = node("p", "media-settings__used");
    used.append(node("strong", "", size.label), node("span", "", " of 1 GB GitHub Pages allows"));
    const meter = node("meter"); meter.min = 0; meter.max = 1_000_000_000;
    meter.value = Math.min(size.bytes, 1_000_000_000);
    meter.classList.toggle("is-near-full", size.nearFull);
    meter.setAttribute("aria-label", `Repository size: ${size.label} of 1 GB`);
    section.append(heading, used, meter);
    if (size.message) section.append(node("p", `media-settings__warning is-${size.level}`, size.message));
    element.append(section);
  }

  /** Show what the site remembers now (after a save, a failed save, or an Undo elsewhere). */
  const paint = () => {
    const choices = mediaAddingSettings(h.library().adding);
    for (const [kind] of GROUPS) radios.get(`${kind}:${choices[kind]}`)!.checked = true;
    keep.checked = choices.keepOriginal;
    reset.hidden = mediaAddingIsDefault(choices);
  };
  sheet.redraw = paint;
  function save(change: Partial<MediaAddingChoices> | "reset") {
    const onReset = change === "reset";
    // A refused or failed change shows what the site still remembers; busy-lock refusals included.
    void h.task(async () => {
      if (version !== sheet.version) return;
      await h.adapter.adding!(change);
      await h.refresh();
      if (version === sheet.version) h.done(onReset ? "Adding settings are back to the defaults." : "Adding settings saved as a draft.");
    }).then(() => {
      if (version !== sheet.version) return;
      const hadFocus = document.activeElement === reset;
      paint();
      // Reset hides itself; focus goes to the heading rather than being lost.
      if (onReset && reset.hidden && (hadFocus || document.activeElement === reset || document.activeElement === document.body)) title.focus();
    });
  }
  paint();
  h.sync();
  title.focus();
}
