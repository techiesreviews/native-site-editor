// An online video's details in Media (build slice 68, ticket 12 "YouTube and Vimeo in the library"):
// its still picture, name, service and address, and the pages that show it. In the Media pane also
// Choose picture… (Lex's own still), Vimeo's "Show Vimeo's own bar" switch and Remove from Media,
// which never contacts the service and leaves pages as they are. Loaded when such details open.
import { button, node } from "../ui/dom";
import { icon } from "../icons";
import { check, input } from "./media-library-fields";
import { onlineServiceName, onlineVideoName } from "./media-library-filter";
import { pageButton } from "./media-library-usage";
import { onlineVideoHref } from "./online-video";
import type { DetailHost } from "./media-library-details";
import type { LibrarySheet } from "./media-library-sheet";
import type { MediaOnlineVideo } from "./media-picker";

/** Back to the grid, focusing the video's tile (or Collections once it is gone). */
function leave(sheet: LibrarySheet, h: DetailHost, key: string) {
  sheet.version++; sheet.redraw = undefined;
  sheet.element.hidden = true; delete sheet.element.dataset.mode; sheet.element.replaceChildren();
  (h.grid.querySelector<HTMLElement>(`[data-id="${CSS.escape(key)}"] button`) ?? h.dialog.querySelector<HTMLElement>(".media-library__collections"))?.focus();
  if (!h.modal) h.dialog.scrollTop = 0;
}

/** Open the details of the online video `key`; they redraw when Media refreshes and close when it is gone. */
export function showOnlineVideoDetail(sheet: LibrarySheet, h: DetailHost, key: string) {
  const { element } = sheet;
  if (!h.alive()) return;
  sheet.focus = undefined; sheet.work?.abort(); sheet.repaint = undefined; sheet.path = undefined;
  element.dataset.mode = "details"; element.hidden = false;
  if (!h.modal) h.dialog.scrollTop = 0;
  const version = ++sheet.version;
  const current = () => h.alive() && version === sheet.version;
  const render = (focus: boolean) => {
    const video = h.library().onlineVideos?.find(entry => entry.key === key);
    if (!video) { leave(sheet, h, key); return; }
    const head = node("header", "media-detail__head"), back = button("", () => leave(sheet, h, key), "media-detail__back");
    back.setAttribute("aria-label", "Back"); back.append(icon("arrow-left", 20));
    head.append(back, node("h3", "", "Video details"));
    const layout = node("div", "media-detail"), info = node("div", "media-detail__info");
    layout.append(preview(h, video, current), info);
    info.append(facts(video), uses(h, video));
    if (!h.modal && video.service === "vimeo" && h.adapter.onlineVideoServiceBar) info.append(serviceBar(h, video, current));
    element.replaceChildren(head, layout);
    h.sync();
    if (focus) back.focus();
  };
  sheet.redraw = () => { if (current()) render(false); };
  render(true);
}

