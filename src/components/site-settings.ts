import { icon } from "../icons";
import { button, node } from "../ui/dom";
import { createUrlChange, type UrlPlan } from "./url-change";
import { hasHeadField, readHeadSettings, withSearchHidden, type HeadField } from "../page-builder/site-head";
import type { NavigationLink } from "../page-builder/site-navigation";
import type { CollectionsPanel } from "./collections-panel";
import "./site-settings.css";

export interface SiteSettingsValues { name: string; favicon: string; socialImage: string }
export interface SitePageChoice { route: string; label: string; file: string }
export interface SiteLinkPreference { title: boolean; description: boolean }
export interface SiteSettingsHandlers {
  /** `pageFields` overlays staged Date/custom fields on the metadata candidate. */
  applyPage: (path: string, fields: Partial<Record<HeadField, string>>, pageFields?: (source: string) => string) => Promise<string | undefined>;
  /** Mounts the staged Date/custom page fields; the dialog destroys it on close. */
  pageFields?: (host: HTMLElement, path: string) => CollectionsPanel;
  planUrl: (path: string, value: string) => UrlPlan;
  applyUrl: (path: string, value: string, keep: boolean) => Promise<string | undefined>;
  applySite: (values: SiteSettingsValues) => Promise<string | undefined>;
  open404: () => Promise<string | undefined>;
  applyNavigation: (path: string, source: string, links: NavigationLink[]) => Promise<string | undefined>;
  uploadImage: () => Promise<string | undefined>;
  imageUrl: (path: string) => Promise<string | undefined>;
}

let serial = 0;
function settingsDialog(title: string, scope: string) {
  const id = `site-settings-${++serial}`;
  const root = node("dialog", "site-settings");
  root.setAttribute("aria-labelledby", id);
  const heading = node("h2", "site-settings__title", title);
  heading.id = id;
  const close = button("", () => root.close(), "site-settings__close");
  close.append(icon("x", 18));
  close.setAttribute("aria-label", `Close ${title.toLowerCase()}`);
  const top = node("div", "site-settings__top");
  const introduction = node("div", "site-settings__introduction");
  const note = node("p", "site-settings__scope", scope);
  note.id = `${id}-scope`;
  root.setAttribute("aria-describedby", note.id);
  introduction.append(heading, note);
  top.append(introduction, close);
  const body = node("div", "site-settings__body");
  const categories = node("div", "site-settings__categories");
  categories.setAttribute("role", "tablist");
  categories.setAttribute("aria-label", `${title} categories`);
  const narrow = matchMedia("(max-width: 640px)");
  const orientation = () => categories.setAttribute("aria-orientation", narrow.matches ? "horizontal" : "vertical");
  orientation();
  narrow.addEventListener("change", orientation);
  const content = node("div", "site-settings__content");
  body.append(categories, content);
  const status = node("p", "site-settings__status");
  status.setAttribute("role", "status");
  const actions = node("div", "site-settings__actions");
  const footer = node("div", "site-settings__footer");
  footer.append(node("p", "site-settings__draft-note", "Drafts until you save to GitHub"), status, actions);
  root.append(top, body, footer);
  const tabs: { label: string; tab: HTMLButtonElement; panel: HTMLElement }[] = [];
  const select = (label: string, focus = false) => {
    for (const item of tabs) {
      const active = item.label === label;
      item.tab.setAttribute("aria-selected", String(active));
      item.tab.tabIndex = active ? 0 : -1;
      item.panel.hidden = !active;
      if (active && focus) item.tab.focus();
    }
    content.scrollTop = 0;
  };
  function category(label: string, symbol: Parameters<typeof icon>[0]) {
    const panel = node("div", "site-settings__category");
    panel.id = `${id}-panel-${tabs.length}`;
    panel.setAttribute("role", "tabpanel");
    const tab = button("", () => select(label), "site-settings__category-tab");
    tab.append(icon(symbol, 18), node("span", "", label));
    tab.id = `${id}-tab-${tabs.length}`;
    tab.setAttribute("role", "tab");
    tab.setAttribute("aria-controls", panel.id);
    panel.setAttribute("aria-labelledby", tab.id);
    panel.append(node("h3", "site-settings__category-title", label));
    tabs.push({ label, tab, panel });
    categories.append(tab); content.append(panel);
    select(tabs[0].label);
    return panel;
  }
  categories.addEventListener("keydown", (event) => {
    const index = tabs.findIndex((item) => item.tab === event.target);
    if (index < 0) return;
    let next: number | undefined;
    if (["ArrowDown", "ArrowRight"].includes(event.key)) next = (index + 1) % tabs.length;
    if (["ArrowUp", "ArrowLeft"].includes(event.key)) next = (index - 1 + tabs.length) % tabs.length;
    if (event.key === "Home") next = 0;
    if (event.key === "End") next = tabs.length - 1;
    if (next !== undefined) { event.preventDefault(); select(tabs[next].label, true); }
  });
  let opener: Element | null;
  let returnFocus: HTMLElement | null;
  root.addEventListener("keydown", (event) => { if (event.key === "Escape") event.stopPropagation(); });
  root.addEventListener("close", () => {
    narrow.removeEventListener("change", orientation);
    if (opener instanceof HTMLElement && opener.isConnected && !opener.closest("[popover]:not(:popover-open)")) opener.focus();
    else if (returnFocus?.isConnected) returnFocus.focus();
    root.remove();
  });
  return { root, body: content, category, select, actions, status, show() {
    opener = document.activeElement;
    const popover = opener?.closest("[popover]");
    returnFocus = popover?.id ? document.querySelector<HTMLElement>(`[aria-controls="${CSS.escape(popover.id)}"]`) : null;
    document.body.append(root); root.showModal(); tabs[0]?.tab.focus();
  } };
}

