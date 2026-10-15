import "./media-adding-settings.css";
import { button, node } from "../ui/dom";
import { icon } from "../icons";
import { repoSizeStatus } from "./media-limits";
import { takeSheet, type LibrarySheet, type LibrarySheetContext } from "./media-library-sheet";
import {
  MEDIA_ADDING_CHOICES, mediaAddingIsDefault, mediaAddingSettings, type MediaAddingChoices, type MediaAddingKind,
} from "./media-settings";

/** What Adding settings needs beyond the sheet context. */
export interface AddingSettingsHost extends LibrarySheetContext {
  /** Back to the grid, focus to More. */
  close: () => void;
}

const GROUPS: [MediaAddingKind, string][] = [["image", "Images"], ["video", "Video"], ["audio", "Audio"]];

/** More → Adding settings (media-manager ticket 07): a quality choice for images, video and audio,
 * Keep original and Reset to defaults, then the repository's size. Each change is remembered for
 * this site at once (`.editor/media.json`, one Undo step) and applies to files added from then on. */
export function showAddingSettings(sheet: LibrarySheet, h: AddingSettingsHost) {
  const { element } = sheet;
  takeSheet(sheet);
  element.dataset.mode = "adding-settings";
  const version = sheet.version;
  const head = node("header", "media-detail__head");
  const back = button("", h.close, "media-detail__back");
  back.setAttribute("aria-label", "Back"); back.append(icon("arrow-left", 20));
  const title = node("h3", "", "Adding settings"); title.tabIndex = -1;
  head.append(back, title);
  element.append(head, node("p", "media-library__muted", "For files you add from now on. Files already in the site stay as they are."));

  const form = node("form", "media-settings");
  form.addEventListener("submit", event => event.preventDefault());
  const radios = new Map<string, HTMLInputElement>();
  for (const [kind, legend] of GROUPS) {
    const group = node("fieldset", "media-settings__group");
    group.append(node("legend", "", legend));
    for (const [value, label, hint] of MEDIA_ADDING_CHOICES[kind]) {
      const choice = node("label", "media-settings__choice");
      const radio = node("input"); radio.type = "radio"; radio.name = `adding-${kind}`; radio.value = value;
      radio.addEventListener("change", () => { if (radio.checked) save({ [kind]: value }); });
      radios.set(`${kind}:${value}`, radio);
      const text = node("span", "media-settings__text");
      text.append(node("span", "", label), node("span", "media-library__hint", hint));
      choice.append(radio, text);
      group.append(choice);
    }
    form.append(group);
  }
  const keep = node("input"); keep.type = "checkbox"; keep.name = "keep-original";
  keep.addEventListener("change", () => save({ keepOriginal: keep.checked }));
  const keepLabel = node("label", "media-settings__choice media-settings__keep");
  const keepText = node("span", "media-settings__text");
  keepText.append(node("span", "", "Keep original"),
    node("span", "media-library__hint", "Also keeps each changed file as you added it, in media/originals. Anyone can download it by its address."));
  keepLabel.append(keep, keepText);
  const reset = button("Reset to defaults", () => save("reset"), "button secondary media-settings__reset");
  form.append(keepLabel, reset);
  element.append(form);

  const size = repoSizeStatus(h.library().repoSize);
  if (size) {
    const section = node("section", "media-settings__size");
    section.setAttribute("aria-labelledby", "media-settings-size");
    const heading = node("h4", "", "Repository size"); heading.id = "media-settings-size";
    const meter = node("meter"); meter.min = 0; meter.max = 1_000_000_000; meter.low = 500_000_000; meter.high = 900_000_000; meter.optimum = 0;
    meter.value = Math.min(size.bytes, 1_000_000_000);
    meter.setAttribute("aria-label", `Repository size: ${size.label} of 1 GB`);
    section.append(heading, node("p", "", size.message ? size.label : `${size.label}. GitHub Pages publishes sites up to 1 GB.`), meter);
    if (size.message) section.append(node("p", `media-settings__warning is-${size.level}`, size.message));
    element.append(section);
  }

  /** Show what the site remembers now (after a save, a failed save, or an Undo elsewhere). */
  const paint = () => {
    const choices = mediaAddingSettings(h.library().adding);
    for (const [kind] of GROUPS) radios.get(`${kind}:${choices[kind]}`)!.checked = true;
    keep.checked = choices.keepOriginal;
    reset.disabled = mediaAddingIsDefault(choices);
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
      paint();
      // Reset turns itself off; focus goes to the heading rather than being lost.
      if (onReset && reset.disabled && (document.activeElement === reset || document.activeElement === document.body)) title.focus();
    });
  }
  paint();
  h.sync();
  title.focus();
}
