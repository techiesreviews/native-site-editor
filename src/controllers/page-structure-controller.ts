import { pageRemovable, selectionAfterRemove } from "../page-builder/remove";
import { type NativePreviewSelection, type NativeTextSelection, type NativeTextEdit, type NativeFormat, type createNativePreview } from "../components/native-preview";
import { nativeElementLabel, linkWrapEdit, opensInNewTab, newTabEdit, setAttributeEdit, unwrapEdits, previousHeadingLevel, altFromPath, nativeKindLabel, duplicateEdit, removeEdit } from "../native-structure";
import { type EditBarControl, type EditBarModel } from "../components/edit-bar";
import { textSizeScale, currentTextSize, textSizeEdit } from "../native-text-size";
import { type StartTag, type ElementRange } from "../native-source-location";
import { nativeLinkSuggestions } from "../native-pages";
import { nativeElementFields, locateNativeFieldElement, nativeElementAttributeEdits } from "../page-builder/native-element-fields";
import { blockLayout, blockLayoutEdit } from "../page-builder/block-fields";
import { decodeHtmlEntities } from "../page-builder/html-entities";
import { REQUEST_TEXT_LIMIT } from "../../shared/agent";
import { handleChunkLoadFailure } from "../chunk-recovery";
import { isSectionTemplate } from "../native-insert";
import { nativeMovableBlock, type ItemsSlotRule } from "../page-builder/native-operations";
import { templateMovePath } from "../page-builder/block-insert";
import { nativeElementSiblingMove, nativeSectionMovePlan } from "../page-builder/native-move-choices";
import { type ComponentTools } from "../page-builder/components";
import { type createAgentController } from "../controllers/agent-controller";
import { type createPageStructure } from "../components/page-structure";
import { type NativeSite } from "../../shared/native-project";
import type * as sourceEditor from "../components/source-editor";
import type { PreviewSelectionController } from "./preview-selection-controller";
import type { GuardedEdits, Planned, PlanResult, Reads, Stamp } from "../guarded-edit";

/** Workspace values are live host getters; operations and parsers stay injected. */
export interface PageStructurePorts {
  readonly nativePreview: Pick<ReturnType<typeof createNativePreview>, "selectNode" | "route" | "selectTextAfterUpdate" | "selectAfterUpdate" | "refresh" | "showEditBar" | "hideEditBar"> | undefined;
  readonly editorModule: Pick<typeof sourceEditor, "captureFileModelState" | "closeActiveEditGroup" | "isMounted" | "replaceActiveRange" | "replaceActiveRanges" | "runVisualHistory" | "forgetDraftModel">;
  /** Guarded edits (src/guarded-edit.ts): section moves, field writes and text edits are its plans. */
  readonly edits: GuardedEdits;
  readonly appStore: { openFile: { readonly value: string | undefined }; selection: { readonly value: NativePreviewSelection | undefined } };
  readonly componentTools: ComponentTools | undefined;
  readonly nativeEditableSource: (path: string) => string | undefined;
  readonly nativeSite: NativeSite | undefined;
  readonly element: <T extends HTMLElement>(id: string) => T;
  readonly generation: number;
  readonly setupScope: () => string;
  readonly draftScope: () => { account: string; repoId: number; repo: string; branch: string; } | undefined;
  readonly openNativeNavigation: (pagePath: string) => Promise<void>;
  readonly nativeSources: (site?: NativeSite | undefined) => Record<string, string>;
  readonly nativePageStyles: () => string[];
  readonly nativeTextTags: Set<string>;
  readonly previewSelection: Pick<PreviewSelectionController, "textSelection">;
  readonly wholeWrapper: (inner: string, tags: string[]) => { open: number; openEnd: number; closeAt: number; closeEnd: number; } | undefined;
  readonly nativeLinkParents: Set<string>;
  readonly errorMessage: (error: unknown) => void;
  readonly nearestLink: (source: string, node: number[], range: ElementRange | undefined) => { range: ElementRange; node: number[]; } | undefined;
  readonly nativeRouteInfo: (route: string, site?: NativeSite | undefined) => { title?: string; description?: string; };
  readonly versionView: unknown;
  readonly nativeEffectiveSource: (path: string, scope?: { account: string; repoId: number; repo: string; branch: string; } | undefined) => string | undefined;
  readonly nativeNamedDescendant: (source: string, range: { start: number; end: number; }) => boolean;
  readonly chooseMediaForImage: (target: { path: string; node: number[]; width?: number; }, files?: File[]) => Promise<void>;
  readonly nativePictureSources: (source: string, node: readonly number[]) => boolean;
  /** The card grid controls for a selection, move arrows already left out (cards controller). */
  cardControls(selection: NativePreviewSelection, source: string): EditBarControl[];
  readonly agentController: Pick<ReturnType<typeof createAgentController>, "captureAsk">;
  readonly announce: (text: string) => void;
  /** A refusal: said in #status and shown on screen. */
  readonly refuse: (reason: string) => void;
  readonly restoreFile: (path: string, epoch: number, options?: { linkDefaultStyle?: boolean; keepExplorer?: boolean; quietStatus?: boolean; beforeMount?: () => boolean; }) => Promise<void>;
  readonly updateNativePreviewSources: () => void;
  readonly nativeEditableTemplatePath: () => string | undefined;
  readonly applyNativeOperation: (op: { expectedSources: Map<string, string | undefined>; edits: Map<string, string>; done: string; undone: string }) => Promise<string | undefined>;
  readonly nativePageLabelOf: (file: string) => string;
  readonly pageStructure: Pick<ReturnType<typeof createPageStructure>, "update"> | undefined;
  readonly locateNativeElementRange: (html: string, path: number[]) => ElementRange | undefined;
  readonly startTagAttribute: (html: string, tag: StartTag, name: string) => import("../../shared/html-source").TagAttribute | undefined;
  readonly elementPathAt: (html: string, start: number) => number[] | undefined;
  readonly textRangeInSource: (inner: string, start: number, end: number, text: string) => import("../../shared/html-source").SourceSpan | undefined;
  readonly wrapperAround: (inner: string, at: number, names: string[]) => ElementRange | undefined;
  /** Which slots of a component are items slots: blocks in them drag by the bar's name as page blocks do. */
  readonly itemsSlots: () => ItemsSlotRule;
  /** Canvas and edit-bar sibling keys use the host's fresh source and one transaction. */
  readonly moveBlock: (selection: NativePreviewSelection, direction: "up" | "down") => "moved" | "stayed";
}

/** What a section move was offered against: the bytes painted for it, the workspace then (`since`) and, from the bar, its selection and editor model (`guard`). */
export interface SectionMoveOffer { painted: string; since?: Stamp; guard?: () => boolean }