function textField(parent: HTMLElement, label: string, value: string, hint?: string) {
  const wrap = node("label", "site-settings__field");
  const input = label.toLowerCase().includes("description") ? node("textarea", "site-settings__input") : node("input", "site-settings__input");
  if (input instanceof HTMLInputElement) input.type = "text";
  else input.rows = 3;
  input.value = value;
  input.setAttribute("aria-label", label);
  wrap.append(node("span", "site-settings__label", label), input);
  if (hint) wrap.append(node("span", "site-settings__hint", hint));
  parent.append(wrap);
  return input;
}
function checkbox(parent: HTMLElement, label: string, checked: boolean) {
  const wrap = node("label", "site-settings__check");
  const input = node("input");
  input.type = "checkbox";
  input.checked = checked;
  wrap.append(input, node("span", "", label));
  parent.append(wrap);
  return input;
}
function section(parent: HTMLElement, title: string) {
  const fieldset = node("fieldset", "site-settings__section");
  fieldset.append(node("legend", "site-settings__legend", title));
  parent.append(fieldset);
  return fieldset;
}
// Every value the dialog's form holds, to tell whether typing happened while
// an Apply was waiting.
function formStamp(root: HTMLElement) {
  return JSON.stringify([...root.querySelectorAll<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>("input, textarea, select")]
    .map((input) => [input.value, input instanceof HTMLInputElement && input.type === "checkbox" ? input.checked : null]));
}
function applyButton(dialog: ReturnType<typeof settingsDialog>, label: string, run: () => Promise<string | undefined>, unchanged: () => boolean = () => true) {
  const apply = button(label, async () => {
    if (apply.disabled) return;
    apply.disabled = true;
    dialog.status.textContent = "Applying drafts…";
    // Inputs stay editable meanwhile. Close only if they still hold exactly
    // what was applied; newer typing is kept and needs a fresh Apply proof.
    const submitted = formStamp(dialog.root);
    try {
      const error = await run();
      if (error) dialog.status.textContent = error;
      else if (!dialog.root.isConnected) return;
      else if (formStamp(dialog.root) === submitted && unchanged()) dialog.root.close();
      else dialog.status.textContent = "Applied the earlier values as drafts. Your newer changes are kept here; close and reopen to apply them.";
    } catch (error) { dialog.status.textContent = error instanceof Error ? error.message : "The change could not be applied."; }
    finally { apply.disabled = false; }
  }, "button");
  dialog.actions.append(button("Cancel", () => dialog.root.close(), "button secondary"), apply);
}