/** The still picture (a clean surface without one) and, in the pane, the video's actions under it. */
function preview(h: DetailHost, video: MediaOnlineVideo, current: () => boolean) {
  const { adapter, task, tell, refresh } = h, title = onlineVideoName(video);
  const view = node("div", "media-detail__view"), figure = node("figure", "media-detail__preview");
  figure.dataset.type = "video";
  const surface = () => {
    figure.classList.add("is-file");
    const picture = node("span", "media-library__type-picture"); picture.setAttribute("aria-hidden", "true");
    figure.replaceChildren(picture, node("span", "media-library__format", "No still picture yet"));
  };
  if (video.still) {
    const image = node("img"); image.alt = "";
    image.addEventListener("error", surface, { once: true });
    void h.cache.get(video.still).then(data => { image.src = data.url; }, surface);
    figure.append(image);
  } else surface();
  view.append(figure);
  if (h.modal) return view;
  const actions = node("div", "media-detail__actions");
  const key = { service: video.service, id: video.id };
  if (adapter.onlineVideoStill) actions.append(button("Choose picture…", () => void task(async () => {
    const { openMediaPicker } = await import("./media-picker");
    if (!current()) return;
    // Inside the explorer popover the picker keeps it open, as Video details' Choose picture… does.
    await openMediaPicker({ adapter, accept: "image/*", place: `${title} · Still picture`, within: h.dialog.closest<HTMLElement>("[popover]") ?? undefined,
      report: { announce: tell, error: error => tell(String(error)) },
      onPick: async (image, cancelled, held) => {
        let chosen = image;
        // A picture added inside the picker is saved first, then becomes the still.
        if (held) { const saved = await held.save(); chosen = held.image(saved.paths); }
        if (cancelled() || !h.alive()) return;
        await adapter.onlineVideoStill!(key, { path: chosen.path, width: chosen.width, height: chosen.height });
        if (current()) { await refresh(); tell("Still picture changed everywhere the video is used."); }
      } });
  })));
  if (adapter.removeOnlineVideo) {
    const remove = button("Remove from Media…", () => {
      // A short confirmation in place: pages keep the video, and the service is not contacted.
      const n = video.uses.length;
      const box = node("div", "media-detail__confirm"), words = node("p", "media-remove__warning",
        `${n ? `Pages that show it keep it (${n === 1 ? "1 page" : `${n} pages`}). ` : ""}${onlineServiceName(video.service)} is not contacted, and the video stays there.`);
      const row = node("div", "media-remove__actions");
      const cancel = button("Cancel", () => { box.replaceWith(actions); remove.focus(); });
      row.append(cancel, button("Remove", () => void task(async () => {
        await adapter.removeOnlineVideo!(key);
        if (!h.alive()) return;
        await refresh(); tell(`${title} was removed from Media.`);
      }), "button primary"));
      box.append(node("strong", "", `Remove ${title} from Media?`), words, row);
      actions.replaceWith(box); cancel.focus();
    });
    actions.append(remove);
  }
  if (actions.childElementCount) view.append(actions);
  return view;
}

/** Name, service and the address it plays from. */
function facts(video: MediaOnlineVideo) {
  const list = node("dl", "media-detail__facts"), service = onlineServiceName(video.service);
  const link = node("a", "", `Open on ${service}`);
  link.href = onlineVideoHref({ service: video.service, id: video.id, ...video.hash ? { hash: video.hash } : {} });
  link.target = "_blank"; link.rel = "noopener noreferrer";
  for (const [label, value] of [["Name", onlineVideoName(video)], ["Plays from", service], ["Address", link]] as const) {
    const row = node("div"), text = node("dd"); text.append(value);
    row.append(node("dt", "", label), text); list.append(row);
  }
  return list;
}

/** The pages (and component templates) that show it; each opens its page. */
function uses(h: DetailHost, video: MediaOnlineVideo) {
  // As File details' Usage: a box with the pages by name.
  const part = node("div", "media-detail__uses"), section = node("section");
  section.append(node("h3", "", `Pages · ${video.uses.length}`));
  part.append(section);
  if (!video.uses.length) section.append(node("p", "media-library__muted", "No page shows it. Add → Media places it again."));
  else {
    const list = node("ul");
    for (const page of video.uses) {
      const item = node("li");
      item.append(pageButton(page, h.adapter.usage?.pageLabel?.(page), () => void h.task(async () => { await h.adapter.openPage(page); h.close(); })));
      list.append(item);
    }
    section.append(list);
  }
  return part;
}

/** Vimeo only (slice 61): the video's own bar for owners whose plan cannot hide it. Off by default. */
function serviceBar(h: DetailHost, video: MediaOnlineVideo, current: () => boolean) {
  const part = node("div", "media-detail__part"), box = input("Show Vimeo's own bar", "checkbox");
  box.checked = Boolean(video.serviceBar);
  box.addEventListener("change", () => {
    const on = box.checked;
    void h.task(async () => {
      try { await h.adapter.onlineVideoServiceBar!({ service: video.service, id: video.id }, on); }
      catch (error) { box.checked = !on; throw error; }
      if (current()) { await h.refresh(); h.tell(on ? "Vimeo's own bar shows everywhere the video is used." : "The site's bar shows everywhere the video is used."); }
    });
  });
  part.append(node("h4", "", "Player"), check("Show Vimeo's own bar", box),
    node("p", "media-library__hint", "Turn on when the video's Vimeo plan cannot hide Vimeo's bar. Applies everywhere it is used."));
  return part;
}