// A plan with nothing to write: no step, nothing said.
const NOTHING: Planned = { done: "", undone: "" };
const SECTION_MOVE_STALE = "The source or selection changed. Select the section again before moving it.";
const SECTION_OPEN_STALE = "The source changed while its editor opened. Select the section again before moving it.";
const FIELD_STALE = "The source or selection changed. Select the element again before editing its fields.";
const TEXT_UNPLACED = "That text change could not be placed in the source. Change text within one formatting at a time.";

export function createPageStructureController(ports: PageStructurePorts) {
  const refuse = (reason: string) => ports.refuse(reason);
  // The selection is still `node` of `path`.
  const stillSelected = (path: string, node: readonly number[]) => () =>
    ports.appStore.selection.value?.path === path && ports.appStore.selection.value.node?.join(".") === node.join(".");
  // The open file's editor model now (document, session, revision), for an offer kept past this moment.
  const modelNow = (path: string) => {
    const scope = ports.draftScope();
    return scope && ports.editorModule.captureFileModelState(scope, path);
  };
  // The workspace as one load (account, repository, branch, generation, version view), not the page
  // shown nor Edit component mode: opening a page from a component's template may leave both.
  function loadStamp(): Stamp {
    const held = ports.edits.stamp();
    const changed = () => { const key = held.changed(); return key === "route" || key === "edit-mode" ? undefined : key; };
    return { changed, holds: () => !changed() };
  }
  // What B, I and Link do for the current selection, for the keyboard shortcuts.
  let nativeFormatActions: Partial<Record<NativeFormat, () => void>> = {};

  // The edit bar last shown, whose controls the command palette offers while it shows.
  let nativeEditBarModel: EditBarModel | undefined;
  // Delete on a Structure row: the row's element is selected, and the bar drawn for it runs its Remove (soon, or never).
  let rowRemoval: { path: string; node: number[]; source: string; since: Stamp; until: number } | undefined;

  // A link just made from the bar around selected text (`node` is the text
  // element, `link` the new link's index path): its Address opens at once
  // (`shown` once asked), and closing it with the address still empty takes
  // the link away again. The wrap and what is typed are one undo step.
  let nativeNewLink: { path: string; node: number[]; link: number[]; text: { start: number; end: number }; shown?: boolean } | undefined;

  let nativeElementMoveAction: EditBarModel["onMove"];

  // One native field keeps the bytes, the workspace (a stamp) and the editor
  // model from when its popover opened, then the bytes and model it last wrote. The edit bar may replace a
  // live callback while retaining that same input node.
  let nativeAttributeFieldSession: { key: string; path: string; source: string; since: Stamp; model: { isCurrent(): boolean } } | undefined;

  // Ask agent's element description (src/agent-site.ts, lazy with the rest of
  // the editor's agent code) loads once an agent is connected and the bar
  // offers it. After a failed load it is tried again only on a send.
  let agentSite: typeof import("../agent-site") | undefined;
  let agentSiteLoad: Promise<typeof import("../agent-site") | undefined> | undefined;
  let agentSiteFailed = false;
  function loadAgentSite(explicit = false) {
    if (agentSiteFailed && !explicit) return Promise.resolve(undefined);
    agentSiteFailed = false;
    return agentSiteLoad ??= import("../agent-site").then((module) => agentSite = module)
      .catch((error) => { agentSiteLoad = undefined; agentSiteFailed = true; void handleChunkLoadFailure(error); return undefined; });
  }

  // Controls for the selected element. Structural actions need the element's
  // exact outer source range; when that cannot be told (implied end tags,
  // stray markup) they stay out rather than edit the wrong HTML.
  function renderNativeEditBar(selection: NativePreviewSelection) {
    nativeElementMoveAction = undefined;
    nativeEditBarModel = undefined;
    const preview = ports.nativePreview;
    const editor = ports.editorModule;
    const { path, node, rect } = selection;
    // The page's `main` container has nothing the bar can do; it stays out of the way.
    if (!preview || !editor || !path || !rect || ports.appStore.openFile.value !== path || !editor.isMounted(path) || selection.tag === "main" && ports.componentTools?.editModeTemplate()?.path !== path) {
      nativeFormatActions = {};
      rowRemoval = undefined;
      preview?.hideEditBar();
      ports.componentTools?.show(undefined);
      return;
    }
    const source = ports.nativeEditableSource(path) ?? "";
    const range = node ? ports.locateNativeElementRange(source, node) : undefined;
    // Decoded as the browser reads it, so the bar names it as the page structure does.
    const classValue = range ? ports.startTagAttribute(source, range.tag, "class")?.value : undefined;
    const className = classValue === undefined ? undefined : decodeHtmlEntities(classValue, true);
    const kind = nativeElementLabel(selection.tag, Boolean(ports.nativeSite && Object.hasOwn(ports.nativeSite.components, selection.tag)), className);
    // A new link whose Address never opened (the selection moved on first) keeps its empty href; its undo group ends.
    if (nativeNewLink && !nativeNewLink.shown && (nativeNewLink.path !== path || nativeNewLink.node.join(".") !== node?.join("."))) {
      editor.closeActiveEditGroup(nativeNewLink.path);
      nativeNewLink = undefined;
    }
    const announce = (text: string) => { ports.element("status").textContent = text; };
    const change = (edits: { start: number; end: number; text: string }[], next: number[] | undefined, message: string) => {
      return applyNativeChange(path, source, edits, next, message);
    };
    const controls: EditBarControl[] = [];
    if (range && node && ports.nativeSite) {
      if (selection.tag === "site-header" || selection.tag === "header" || selection.tag === "nav")
        controls.push({ kind: "button", label: "Navigation", onPress: () => void ports.openNativeNavigation(path) });
    }
    nativeFormatActions = {};
    if (/^h[1-6]$/.test(selection.tag) && range?.close && range.tag.name === selection.tag) {
      const close = range.close;
      const length = range.tag.name.length;
      controls.push({
        kind: "select",
        label: "Heading level",
        options: [1, 2, 3, 4, 5, 6].map((level) => ({ label: `H${level}`, value: `h${level}` })),
        value: selection.tag,
        onChange: (value) => change([
          { start: range.tag.start + 1, end: range.tag.nameEnd, text: value },
          { start: close.start + 2, end: close.start + 2 + length, text: value },
        ], node, `Heading level ${value.toUpperCase()}`),
      });
    }
    if (range && node) {
      const layout = blockLayout(source, range.tag);
      if (layout) controls.push({
        kind: "select", label: "Layout", caption: true,
        options: [{ label: "Stack", value: "flow" }, { label: "Grid", value: "cards" }],
        value: layout,
        onChange: (value) => {
          const edit = blockLayoutEdit(source, range.tag, value);
          if (edit) change([edit], node, `Layout: ${value === "cards" ? "Grid" : "Stack"}`);
        },
      });
    }
    // Text size is for elements that carry text themselves, not page containers or components.
    const containers = new Set(["main", "section", "header", "footer", "nav", "article", "aside", "slot"]);
    const textual = range?.close && !selection.tag.includes("-") && !containers.has(selection.tag);
    if (range && textual && ports.nativeSite) {
      // The site's own sizes (classes, else variables) when its stylesheets define them (`src/native-text-size.ts`).
      const sources = ports.nativeSources();
      const scale = textSizeScale(ports.nativePageStyles().map((sheet) => sources[sheet] ?? ""));
      const value = currentTextSize(source, range.tag, scale);
      const options = [{ label: "Default", value: "default" }, ...scale.sizes.map((size) => ({ label: size.label, value: size.value }))];
      if (value === "custom") options.push({ label: "Custom", value: "custom" });
      controls.push({
        kind: "select",
        label: "Text size",
        options,
        value,
        onChange: (next) => {
          const edit = textSizeEdit(source, range.tag, scale, next);
          const size = scale.sizes.find((item) => item.value === next);
          if (edit) change([edit], node, size ? `Text size ${size.label}` : "Default text size");
        },
      });
    }
    // Component instance, Button block and page band variants (src/page-builder/components.ts).
    if (ports.componentTools) controls.push(...ports.componentTools.variantControls(selection));
    // The link the selected text sits in, inside the selected text element.
    let textLink: { node: number[]; text: NativeTextSelection } | undefined;
    if (range?.close && ports.nativeTextTags.has(selection.tag)) {
      const close = range.close;
      const inner = source.slice(range.tag.end, close.start);
      const bound = ports.previewSelection.textSelection();
      const reported = bound && bound.path === path && node &&
        bound.node.join(".") === node.join(".") ? bound : undefined;
      // The caret (reported only inside a link) is no text to format.
      const text = reported?.caret ? undefined : reported;
      const caret = reported?.caret ? reported : undefined;
      for (const format of [
        { label: "B", name: "Bold", tag: "strong" as const, also: ["strong", "b"] },
        { label: "I", name: "Italic", tag: "em" as const, also: ["em", "i"] },
      ]) {
        // Offsets inside `inner` to insert or delete, keeping the same text selected.
        const changeInner = (edits: { start: number; end: number; text: string }[], message: string) => {
          if (text) preview.selectTextAfterUpdate({ start: text.start, end: text.end });
          change(edits.map((edit) => ({ ...edit, start: range.tag.end + edit.start, end: range.tag.end + edit.end })), node, message);
        };
        let pressed: boolean;
        let action: () => void;
        if (text) {
          // Selected text: wrap just that range, or unwrap the wrapper it sits in.
          const enclosing = text.wrappers.find((name) => format.also.includes(name));
          pressed = Boolean(enclosing);
          action = () => {
            if (enclosing) {
              const wrapper = ports.wrapperAround(inner, text.start, format.also);
              if (!wrapper?.close) { refuse(`${format.name} could not be removed here.`); return; }
              changeInner([
                { start: wrapper.tag.start, end: wrapper.tag.end, text: "" },
                { start: wrapper.close.start, end: wrapper.close.end, text: "" },
              ], `${format.name} off`);
              return;
            }
            const span = ports.textRangeInSource(inner, text.start, text.end, text.text);
            if (!span) { refuse(`Select text within one element to make it ${format.name.toLowerCase()}.`); return; }
            changeInner([
              { start: span.start, end: span.start, text: `<${format.tag}>` },
              { start: span.end, end: span.end, text: `</${format.tag}>` },
            ], `${format.name} on`);
          };
        } else {
          // No text selected: the whole element's content.
          const wrapper = ports.wholeWrapper(inner, format.also);
          pressed = Boolean(wrapper);
          action = () => wrapper
            ? changeInner([
              { start: wrapper.open, end: wrapper.openEnd, text: "" },
              { start: wrapper.closeAt, end: wrapper.closeEnd, text: "" },
            ], `${format.name} off`)
            : changeInner([
              { start: 0, end: 0, text: `<${format.tag}>` },
              { start: inner.length, end: inner.length, text: `</${format.tag}>` },
            ], `${format.name} on`);
        }
        nativeFormatActions[format.tag] = action;
        controls.push({
          kind: "button",
          label: format.label,
          ariaLabel: format.name,
          title: `${format.name} (Ctrl+${format.label})`,
          pressed,
          className: `edit-bar__format edit-bar__format--${format.tag}`,
          onPress: action,
        });
      }
      // Link: selected text in a text element that is not in a link already is
      // wrapped in `<a href="">` (the Address then opens for it); selected text
      // inside a link gets that link's Address and Remove link below.
      if (node && selection.link === undefined && ports.nativeLinkParents.has(selection.tag)) {
        const span = text ? ports.textRangeInSource(inner, text.start, text.end, text.text) : undefined;
        const around = text && span ? ports.wrapperAround(inner, text.start, ["a"]) : undefined;
        const inLink = around?.close && span && span.start >= around.tag.end && span.end <= around.close.start ? around : undefined;
        // The caret in a link: the link on either side of it.
        const caretLink = caret ? ports.wrapperAround(inner, caret.start, ["a"]) ?? (caret.start > 0 ? ports.wrapperAround(inner, caret.start - 1, ["a"]) : undefined) : undefined;
        const found = inLink ?? caretLink;
        const at = found ? ports.elementPathAt(inner, found.tag.start) : undefined;
        if ((text || caret) && at) {
          textLink = { node: [...node, ...at], text: (text ?? caret)! };
        } else if (text) {
          const wrap = linkWrapEdit(inner, text.start, text.end, text.text);
          const linkIt = () => {
            if (!("edit" in wrap)) {
              refuse(wrap.refused === "nested" ? "The selection already holds a link." : "Select text within one element to link it.");
              return;
            }
            const next = inner.slice(0, wrap.edit.start) + wrap.edit.text + inner.slice(wrap.edit.end);
            const within = ports.elementPathAt(next, wrap.link);
            if (!within) { refuse("Select text within one element to link it."); return; }
            const start = range.tag.end + wrap.edit.start;
            const end = range.tag.end + wrap.edit.end;
            // One undo group from the wrap through the address typed for it.
            nativeNewLink = { path, node, link: [...node, ...within], text: { start: text.start, end: text.end } };
            preview.selectTextAfterUpdate({ start: text.start, end: text.end });
            preview.selectAfterUpdate({ path, node });
            try {
              editor.closeActiveEditGroup(path);
              editor.replaceActiveRange({ path, start, end, text: wrap.edit.text, expected: source.slice(start, end) }, true);
              announce("Link added");
            } catch (error) {
              nativeNewLink = undefined;
              preview.selectAfterUpdate(undefined);
              preview.selectTextAfterUpdate(undefined);
              ports.errorMessage(error);
            }
          };
          nativeFormatActions.link = linkIt;
          // No button where it cannot apply (a span cutting through a tag, or
          // holding a link); Ctrl/⌘+K there says why.
          if ("edit" in wrap) controls.push({ kind: "button", icon: "link", label: "Link", title: "Link (Ctrl+K)", onPress: linkIt });
        } else {
          nativeFormatActions.link = () => refuse("Select the text to link first.");
        }
      }
    }
    // Edits sorted by position, as one undo step.
    const ordered = (edits: { start: number; end: number; text: string }[]) => [...edits].sort((a, b) => a.start - b.start);
    const attribute = (name: string) => (range ? ports.startTagAttribute(source, range.tag, name) : undefined);
    // Links: the selected link, or the nearest link around the selection in
    // this file, takes an address as it is typed: a page of the site picked
    // from the suggestions, or any address. Each keystroke rewrites the href
    // from the source as it is now, in one undo step until the field closes.
    // (Ctrl/⌘+click in the preview follows a link.)
    // A live edit from an address field: each keystroke rewrites attributes on
    // the element at `target` (found again in the source as it is now), grouped
    // into one undo step until the field closes.
    const live = (target: number[], tagName: string, build: (latest: string, tag: StartTag) => { start: number; end: number; text: string }[], message: string) => {
      if (!node) return;
      const latest = ports.nativeEditableSource(path) ?? "";
      const tag = ports.locateNativeElementRange(latest, target)?.tag;
      if (!tag || tag.name !== tagName) { refuse("The element could not be found in the source."); return; }
      preview.selectAfterUpdate({ path, node });
      try {
        // Later edits first, so earlier offsets stay valid.
        const built = ordered(build(latest, tag));
        for (const edit of built.reverse())
          editor.replaceActiveRange({ path, ...edit, expected: latest.slice(edit.start, edit.end) }, true);
        announce(message);
      } catch (error) {
        preview.selectAfterUpdate(undefined);
        ports.errorMessage(error);
      }
    };
    const textLinkRange = textLink ? ports.locateNativeElementRange(source, textLink.node) : undefined;
    const link = selection.link !== undefined && node ? ports.nearestLink(source, node, range)
      : textLink && textLinkRange?.tag.name === "a" ? { range: textLinkRange, node: textLink.node } : undefined;
    if (link && node && ports.nativeSite) {
      const href = ports.startTagAttribute(source, link.range.tag, "href");
      const current = href?.value.trim() ?? "";
      const site = ports.nativeSite;
      // The link just made: its Address opens now, once.
      const fresh = nativeNewLink && nativeNewLink.path === path && nativeNewLink.link.join(".") === link.node.join(".") ? nativeNewLink : undefined;
      const open = Boolean(fresh && !fresh.shown);
      if (fresh) fresh.shown = true;
      // Text selected in the link stays selected while the address is typed.
      const keepText = textLink?.text;
      controls.push({
        kind: "address",
        icon: "link",
        label: "Address",
        warning: current ? undefined : "No address",
        value: href?.value ?? "",
        placeholder: "Page or web address",
        suggestions: nativeLinkSuggestions(Object.keys(site.routes), (route) => ports.nativeRouteInfo(route).title),
        open,
        // Beside the address: a new tab (target and rel) and an optional title.
        extras: [
          { kind: "checkbox", label: "Open in new tab", checked: opensInNewTab(source, link.range.tag), onChange: (on) => {
            if (keepText) preview.selectTextAfterUpdate({ start: keepText.start, end: keepText.end });
            live(link.node, "a", (latest, tag) => [newTabEdit(latest, tag, on)], on ? "Link opens in a new tab" : "Link opens in the same tab");
          } },
          { kind: "text", label: "Title (optional)", value: ports.startTagAttribute(source, link.range.tag, "title")?.value ?? "", placeholder: "Shown when the pointer rests on the link", onInput: (value) => {
            if (keepText) preview.selectTextAfterUpdate({ start: keepText.start, end: keepText.end });
            live(link.node, "a", (latest, tag) => [setAttributeEdit(latest, tag, "title", value || undefined)], value ? "Link title changed" : "Link title removed");
          } },
        ],
        onInput: (value) => {
          if (keepText) preview.selectTextAfterUpdate({ start: keepText.start, end: keepText.end });
          live(link.node, "a", (latest, tag) => [setAttributeEdit(latest, tag, "href", value)], "Link changed");
        },
        onClose: () => {
          editor.closeActiveEditGroup(path);
          if (fresh && nativeNewLink === fresh) removeEmptyNewLink(fresh);
        },
      });
      // Remove link: a link inside a text element (the one the selected text
      // sits in, or the selected link itself) loses its tags, keeping its text
      // and formatting, as one undo step.
      const parent = link.node.length > 1 ? ports.locateNativeElementRange(source, link.node.slice(0, -1)) : undefined;
      const unwrap = link.range.tag.name === "a" && parent && ports.nativeLinkParents.has(parent.tag.name) ? unwrapEdits(link.range) : undefined;
      if (unwrap) {
        const inText = Boolean(textLink);
        controls.push({
          kind: "button",
          icon: "unlink",
          label: "Remove link",
          onPress: () => {
            if (inText && keepText) preview.selectTextAfterUpdate({ start: keepText.start, end: keepText.end });
            change(unwrap, inText ? node : link.node.slice(0, -1), "Link removed");
          },
        });
      }
    }
    // Native media and form attributes use the same guarded source controls:
    // each write is a guarded edit from the bytes the field last read or wrote,
    // while typing one undo step per field (`group`).
    if (range && node) {
      const fields = nativeElementFields(source, range.tag);
      const painted = { source, since: ports.edits.stamp(), model: modelNow(path) };
      const writeField = (property: string, value: string, grouped: boolean) => {
        const key = `${path}:${node.join(".")}:${property}`;
        const state = grouped ? nativeAttributeFieldSession : painted.model && { key, path, ...painted, model: painted.model };
        if (!state || state.key !== key || ports.appStore.openFile.value !== path || !editor.isMounted(path)) { refuse(FIELD_STALE); return; }
        const model = state.model;
        let next: string | undefined;
        const outcome = ports.edits.now(r => {
          if (r.source(path) !== state.source) return { refuse: FIELD_STALE };
          const tag = ports.locateNativeElementRange(state.source, node)?.tag;
          if (!tag || tag.name !== range.tag.name) return { refuse: "The selected element changed." };
          const located = locateNativeFieldElement(state.source, tag);
          if ("error" in located) return { refuse: located.error };
          const result = nativeElementAttributeEdits(state.source, located, { [property]: value });
          if ("error" in result) return { refuse: result.error };
          if (!result.edits.length) return NOTHING;
          const edit = result.edits[0];
          next = state.source.slice(0, edit.start) + edit.text + state.source.slice(edit.end);
          const label = fields.find(field => field.property === property)?.label ?? property;
          return { edits: new Map([[path, [edit]]]), select: { after: { path, node } }, done: `${label} changed`, undone: `Undid: ${label} changed` };
        }, { since: state.since, guard: () => model.isCurrent() && stillSelected(path, node)(), anchor: path, ...grouped ? { group: key } : {} });
        if (outcome.ok) {
          // The field goes on from the bytes and the editor model it wrote.
          if (outcome.status === "applied" && next !== undefined) { state.source = painted.source = next; state.model = painted.model = modelNow(path) ?? model; }
          return;
        }
        // The editor would not take the edit: an error, as any failed write.
        if (outcome.reason === "refused" && next !== undefined) ports.errorMessage(new Error(outcome.message));
        else refuse(outcome.reason === "stale" ? FIELD_STALE : outcome.message);
      };
      for (const field of fields) {
        if (field.kind === "choice") controls.push({ kind: "select", label: field.label, value: field.value,
          options: [...(field.options ?? [])], onChange: value => writeField(field.property, value, false) });
        else controls.push({ kind: "address", label: field.label, value: field.value,
          // A button with no name of its own (no text, label, labelledby, title or image alt) is unnamed.
          warning: selection.tag === "button" && field.property === "aria-label" && !field.value.trim() && !selection.text.trim() && !attribute("aria-labelledby")?.value.trim()
            && !attribute("title")?.value.trim() && !(range && ports.nativeNamedDescendant(source, range)) ? "Needs a name" : undefined,
          placeholder: field.kind === "url" ? "Local path or web address" : field.label,
          onOpen: () => { if (painted.model) nativeAttributeFieldSession = { key: `${path}:${node.join(".")}:${field.property}`, path, source: painted.source, since: ports.edits.stamp(), model: painted.model }; },
          onInput: value => writeField(field.property, value, true), onClose: () => {
            editor.closeActiveEditGroup(nativeAttributeFieldSession?.path ?? path);
            nativeAttributeFieldSession = undefined;
          } });
      }
    }
    // Heading levels that skip (H2 to H4): one press puts the heading in order.
    if (range && /^h[2-6]$/.test(selection.tag) && range.close && range.tag.name === selection.tag) {
      const level = Number(selection.tag[1]);
      const previous = previousHeadingLevel(source, range.tag.start);
      if (previous > 0 && level > previous + 1) {
        const close = range.close;
        const fixed = `h${previous + 1}`;
        controls.push({
          kind: "button",
          label: `Use ${fixed.toUpperCase()}`,
          title: `Heading levels skip from H${previous} to H${level}; the next level after H${previous} is H${previous + 1}.`,
          className: "edit-bar__warning",
          onPress: () => change([
            { start: range.tag.start + 1, end: range.tag.nameEnd, text: fixed },
            { start: close.start + 2, end: close.start + 2 + 2, text: fixed },
          ], node, `Heading level ${fixed.toUpperCase()}`),
        });
      }
    }
    // Images use the media chooser and native alternative text.
    if (range && selection.tag === "img") {
      const src = attribute("src");
      const alt = attribute("alt");
      controls.push({ kind: "button", label: "Choose image…", onPress: () => { if (node) void ports.chooseMediaForImage({ path, node, width: selection.rect?.width }); } });
      // Alt text applies as typed; opening with no alt written applies the
      // file's name at once; emptied, the image is decorative (alt="").
      controls.push({
        kind: "address",
        label: "Alt text",
        // No file at all comes first; only an image that shows something needs its alt text.
        warning: !src?.value.trim() && !attribute("srcset")?.value.trim() && !(node && ports.nativePictureSources(source, node)) ? "No image" : alt ? undefined : "Alt text missing",
        value: alt?.value ?? "",
        initial: alt ? undefined : altFromPath(src?.value ?? ""),
        placeholder: "What the image shows; empty for decorative",
        onInput: (value) => { if (node) live(node, "img", (latest, tag) => [setAttributeEdit(latest, tag, "alt", value)], value ? "Alt text updated" : "Image marked decorative"); },
        onClose: () => editor.closeActiveEditGroup(path),
      });
    }
    // Empty links need an accessible name. Buttons expose the native accessible
    // label field above, alongside their separate form submission name.
    if (range && selection.tag === "a" && !selection.text.trim() && !attribute("aria-label")) {
      controls.push({
        kind: "address",
        label: "Name",
        warning: "Needs a name",
        value: "",
        placeholder: `What this ${nativeKindLabel(selection.tag, className).toLowerCase()} does`,
        onInput: (value) => { if (node) live(node, selection.tag, (latest, tag) => [setAttributeEdit(latest, tag, "aria-label", value || undefined)], value ? "Name added" : "Name removed"); },
        onClose: () => editor.closeActiveEditGroup(path),
      });
    }
    if (range?.close && ["section", "nav", "aside"].includes(selection.tag)) {
      const label = attribute("aria-label");
      const hasHeading = /<h[1-6][\s>]/i.test(source.slice(range.tag.end, range.close.start));
      controls.push({
        kind: "address",
        label: "Label",
        warning: !label && !hasHeading ? "No heading or label" : undefined,
        value: label?.value ?? "",
        placeholder: `What this ${nativeKindLabel(selection.tag).toLowerCase()} is about`,
        onInput: (value) => { if (node) live(node, selection.tag, (latest, tag) => [setAttributeEdit(latest, tag, "aria-label", value || undefined)], value ? "Label updated" : "Label removed"); },
        onClose: () => editor.closeActiveEditGroup(path),
      });
    }
    // Whole sections (a <section> or a section component) move and duplicate
    // from icon buttons always in the bar, as one undo step each; Remove is
    // below, for any removable element (slice 81).
    // Alt+Up/Down move any block; Sections keep their proven move path,
    // from the bar, the preview or the page structure (`moveNativeSection`),
    // as do plain Up/Down on the bar's name. Any block of the page's <main>
    // drags by its name in the bar (ticket 12 §10).
    let onMove: EditBarModel["onMove"];
    const templateRoot = ports.componentTools?.isTemplateRoot(selection);
    // In Edit component mode, a part of the template edited (slice 82).
    const editing = ports.componentTools?.editModeTemplate()?.path === path;
    const draggable = Boolean(!templateRoot && node && (editing ? templateMovePath(source, node) : nativeMovableBlock(source, node, ports.itemsSlots())));
    if (!templateRoot && range && node && isNativeSectionTag(selection.tag)) {
      const parent = node.slice(0, -1);
      const index = node[node.length - 1];
      const before = index > 0 ? ports.locateNativeElementRange(source, [...parent, index - 1]) : undefined;
      const after = ports.locateNativeElementRange(source, [...parent, index + 1]);
      // Only the source this selection was painted from moves; a newer one, or another selection, refuses.
      const model = modelNow(path), selected = stillSelected(path, node);
      const offer: SectionMoveOffer | undefined = selection.paintedSource === source
        ? { painted: source, since: ports.edits.stamp(), guard: () => (!model || model.isCurrent()) && selected() } : undefined;
      const move = (direction: "up" | "down") => offer ? moveNativeSection(selection, direction, offer) : (refuse(SECTION_MOVE_STALE), "stayed" as const);
      onMove = move;
      controls.push({
        kind: "button",
        icon: "up",
        label: "Move up",
        disabled: !before,
        onPress: () => move("up"),
      });
      controls.push({
        kind: "button",
        icon: "down",
        label: "Move down",
        disabled: !after,
        onPress: () => move("down"),
      });
      controls.push({
        kind: "button",
        icon: "duplicate",
        label: "Duplicate",
        onPress: () => change([duplicateEdit(source, range)], [...parent, index + 1], `${kind} duplicated`),
      });
    }
    // An item of a card grid, or anything inside one: Duplicate, Remove, Add card, Open page, Select card.
    // Non-Sections have sibling keys, but no move arrow buttons in the bar.
    if (!templateRoot && node && !isNativeSectionTag(selection.tag)) onMove = direction => ports.moveBlock(selection, direction);
    if (!templateRoot && !isNativeSectionTag(selection.tag)) controls.push(...ports.cardControls(selection, source));
    if (range && node) {
      const template = ports.componentTools?.editModeTemplate();
      const chain = ["body", ...node.map((_, depth) => ports.locateNativeElementRange(source, node.slice(0, depth + 1))?.tag.name ?? "")];
      const allowed = selection.paintedSource === source && !selection.host && pageRemovable(chain);
      // A card's own Remove (cards.ts) stays, an items slot's card included.
      if (template?.path === path) controls.push(...(ports.componentTools?.removeControl(selection, kind) ?? []));
      else if (Object.values(ports.nativeSite?.routes ?? {}).includes(path) && allowed && !controls.some(control => control.label === "Remove")) {
        controls.push({ kind: "button", icon: "remove", label: "Remove",
          onPress: () => change([removeEdit(source, range)], selectionAfterRemove(node,
            Boolean(ports.locateNativeElementRange(source, [...node.slice(0, -1), node.at(-1)! + 1]))), `${kind} removed`) });
      }
    }
    nativeElementMoveAction = onMove;
    // Edit component, Make component (src/page-builder/components.ts).
    if (ports.componentTools) controls.push(...ports.componentTools.controls(selection));
    // Ask agent: a request about this element for a connected agent, pinned on it.
    const menu = ports.agentController.captureAsk();
    if (node && menu?.connected() && ports.nativeSite) {
      const site = ports.nativeSite;
      void loadAgentSite();
      controls.push({
        kind: "prompt",
        label: "Ask agent",
        placeholder: "Ask the agent…",
        maxLength: REQUEST_TEXT_LIMIT,
        onSend: async (text) => {
          let module = agentSite;
          if (!module) {
            // Sent before it arrived: the element is told only if the page is still the one asked about.
            const since = ports.edits.stamp(), source = ports.nativeSources()[path];
            module = await loadAgentSite(true);
            if (!module) return "The agent tools could not load. Try again.";
            if (!since.holds() || source !== ports.nativeSources()[path]) return "The page changed meanwhile. Ask again.";
          }
          const about = module.agentElement({ ...selection, route: preview.route() }, site, ports.nativeSources()[path]);
          if (!about) return "This element cannot be pointed out to an agent.";
          try {
            await menu.ask(text, about);
          } catch (error) {
            return (error as Error).message;
          }
          announce("Sent to the agent");
          return undefined;
        },
      });
    }
    const model: EditBarModel = {
      origin: { path, source, revision: `${ports.setupScope()}:${ports.generation}`, node: node?.slice() },
      kind, controls, onFormat: (format) => nativeFormatActions[format]?.(),
      onMove, draggable,
      ...ports.componentTools?.identity(selection),
    };
    nativeEditBarModel = model;
    preview.showEditBar(model, rect, ports.previewSelection.textSelection());
    ports.componentTools?.show(selection);
    const pending = rowRemoval;
    rowRemoval = undefined;
    if (pending && pending.path === path && pending.node.join() === node?.join()
      && pending.source === source && pending.since.holds() && Date.now() < pending.until) {
      const remove = controls.find(control => control.kind === "button" && control.label === "Remove");
      if (remove?.kind === "button" && !remove.disabled) remove.onPress();
    }
  }

  // The Address of a link just made closed with no address: the link goes
  // again, by undoing its undo group (the wrap and anything typed), so the
  // source is as it was before Link and no empty undo step is left behind.
  function removeEmptyNewLink(fresh: NonNullable<typeof nativeNewLink>) {
    nativeNewLink = undefined;
    const editor = ports.editorModule;
    const latest = ports.nativeEditableSource(fresh.path) ?? "";
    const found = ports.locateNativeElementRange(latest, fresh.link);
    if (!editor || found?.tag.name !== "a" || ports.startTagAttribute(latest, found.tag, "href")?.value.trim()) return;
    const selected = ports.appStore.selection.value?.path === fresh.path && ports.appStore.selection.value.node?.join(".") === fresh.node.join(".");
    if (selected) ports.nativePreview?.selectTextAfterUpdate(fresh.text);
    const said = ports.element("status").textContent;
    void editor.runVisualHistory("undo", fresh.path).then((undone) => {
      if (undone) ports.element("status").textContent = "Empty link removed";
      // A reason the history gave stays on screen.
      else if (ports.element("status").textContent === said) refuse("The empty link could not be removed; undo removes it.");
    });
  }

  // `next` is the element to select once the preview has rendered it.
  function applyNativeChange(path: string, source: string, edits: { start: number; end: number; text: string }[], next: number[] | undefined, message: string) {
    const preview = ports.nativePreview;
    const editor = ports.editorModule;
    if (!preview || !editor) return false;

    if (ports.nativeEditableSource(path) !== source) {
      refuse("The source changed. Select the element again and try again.");
      return false;
    }
    preview.selectAfterUpdate(next ? { path, node: next } : undefined);
    try {
      editor.replaceActiveRanges(edits.map((edit) => ({ path, ...edit, expected: source.slice(edit.start, edit.end) })));
      ports.element("status").textContent = message;
      return true;
    } catch (error) {
      preview.selectAfterUpdate(undefined);
      ports.errorMessage(error);
      return false;
    }
  }

  // A whole section: a <section>, or a component whose template is one. A
  // plan passes its `r`, so the template it reads is proved with the move.
  function isNativeSectionTag(tag: string, reads: Reads = ports.edits.peek) {
    return tag === "section" || (tag.includes("-") && isSectionTemplate(reads.template(tag)?.source ?? ""));
  }

  // The plan of a section move one sibling position from the bytes painted
  // for it: `verdict` says what came of it ("stayed" at the first or last
  // position, undefined when the section cannot move this way).
  function sectionMovePlan(r: Reads, target: { path: string; node: number[]; tag: string }, direction: "up" | "down", painted: string, stale: string) {
    const outcome: { verdict?: "moved" | "stayed"; plan: Planned | { refuse: string } } = { plan: NOTHING };
    if (r.source(target.path) !== painted) { outcome.verdict = "stayed"; outcome.plan = { refuse: stale }; return outcome; }
    if (!isNativeSectionTag(target.tag, r)) return outcome;
    // The editor's one move engine (nativeMoveEdit), as Alt+Up/Down on any block and drags use.
    const plan = nativeElementSiblingMove(painted, target.node, direction, ports.itemsSlots());
    if (plan.status !== "moved") { if (plan.status === "stayed") outcome.verdict = "stayed"; return outcome; }
    const done = direction === "up" ? "Moved up" : "Moved down";
    outcome.verdict = "moved";
    outcome.plan = { edits: new Map([[target.path, [plan.edit]]]), select: { after: { path: target.path, node: plan.selection } }, done, undone: `Undid: ${done}` };
    return outcome;
  }

  // Moves a whole section one sibling position, as one undo step, keeping it
  // selected: the Move up/down buttons and Alt+Up/Down from the bar, the
  // preview and the page structure all come here. "stayed" at the first or
  // last position or when the offer is stale (said); nothing for anything but
  // a section, when the page is not the mounted file, or when the edit could
  // not be made.
  function moveNativeSection(target: { path: string; node?: number[]; tag: string }, direction: "up" | "down", offer: SectionMoveOffer): "moved" | "stayed" | undefined {
    const { path, node } = target;
    if (!path || !node?.length || ports.appStore.openFile.value !== path || !ports.editorModule?.isMounted(path) || !isNativeSectionTag(target.tag)) return undefined;
    let move: ReturnType<typeof sectionMovePlan> | undefined;
    const outcome = ports.edits.now(r => (move = sectionMovePlan(r, { path, node, tag: target.tag }, direction, offer.painted, SECTION_MOVE_STALE)).plan,
      { since: offer.since, guard: offer.guard, anchor: path });
    if (outcome.ok) return move?.verdict;
    if (outcome.reason === "stale") { refuse(SECTION_MOVE_STALE); return "stayed"; }
    // A refusal the plan made is said; one the editor made is an error, as any failed write.
    if (move?.verdict === "moved") { ports.errorMessage(new Error(outcome.message)); return undefined; }
    refuse(outcome.message);
    return move?.verdict;
  }

  // Alt+Up/Down on a page structure row while another file is open (a
  // component chosen in the preview, a file from the explorer): the page
  // file opens first (the guarded edit's anchor; it does not mount once the
  // painted bytes changed), as an insert does, then the section moves. A move
  // that still cannot be made is said so rather than passed off as the end of
  // the list.
  async function moveNativeSectionAfterOpening(target: { path: string; node: number[]; tag: string }, direction: "up" | "down", paintedSource: string) {
    const draft = ports.draftScope();
    // A kept model of the page, forgotten when the open is refused: it holds bytes older than the draft's.
    const cachedModel = draft ? ports.editorModule?.captureFileModelState(draft, target.path, true) : undefined;
    let move: ReturnType<typeof sectionMovePlan> | undefined;
    const outcome = await ports.edits.run(r => (move = sectionMovePlan(r, target, direction, paintedSource, SECTION_OPEN_STALE)).plan,
      { since: loadStamp(), anchor: target.path, guard: () => ports.nativeEffectiveSource(target.path) === paintedSource, openOnlyIfCurrent: true });
    if (outcome.ok) { if (outcome.status === "applied" || move?.verdict === "stayed") return; refuse("The section could not be moved"); return; }
    if (outcome.reason === "stale" && (outcome.changed === "scope" || outcome.changed === "generation")) return;
    if (outcome.reason === "stale" || outcome.message === SECTION_OPEN_STALE) {
      if (draft && ports.nativeEffectiveSource(target.path) !== paintedSource && cachedModel?.isCurrent() && !ports.editorModule?.isMounted(target.path)) ports.editorModule?.forgetDraftModel(draft, target.path);
      ports.updateNativePreviewSources();
      refuse(SECTION_OPEN_STALE); return;
    }
    if (move?.verdict === "moved") ports.errorMessage(new Error(outcome.message));
    refuse("The section could not be moved");
  }

  // Moves a whole section to another gap among its siblings (`index` counted
  // as the insert points are: before the sibling at that index, or the count
  // for the end), as one undo step, keeping it selected: a drag in the page
  // structure or the canvas ends here. "stayed" when the gap is the one the
  // section already fills (announced, nothing recorded); nothing for another
  // parent, for anything but a section, or when the move cannot be made. MCP
  // move_section comes here; it moves by the editor's one move engine
  // (nativeMoveEdit), as drags and Alt+Up/Down do.
  function moveNativeSectionTo(target: { path: string; node?: number[]; tag: string }, parent: number[], index: number): "moved" | "stayed" | undefined {
    const { path, node } = target;
    if (!path || !node?.length || ports.appStore.openFile.value !== path || !ports.editorModule?.isMounted(path) || !isNativeSectionTag(target.tag)) return undefined;
    let verdict: "moved" | "stayed" | undefined;
    const outcome = ports.edits.now(r => {
      const source = r.source(path) ?? "";
      if (!isNativeSectionTag(target.tag, r)) return NOTHING;
      const plan = nativeSectionMovePlan(source, node, parent, index, ports.itemsSlots());
      if (plan.status === "stayed") { verdict = "stayed"; return { stayed: "Section stayed in place" }; }
      if (plan.status !== "moved") return NOTHING;
      verdict = "moved";
      return { edits: new Map([[path, [plan.edit]]]), select: { after: { path, node: plan.selection } }, done: "Section moved", undone: "Undid moving the section" };
    }, { anchor: path });
    if (outcome.ok) return verdict;
    ports.errorMessage(new Error(outcome.message));
    return undefined;
  }

  // Writes text typed into a preview element into its source, as one undo
  // step: only the changed stretch of text is replaced, so formatting around
  // it stays. A change that cannot be placed exactly (it crosses a tag) is
  // dropped and the preview shows the source again.
  // The edit goes into the page's draft (the source editor's store) at once,
  // Monaco or not. Text edits apply one at a time, in the order they were
  // typed: while the page's file is still being read, a later commit (A→AB,
  // then AB→ABC) waits for the earlier one instead of racing it.
  let nativeTextEditQueue: Promise<void> = Promise.resolve();

  function applyNativeTextEdit(edit: NativeTextEdit) {
    const run = prepareNativeTextEdit(edit);
    if (!run) return Promise.resolve();
    const next = nativeTextEditQueue.then(run, run);
    nativeTextEditQueue = next.catch(() => {});
    return next;
  }

  // The source edit for text typed in the preview: only the changed stretch,
  // placed inside the element's own content. Undefined when it cannot be placed.
  function nativeTextSourceEdit(source: string, node: NativeTextEdit["node"], before: string, after: string) {
    const range = ports.locateNativeElementRange(source, node);
    // Common prefix and suffix; the rest of `before` becomes the rest of `after`.
    let start = 0;
    while (start < before.length && start < after.length && before[start] === after[start]) start++;
    let endBefore = before.length;
    let endAfter = after.length;
    while (endBefore > start && endAfter > start && before[endBefore - 1] === after[endAfter - 1]) {
      endBefore--;
      endAfter--;
    }
    // A pure insertion takes one neighbouring character along, so the source
    // range is never empty and lands beside that character.
    if (endBefore === start) {
      if (start > 0) start--;
      else { endBefore++; endAfter++; }
    }
    const inner = range?.close ? source.slice(range.tag.end, range.close.start) : undefined;
    const span = inner !== undefined ? ports.textRangeInSource(inner, start, endBefore, before.slice(start, endBefore)) : undefined;
    if (!range || !span) return undefined;
    // Typed spaces arrive as no-break spaces where the browser needs them to stay visible.
    const text = after.slice(start, endAfter).replace(/\u00a0/g, " ")
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    return { start: range.tag.end + span.start, end: range.tag.end + span.end, text };
  }

  function prepareNativeTextEdit({ path, node, before, after }: NativeTextEdit) {
    if (!ports.nativePreview) return undefined;
    // The workspace when the text was committed: the same account, repository, branch and load.
    const opening = loadStamp();
    const sameLoad = () => { const moved = opening.changed(); return moved !== "scope" && moved !== "generation"; };
    const allowed = () => sameLoad() && (path === ports.nativeSite?.routes[ports.nativePreview?.route() ?? ""] || path === ports.nativeEditableTemplatePath());
    if (!allowed()) {
      refuse("Edit the page instance in Structure, or choose Edit for its shared template.");
      ports.updateNativePreviewSources();
      return undefined;
    }
    // The text change as one guarded edit of `path`'s bytes now; `select`: the element after it.
    const textPlan = (done: string, undone: string, select: boolean) => (r: Reads): PlanResult => {
      const source = r.source(path);
      const edit = source === undefined ? undefined : nativeTextSourceEdit(source, node, before, after);
      if (!edit) return { refuse: TEXT_UNPLACED };
      return { edits: new Map([[path, [edit]]]), ...select ? { select: { after: { path, node } } } : {}, done, undone };
    };
    // A page's text committed before its file was mounted, whose page was then
    // left (another page opened): it goes into that page's draft as one
    // operation rather than being lost. Same account, repository and branch
    // only.
    const page = Boolean(ports.nativeSite && Object.values(ports.nativeSite.routes).includes(path));
    const draftLeftPage = async () => {
      if (!page || ports.versionView || !sameLoad()) return;
      // Back on the page meanwhile: the edit goes in there.
      if (ports.appStore.openFile.value === path && ports.editorModule.isMounted(path) && allowed()) { applyInEditor(); return; }
      // The step is the open file's, as it is mounted now; the left page is not opened again, nor selected.
      const open = ports.appStore.openFile.value;
      if (open === undefined || !ports.editorModule.isMounted(open)) { ports.errorMessage(new Error("Open a page before changing these files.")); return; }
      const label = ports.nativePageLabelOf(path);
      const outcome = await ports.edits.run(textPlan(`Text changed on ${label}.`, `Undid the text change on ${label}.`, false));
      if (!outcome.ok) ports.errorMessage(new Error(outcome.message));
    };
    return async () => {
    // The click that selected the element may still be opening its file.
    for (let waited = 0; ports.appStore.openFile.value === path && !ports.editorModule?.isMounted(path) && waited < 10_000 && allowed(); waited += 50)
      await new Promise((done) => setTimeout(done, 50));
    if (!allowed()) { await draftLeftPage(); return; }
    if (ports.appStore.openFile.value !== path || !ports.editorModule?.isMounted(path)) {
      await ports.restoreFile(path, ports.generation, { linkDefaultStyle: false, beforeMount: allowed });
      if (sameLoad() && !allowed()) { await draftLeftPage(); return; }
      if (!sameLoad() || ports.appStore.openFile.value !== path || !ports.editorModule?.isMounted(path) || !allowed()) return;
    }
    applyInEditor();
    };
    function applyInEditor() {
    const preview = ports.nativePreview;
    if (!preview || !allowed() || ports.appStore.openFile.value !== path || !ports.editorModule?.isMounted(path)) return;
    const outcome = ports.edits.now(textPlan("Text changed", "Undid the text change", true), { anchor: path });
    if (outcome.ok) return;
    preview.refresh();
    ports.errorMessage(new Error(outcome.message));
    }
  }

  return {
    renderEditBar: renderNativeEditBar,
    moveSection: moveNativeSection,
    moveSectionTo: moveNativeSectionTo,
    renderNativeEditBar,
    removeEmptyNewLink,
    applyNativeChange,
    isNativeSectionTag,
    moveNativeSection,
    moveNativeSectionAfterOpening,
    moveNativeSectionTo,
    applyNativeTextEdit,
    textEdits: () => nativeTextEditQueue,
    nativeTextSourceEdit,
    prepareNativeTextEdit,
    get nativeFormatActions() { return nativeFormatActions; },
    removeRow(path: string, node: number[], source: string | undefined) {
      if (source === undefined || ports.nativeEffectiveSource(path) !== source || !ports.nativePreview) return false;
      const chain = ["body", ...node.map((_, depth) => ports.locateNativeElementRange(source, node.slice(0, depth + 1))?.tag.name ?? "")];
      const template = ports.componentTools?.editModeTemplate();
      if (template?.path === path) {
        const target: NativePreviewSelection = { path, node, tag: chain.at(-1)!, text: "", reason: "click", selectors: [], paintedSource: source };
        if (!ports.componentTools?.removeControl(target, "Element").length) return false;
        // On a page the bar drawn for the row decides (a card's own Remove, an items slot's card included).
      } else if (!Object.values(ports.nativeSite?.routes ?? {}).includes(path)) return false;
      rowRemoval = { path, node: [...node], source, since: ports.edits.stamp(), until: Date.now() + 2000 };
      ports.nativePreview?.selectNode({ path, node }, false);
      return true;
    },
    get nativeEditBarModel() { return nativeEditBarModel; },
    get nativeElementMoveAction() { return nativeElementMoveAction; },
    set nativeElementMoveAction(value: typeof nativeElementMoveAction) { nativeElementMoveAction = value; },
  };
}

export type PageStructureController = ReturnType<typeof createPageStructureController>;