async function uploadInto(input: HTMLInputElement | HTMLTextAreaElement, dialog: ReturnType<typeof settingsDialog>, handlers: SiteSettingsHandlers, refresh?: () => void) {
  const before = input.value;
  try {
    const value = await handlers.uploadImage();
    // A picker may outlive its dialog or edits made while the upload runs.
    if (value && dialog.root.isConnected && input.value === before) {
      input.value = value;
      refresh?.();
    }
  } catch (error) {
    if (dialog.root.isConnected) dialog.status.textContent = error instanceof Error ? error.message : String(error);
  }
}

export function createSiteSettings(handlers: SiteSettingsHandlers, linkPreferences = new Map<string, SiteLinkPreference>()) {
  // Link preferences persist while this editor session stays open. On a new session,
  // equal/missing social values follow the page; distinct values remain independent.
  return {
    page(options: { path: string; source: string; route: string; images: string[] }) {
      const values = readHeadSettings(options.source);
      const dialog = settingsDialog("Page settings", `This page · ${options.route}`);
      const generalPanel = dialog.category("General", "file");
      const searchPanel = dialog.category("Search", "list-checks");
      const socialPanel = dialog.category("Social", "link");
      const fieldsPanel = handlers.pageFields ? dialog.category("Fields", "file-dashed") : undefined;
      let pageFields: CollectionsPanel | undefined;
      let stampAtApply: string | undefined;
      if (fieldsPanel) {
        fieldsPanel.append(node("p", "site-settings__hint", "Date and custom fields that collection listings can show, sort and filter by."));
        pageFields = handlers.pageFields!(fieldsPanel, options.path);
        dialog.root.addEventListener("close", () => pageFields?.destroy(), { once: true });
      }
      const details = section(generalPanel, "Page details");
      const title = textField(details, "Title", values.title, "Shown in browser tabs and search results.");
      title.placeholder = new DOMParser().parseFromString(options.source, "text/html").querySelector("h1")?.textContent?.trim() ?? "";
      const description = textField(details, "Description", values.description, "A short summary for search results.");
      const url = createUrlChange({
        label: "URL", ariaLabel: "URL", initial: options.route, buttons: true,
        plan: (value) => handlers.planUrl(options.path, value),
        apply: async (value, keep) => {
          const fieldsChanged = title.value !== values.title || description.value !== values.description || socialTitle.value !== initialSocialTitle || socialDescription.value !== initialSocialDescription || titleLink.checked !== initialTitleLink || descriptionLink.checked !== initialDescriptionLink || image.value !== values["og:image"] || canonical.value !== values.canonical || hidden.checked !== /\b(noindex|none)\b/i.test(values.robots) || theme.value !== values["theme-color"];
          if (fieldsChanged || pageFields?.pageFieldsDirty()) return "Apply page details before changing the URL, so those edits are kept.";
          const error = await handlers.applyUrl(options.path, value, keep);
          if (!error) dialog.root.close();
          return error;
        }, cancel: () => {},
      });
      if (options.route === "/") { url.input.readOnly = true; details.append(node("p", "site-settings__hint", "The home page's URL is always /.")); }
      details.append(url.root);
      const search = section(searchPanel, "Search visibility");
      const canonical = textField(search, "Canonical URL", values.canonical, "The preferred full address when this content appears at multiple URLs.");
      const hidden = checkbox(search, "Hide from search engines", /\b(noindex|none)\b/i.test(values.robots));
      search.append(node("p", "site-settings__hint", "Adds noindex for search engines. This does not make a page private."));
      const theme = textField(search, "Theme colour", values["theme-color"], "A CSS colour for supported browser chrome, for example #2f6d3a.");
      const social = section(socialPanel, "Share card");
      const preference = linkPreferences.get(options.path);
      const titleLink = checkbox(social, "Use page title", preference?.title ?? (!values["og:title"] || values["og:title"] === values.title));
      const socialTitle = textField(social, "Social title", values["og:title"] || values.title);
      const descriptionLink = checkbox(social, "Use page description", preference?.description ?? (!values["og:description"] || values["og:description"] === values.description));
      const socialDescription = textField(social, "Social description", values["og:description"] || values.description);
      const image = textField(social, "Social image", values["og:image"], "Choose a site image or paste a full image URL. Sharing services favour a 1200 × 630 image.");
      addImageChoices(image, options.images);
      const upload = button("Upload social image…", () => uploadInto(image, dialog, handlers, refresh), "site-settings__link");
      social.append(upload);
      const card = node("div", "site-settings__card");
      card.setAttribute("aria-label", "Share card preview");
      const photo = node("img", "site-settings__card-image");
      photo.alt = "";
      photo.hidden = true;
      const placeholder = node("div", "site-settings__card-placeholder", "Add an image for your share card");
      const cardBody = node("div", "site-settings__card-body");
      const cardUrl = node("span", "site-settings__hint", options.route);
      const cardTitle = node("strong");
      const cardDescription = node("p");
      cardBody.append(cardUrl, cardTitle, cardDescription);
      card.append(photo, placeholder, cardBody);
      social.append(card, node("p", "site-settings__hint", "Preview only. Twitter and LinkedIn may crop images or cache older details."));
      let imageRequest = 0;
      function refresh() {
        socialTitle.readOnly = titleLink.checked;
        socialDescription.readOnly = descriptionLink.checked;
        if (titleLink.checked) socialTitle.value = title.value;
        if (descriptionLink.checked) socialDescription.value = description.value;
        cardTitle.textContent = socialTitle.value || "Your page title";
        cardDescription.textContent = socialDescription.value || "Your page description";
        const request = ++imageRequest;
        void handlers.imageUrl(image.value).then((src) => {
          if (request !== imageRequest || !dialog.root.isConnected) return;
          photo.hidden = !src;
          placeholder.hidden = Boolean(src);
          if (src) photo.src = src; else photo.removeAttribute("src");
        }).catch(() => {
          if (request !== imageRequest || !dialog.root.isConnected) return;
          photo.hidden = true;
          photo.removeAttribute("src");
          placeholder.hidden = false;
          placeholder.textContent = "Image preview unavailable";
        });
      }
      photo.addEventListener("error", () => { photo.hidden = true; placeholder.hidden = false; placeholder.textContent = "Image preview unavailable"; });
      for (const input of [title, description, titleLink, descriptionLink, socialTitle, socialDescription, image]) input.addEventListener("input", refresh);
      refresh();
      // Missing social metadata follows the displayed page details. Compare
      // URL changes with that initial UI state, rather than absent raw tags.
      const initialSocialTitle = socialTitle.value;
      const initialSocialDescription = socialDescription.value;
      const initialTitleLink = titleLink.checked;
      const initialDescriptionLink = descriptionLink.checked;
      applyButton(dialog, "Apply page settings", async () => {
        if (canonical.value && !/^https?:\/\//i.test(canonical.value.trim())) return "Canonical URL must start with https:// or http://.";
        if (theme.value && !CSS.supports("color", theme.value)) return "Enter a valid CSS colour for the theme colour.";
        const desired: Partial<Record<HeadField, string>> = { title: title.value, description: description.value, "og:image": image.value, canonical: canonical.value, robots: hidden.checked === /\b(noindex|none)\b/i.test(values.robots) ? values.robots : withSearchHidden(values.robots, hidden.checked), "theme-color": theme.value };
        const fields: Partial<Record<HeadField, string>> = {};
        for (const [field, value] of Object.entries(desired)) if (value !== values[field as HeadField]) fields[field as HeadField] = value;
        // Compare independent values with the resulting authored value or
        // page fallback. Unlinking can preserve old social text without typing.
        const effectiveTitle = hasHeadField(options.source, "og:title") ? values["og:title"] : title.value;
        const effectiveDescription = hasHeadField(options.source, "og:description") ? values["og:description"] : description.value;
        if ((title.value !== values.title || titleLink.checked !== initialTitleLink || socialTitle.value !== initialSocialTitle) && socialTitle.value !== effectiveTitle) fields["og:title"] = socialTitle.value;
        if ((description.value !== values.description || descriptionLink.checked !== initialDescriptionLink || socialDescription.value !== initialSocialDescription) && socialDescription.value !== effectiveDescription) fields["og:description"] = socialDescription.value;
        const linked = { title: titleLink.checked, description: descriptionLink.checked };
        const panel = pageFields;
        stampAtApply = panel?.pageFieldsStamp();
        const error = await handlers.applyPage(options.path, fields, panel ? (source) => panel.pageFieldSource(source) : undefined);
        if (!error) linkPreferences.set(options.path, linked);
        return error;
      }, () => pageFields?.pageFieldsStamp() === stampAtApply);
      dialog.show();
    },
    site(options: { values: SiteSettingsValues; pages: SitePageChoice[]; images: string[]; has404: boolean }) {
      const dialog = settingsDialog("Site settings", "Shared across your site");
      const generalPanel = dialog.category("General", "house");
      const socialPanel = dialog.category("Social", "link");
      const pagesPanel = dialog.category("Pages", "file");
      const general = section(generalPanel, "Site identity");
      const name = textField(general, "Site name", options.values.name, "Used for new page details and the site's social identity.");
      const favicon = textField(general, "Favicon", options.values.favicon, "Choose an image or paste its URL. Applied to every page's head.");
      addImageChoices(favicon, options.images);
      general.append(button("Upload favicon…", () => uploadInto(favicon, dialog, handlers), "site-settings__link"));
      const social = section(socialPanel, "Default share image");
      const image = textField(social, "Default social image", options.values.socialImage, "Used on new pages and pages using the current default. Custom page images stay independent.");
      addImageChoices(image, options.images);
      social.append(button("Upload default image…", () => uploadInto(image, dialog, handlers), "site-settings__link"));
      const affected = section(pagesPanel, `Affected pages (${options.pages.length})`);
      affected.append(node("p", "site-settings__hint", "Favicon and social site name apply to these pages. Their title and description stay their own."));
      const list = node("ul", "site-settings__affected");
      for (const page of options.pages) list.append(node("li", "", `${page.label} · ${page.route}`));
      affected.append(list);
      const missing = section(pagesPanel, "404 page");
      missing.append(node("p", "site-settings__hint", "The page visitors see at a missing address. Your static host decides when to serve it."));
      missing.append(button(options.has404 ? "Open 404 page" : "Create and open 404 page", async () => {
        const error = await handlers.open404();
        if (error) dialog.status.textContent = error; else dialog.root.close();
      }, "site-settings__link"));
      applyButton(dialog, "Apply site settings", () => handlers.applySite({ name: name.value.trim(), favicon: favicon.value.trim(), socialImage: image.value.trim() }));
      dialog.show();
    },
    navigation(options: { path: string; source: string; links: NavigationLink[]; pages: SitePageChoice[]; shared: boolean }) {
      const dialog = settingsDialog("Navigation", `${options.shared ? "Shared component" : "This page's header"} · ${options.path}`);
      const linksPanel = dialog.category("Links", "link");
      const addPanel = dialog.category("Add link", "plus");
      linksPanel.append(node("p", "site-settings__hint", "Drag links to reorder, or use Move up and Move down. Applying writes clean links to this source file."));
      const list = node("ol", "site-settings__nav");
      linksPanel.append(list);
      const links = options.links.map((link) => ({ ...link }));
      let dragging: number | undefined;
      const move = (from: number, to: number) => { const [link] = links.splice(from, 1); links.splice(to, 0, link); draw(); };
      function draw() {
        list.replaceChildren(...links.map((link, index) => {
          const row = node("li", "site-settings__nav-row");
          const grip = node("button", "site-settings__grip");
          grip.append(icon("dots-six-vertical", 18));
          grip.type = "button";
          grip.draggable = true;
          grip.setAttribute("aria-label", `Reorder ${link.label}`);
          grip.title = "Drag to reorder; Alt+Up or Alt+Down moves one place";
          grip.addEventListener("dragstart", (event) => { dragging = index; event.dataTransfer?.setData("text/plain", String(index)); });
          grip.addEventListener("dragend", () => { dragging = undefined; });
          grip.addEventListener("keydown", (event) => {
            if (!event.altKey || !["ArrowUp", "ArrowDown"].includes(event.key)) return;
            event.preventDefault();
            const next = index + (event.key === "ArrowUp" ? -1 : 1);
            if (next >= 0 && next < links.length) { move(index, next); list.children[next].querySelector<HTMLButtonElement>("button")?.focus(); }
          });
          row.addEventListener("dragover", (event) => { if (dragging !== undefined) event.preventDefault(); });
          row.addEventListener("drop", (event) => { event.preventDefault(); if (dragging !== undefined) move(dragging, index); dragging = undefined; });
          const fields = node("div", "site-settings__nav-fields");
          const label = textField(fields, `Link ${index + 1} label`, link.label);
          const href = textField(fields, `Link ${index + 1} URL`, link.href);
          label.addEventListener("input", () => { link.label = label.value; });
          href.addEventListener("input", () => { link.href = href.value; });
          const controls = node("div", "site-settings__nav-controls");
          const up = button("", () => move(index, index - 1), "site-settings__link");
          up.append(icon("arrow-up", 16));
          up.disabled = index === 0;
          up.setAttribute("aria-label", `Move ${link.label} up`);
          const down = button("", () => move(index, index + 1), "site-settings__link");
          down.append(icon("arrow-down", 16));
          down.disabled = index === links.length - 1;
          down.setAttribute("aria-label", `Move ${link.label} down`);
          controls.append(up, down, button("Remove", () => { links.splice(index, 1); draw(); }, "site-settings__link"));
          row.append(grip, fields, controls);
          return row;
        }));
      }
      draw();
      const add = section(addPanel, "Choose a destination");
      const pickerLabel = node("label", "site-settings__field");
      const picker = node("select", "site-settings__input");
      picker.setAttribute("aria-label", "Page to add");
      pickerLabel.append(node("span", "site-settings__label", "Page to add"), picker);
      for (const page of options.pages.filter((page) => page.route !== "/404.html")) { const option = node("option", "", `${page.label} · ${page.route}`); option.value = page.route; picker.append(option); }
      add.append(pickerLabel, button("Add page", () => { const page = options.pages.find((page) => page.route === picker.value); if (page) { links.push({ href: page.route, label: page.label }); draw(); dialog.select("Links", true); } }, "site-settings__link"), button("Add external link", () => { links.push({ href: "https://", label: "New link" }); draw(); dialog.select("Links"); list.lastElementChild?.querySelector<HTMLInputElement>("input")?.focus(); }, "site-settings__link"));
      applyButton(dialog, "Apply navigation", () => handlers.applyNavigation(options.path, options.source, links));
      dialog.show();
    },
  };
}

function addImageChoices(input: HTMLInputElement | HTMLTextAreaElement, images: string[]) {
  const list = node("datalist");
  list.id = `site-images-${++serial}`;
  for (const path of images) { const option = node("option"); option.value = `/${path}`; list.append(option); }
  input.setAttribute("list", list.id);
  input.parentElement?.append(list);
}
