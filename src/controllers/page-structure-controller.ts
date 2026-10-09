import { type NativePreviewSelection, type NativeTextSelection, type NativeTextEdit, type NativeFormat, type createNativePreview } from "../components/native-preview";
import { nativeElementLabel, linkWrapEdit, opensInNewTab, newTabEdit, setAttributeEdit, unwrapEdits, previousHeadingLevel, altFromPath, nativeKindLabel, duplicateEdit, removeEdit, swapEdits, moveEdit } from "../native-structure";
import { type EditBarControl, type EditBarModel } from "../components/edit-bar";
import { textSizeScale, currentTextSize, textSizeEdit } from "../native-text-size";
import { type StartTag, type ElementRange } from "../native-source-location";
import { nativeLinkSuggestions } from "../native-pages";
import { nativeElementFields, locateNativeFieldElement, nativeElementAttributeEdits } from "../page-builder/native-element-fields";
import { blockLayout, blockLayoutEdit } from "../page-builder/block-fields";
import { decodeHtmlEntities } from "../page-builder/html-entities";
import { REQUEST_TEXT_LIMIT } from "../../shared/agent";
import { agentElement } from "../agent-site";
import { isSectionTemplate } from "../native-insert";
import { type ComponentTools } from "../page-builder/components";
import { type createAgentController } from "../controllers/agent-controller";
import { type createPageStructure } from "../components/page-structure";
import { type NativeSite } from "../../shared/native-project";
import type * as sourceEditor from "../components/source-editor";
import type { PreviewSelectionController } from "./preview-selection-controller";

/** Workspace values are live host getters; operations and parsers stay injected. */
export interface PageStructurePorts {
  readonly nativePreview: Pick<ReturnType<typeof createNativePreview>, "selectNode" | "route" | "selectTextAfterUpdate" | "selectAfterUpdate" | "refresh" | "showEditBar" | "hideEditBar"> | undefined;
  readonly editorModule: Pick<typeof sourceEditor, "captureFileModelState" | "closeActiveEditGroup" | "isMounted" | "replaceActiveRange" | "replaceActiveRanges" | "runVisualHistory" | "forgetDraftModel">;
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
}

export function createPageStructureController(ports: PageStructurePorts) {
  // What B, I and Link do for the current selection, for the keyboard shortcuts.
  let nativeFormatActions: Partial<Record<NativeFormat, () => void>> = {};

  // The edit bar last shown, whose controls the command palette offers while it shows.
  let nativeEditBarModel: EditBarModel | undefined;

  // A link just made from the bar around selected text (`node` is the text
  // element, `link` the new link's index path): its Address opens at once
  // (`shown` once asked), and closing it with the address still empty takes
  // the link away again. The wrap and what is typed are one undo step.
  let nativeNewLink: { path: string; node: number[]; link: number[]; text: { start: number; end: number }; shown?: boolean } | undefined;

  let nativeElementMoveAction: EditBarModel["onMove"];

  // One native field keeps the snapshot captured when its popover opened. The
  // edit bar may replace a live callback while retaining that same input node.
  let nativeAttributeFieldSession: { key: string; path: string; source: string; model: { isCurrent(): boolean }; epoch: number; scope: string } | undefined;

  // Controls for the selected element. Structural actions need the element's
  // exact outer source range; when that cannot be told (implied end tags,
  // stray markup) they stay out rather than edit the wrong HTML.
  function renderNativeEditBar(selection: NativePreviewSelection) {
    nativeElementMoveAction = undefined;
    const preview = ports.nativePreview;
    const editor = ports.editorModule;
    const { path, node, rect } = selection;
    // The page's `main` container has nothing the bar can do; it stays out of the way.
    if (!preview || !editor || !path || !rect || ports.appStore.openFile.value !== path || !editor.isMounted(path) || selection.tag === "main") {
      nativeFormatActions = {};
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
    // Component instance and Button block variants (src/page-builder/components.ts).
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
              if (!wrapper?.close) { announce(`${format.name} could not be removed here.`); return; }
              changeInner([
                { start: wrapper.tag.start, end: wrapper.tag.end, text: "" },
                { start: wrapper.close.start, end: wrapper.close.end, text: "" },
              ], `${format.name} off`);
              return;
            }
            const span = ports.textRangeInSource(inner, text.start, text.end, text.text);
            if (!span) { announce(`Select text within one element to make it ${format.name.toLowerCase()}.`); return; }
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
              announce(wrap.refused === "nested" ? "The selection already holds a link." : "Select text within one element to link it.");
              return;
            }
            const next = inner.slice(0, wrap.edit.start) + wrap.edit.text + inner.slice(wrap.edit.end);
            const within = ports.elementPathAt(next, wrap.link);
            if (!within) { announce("Select text within one element to link it."); return; }
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
          nativeFormatActions.link = () => announce("Select the text to link first.");
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
      if (!tag || tag.name !== tagName) { announce("The element could not be found in the source."); return; }
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
    // Native media and form attributes use the same guarded source controls.
    if (range && node) {
      const fields = nativeElementFields(source, range.tag);
      const scope = ports.draftScope(), epoch = ports.generation, scopeKey = ports.setupScope();
      let expectedSource = source;
      let model = scope && editor.captureFileModelState(scope, path);
      const writeField = (property: string, value: string, grouped: boolean) => {
        const key = `${path}:${node.join(".")}:${property}`;
        const state = grouped ? nativeAttributeFieldSession : model && { key, path, source: expectedSource, model, epoch, scope: scopeKey };
        if (!scope || !state || state.key !== key || !state.model.isCurrent() || ports.generation !== state.epoch || ports.setupScope() !== state.scope || ports.versionView ||
            ports.appStore.selection.value?.path !== path || ports.appStore.selection.value.node?.join(".") !== node.join(".") || ports.nativeEffectiveSource(path) !== state.source) {
          announce("The source or selection changed. Select the element again before editing its fields."); return;
        }
        const tag = ports.locateNativeElementRange(state.source, node)?.tag;
        if (!tag || tag.name !== range.tag.name) { announce("The selected element changed."); return; }
        const located = locateNativeFieldElement(state.source, tag);
        if ("error" in located) { announce(located.error); return; }
        const result = nativeElementAttributeEdits(state.source, located, { [property]: value });
        if ("error" in result) { announce(result.error); return; }
        if (!result.edits.length) return;
        const edit = result.edits[0];
        const next = state.source.slice(0, edit.start) + edit.text + state.source.slice(edit.end);
        preview.selectAfterUpdate({ path, node });
        try {
          editor.replaceActiveRange({ path, ...edit, expected: state.source.slice(edit.start, edit.end) }, grouped);
          if (ports.generation !== epoch || ports.setupScope() !== scopeKey || ports.nativeEffectiveSource(path) !== next) throw new Error("The source changed while applying this field.");
          expectedSource = next;
          model = editor.captureFileModelState(scope, path);
          state.source = next;
          state.model = model;
          announce(`${fields.find(field => field.property === property)?.label ?? property} changed`);
        } catch (error) { preview.selectAfterUpdate(undefined); ports.errorMessage(error); }
      };
      for (const field of fields) {
        if (field.kind === "choice") controls.push({ kind: "select", label: field.label, value: field.value,
          options: [...(field.options ?? [])], onChange: value => writeField(field.property, value, false) });
        else controls.push({ kind: "address", label: field.label, value: field.value,
          // A button with no name of its own (no text, label, labelledby, title or image alt) is unnamed.
          warning: selection.tag === "button" && field.property === "aria-label" && !field.value.trim() && !selection.text.trim() && !attribute("aria-labelledby")?.value.trim()
            && !attribute("title")?.value.trim() && !(range && ports.nativeNamedDescendant(source, range)) ? "Needs a name" : undefined,
          placeholder: field.kind === "url" ? "Local path or web address" : field.label,
          onOpen: () => { if (model) nativeAttributeFieldSession = { key: `${path}:${node.join(".")}:${field.property}`, path, source: expectedSource, model, epoch, scope: scopeKey }; },
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
    // Whole sections (a <section> or a section component) move, duplicate and
    // remove from icon buttons always in the bar, as one undo step each.
    // Nothing else can be removed this way. Alt+Up/Down move the section too,
    // from the bar, the preview or the page structure (`moveNativeSection`),
    // as do plain Up/Down on the bar's grip, whose drag moves it in the page.
    let onMove: EditBarModel["onMove"];
    let draggable = false;
    if (range && node && isNativeSectionTag(selection.tag)) {
      const parent = node.slice(0, -1);
      const index = node[node.length - 1];
      const before = index > 0 ? ports.locateNativeElementRange(source, [...parent, index - 1]) : undefined;
      const after = ports.locateNativeElementRange(source, [...parent, index + 1]);
      // Only the source this selection was painted from moves; a newer one, or another selection, refuses.
      const proof = selection.paintedSource === source ? sectionMoveProof(source, node, true) : undefined;
      const move = (direction: "up" | "down") => proof ? moveNativeSection(selection, direction, proof) : (announce(SECTION_MOVE_STALE), "stayed" as const);
      onMove = move;
      draggable = true;
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
      controls.push({
        kind: "button",
        icon: "remove",
        label: "Remove",
        // The previous sibling is selected next, else the next one, which takes this index.
        onPress: () => change([removeEdit(source, range)], index > 0 ? [...parent, index - 1] : after ? node : undefined, `${kind} removed`),
      });
    }
    // An item of a card grid, or anything inside one: Duplicate, Remove, Add card, Open page, Select card.
    // Only a whole section moves from the bar or the keyboard (Lex: "remove
    // this on not the sections"), so a card's own move arrows are left out and
    // no element move is offered here; the page structure still moves rows.
    if (!isNativeSectionTag(selection.tag)) controls.push(...ports.cardControls(selection, source));
    nativeElementMoveAction = onMove;
    // Edit component, Make component… (src/page-builder/components.ts).
    if (ports.componentTools) controls.push(...ports.componentTools.controls(selection));
    // Ask agent: a request about this element for a connected agent, pinned on it.
    const menu = ports.agentController.captureAsk();
    if (node && menu?.connected() && ports.nativeSite) {
      const site = ports.nativeSite;
      controls.push({
        kind: "prompt",
        label: "Ask agent",
        placeholder: "Ask the agent…",
        maxLength: REQUEST_TEXT_LIMIT,
        onSend: async (text) => {
          const about = agentElement({ ...selection, route: preview.route() }, site, ports.nativeSources()[path]);
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
    void editor.runVisualHistory("undo", fresh.path).then((undone) => {
      ports.element("status").textContent = undone ? "Empty link removed" : "The empty link could not be removed; undo removes it.";
    });
  }

  // `next` is the element to select once the preview has rendered it.
  function applyNativeChange(path: string, source: string, edits: { start: number; end: number; text: string }[], next: number[] | undefined, message: string) {
    const preview = ports.nativePreview;
    const editor = ports.editorModule;
    if (!preview || !editor) return false;

    if (ports.nativeEditableSource(path) !== source) {
      ports.announce("The source changed. Select the element again and try again.");
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

  // A whole section: a <section>, or a component whose template is one.
  function isNativeSectionTag(tag: string) {
    return tag === "section" || (tag.includes("-") && isSectionTemplate(ports.nativeSources()[ports.nativeSite?.components[tag] ?? ""] ?? ""));
  }

  // Moves a whole section one sibling position, as one undo step, keeping it
  // selected: the Move up/down buttons and Alt+Up/Down from the bar, the
  // preview and the page structure all come here. "stayed" at the first or
  // last position; nothing for anything but a section, when the page is not
  // the mounted file, or when the edit could not be made.
  // What a section move was offered against: the exact source painted for it,
  // the setup it was painted in, and (from the bar) the selection it was for.
  type SectionMoveProof = { source: string; epoch: number; scope: ReturnType<typeof ports.setupScope>; node: readonly number[]; model?: { isCurrent(): boolean }; selected: boolean };

  const SECTION_MOVE_STALE = "The source or selection changed. Select the section again before moving it.";

  function sectionMoveProof(source: string, node: readonly number[], selected: boolean): SectionMoveProof {
    const scope = ports.draftScope();
    return { source, epoch: ports.generation, scope: ports.setupScope(), node: [...node], selected,
      model: scope && ports.editorModule ? ports.editorModule.captureFileModelState(scope, ports.appStore.openFile.value ?? "") : undefined };
  }

  function moveNativeSection(target: { path: string; node?: number[]; tag: string }, direction: "up" | "down", proof: SectionMoveProof): "moved" | "stayed" | undefined {
    const { path, node } = target;
    if (!path || !node?.length || ports.appStore.openFile.value !== path || !ports.editorModule?.isMounted(path) || !isNativeSectionTag(target.tag)) return undefined;
    const selected = ports.appStore.selection.value;
    if (proof.epoch !== ports.generation || proof.scope !== ports.setupScope() || ports.versionView || ports.nativeSources()[path] !== proof.source
      || proof.node.join(".") !== node.join(".") || (proof.model && !proof.model.isCurrent())
      || (proof.selected && (selected?.path !== path || selected.node?.join(".") !== node.join(".")))) {
      ports.announce(SECTION_MOVE_STALE); return "stayed";
    }
    const source = proof.source;
    const range = ports.locateNativeElementRange(source, node);
    if (!range) return undefined;
    const parent = node.slice(0, -1);
    const index = node[node.length - 1] + (direction === "up" ? -1 : 1);
    const other = index >= 0 ? ports.locateNativeElementRange(source, [...parent, index]) : undefined;
    if (!other) return "stayed";
    const edits = direction === "up" ? swapEdits(source, other, range) : swapEdits(source, range, other);
    return applyNativeChange(path, source, edits, [...parent, index], direction === "up" ? "Moved up" : "Moved down") ? "moved" : undefined;
  }

  // Alt+Up/Down on a page structure row while another file is open (a
  // component chosen in the preview, a file from the explorer): the page
  // file opens first, as an insert does, then the section moves. A move that
  // still cannot be made is said so rather than passed off as the end of the
  // list.
  async function moveNativeSectionAfterOpening(target: { path: string; node: number[]; tag: string }, direction: "up" | "down", paintedSource: string) {
    const epoch = ports.generation, scope = ports.setupScope(), draft = ports.draftScope();
    const cachedModel = draft ? ports.editorModule?.captureFileModelState(draft, target.path, true) : undefined;
    await ports.restoreFile(target.path, epoch, { linkDefaultStyle: false, beforeMount: () => epoch === ports.generation && scope === ports.setupScope() && ports.nativeEffectiveSource(target.path) === paintedSource });
    if (epoch !== ports.generation || scope !== ports.setupScope() || ports.appStore.openFile.value !== target.path || ports.nativeEffectiveSource(target.path) !== paintedSource) {
      if (epoch !== ports.generation || scope !== ports.setupScope()) return;
      if (draft && ports.nativeEffectiveSource(target.path) !== paintedSource && cachedModel?.isCurrent() && !ports.editorModule?.isMounted(target.path)) ports.editorModule?.forgetDraftModel(draft, target.path);
      ports.updateNativePreviewSources();
      ports.announce("The source changed while its editor opened. Select the section again before moving it."); return;
    }
    if (!moveNativeSection(target, direction, sectionMoveProof(paintedSource, target.node, false))) ports.element("status").textContent = "The section could not be moved";
  }

  // Moves a whole section to another gap among its siblings (`index` counted
  // as the insert points are: before the sibling at that index, or the count
  // for the end), as one undo step, keeping it selected: a drag in the page
  // structure or the canvas ends here. "stayed" when the gap is the one the
  // section already fills (announced, nothing recorded); nothing for another
  // parent, for anything but a section, or when the ranges cannot be told.
  function moveNativeSectionTo(target: { path: string; node?: number[]; tag: string }, parent: number[], index: number): "moved" | "stayed" | undefined {
    const { path, node } = target;
    if (!path || !node?.length || ports.appStore.openFile.value !== path || !ports.editorModule?.isMounted(path) || !isNativeSectionTag(target.tag)) return undefined;
    const own = node.slice(0, -1);
    if (own.length !== parent.length || own.some((step, at) => step !== parent[at])) return undefined;
    const source = ports.nativeSources()[path] ?? "";
    const range = ports.locateNativeElementRange(source, node);
    if (!range) return undefined;
    const from = node[node.length - 1];
    if (index === from || index === from + 1) {
      ports.element("status").textContent = "Section stayed in place";
      return "stayed";
    }
    const edits = moveEdit(source, range, from, index, (at) => ports.locateNativeElementRange(source, [...parent, at]));
    if (!edits.length) return undefined;
    return applyNativeChange(path, source, edits, [...parent, index > from ? index - 1 : index], "Section moved") ? "moved" : undefined;
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
    const openingEpoch = ports.generation, openingScope = ports.setupScope();
    const allowed = () => openingEpoch === ports.generation && openingScope === ports.setupScope() && (path === ports.nativeSite?.routes[ports.nativePreview?.route() ?? ""] || path === ports.nativeEditableTemplatePath());
    if (!allowed()) {
      ports.announce("Edit the page instance in Structure, or choose Edit for its shared template.");
      ports.updateNativePreviewSources();
      return undefined;
    }
    // A page's text committed before its file was mounted, whose page was then
    // left (another page opened): it goes into that page's draft as one
    // operation rather than being lost. Same account, repository and branch
    // only.
    const page = Boolean(ports.nativeSite && Object.values(ports.nativeSite.routes).includes(path));
    const draftLeftPage = async () => {
      if (!page || ports.versionView || openingEpoch !== ports.generation || openingScope !== ports.setupScope()) return;
      // Back on the page meanwhile: the edit goes in there.
      if (ports.appStore.openFile.value === path && ports.editorModule.isMounted(path) && allowed()) { applyInEditor(); return; }
      const source = ports.nativeEffectiveSource(path);
      const edit = source === undefined ? undefined : nativeTextSourceEdit(source, node, before, after);
      if (source === undefined || !edit) { ports.errorMessage(new Error("That text change could not be placed in the source. Change text within one formatting at a time.")); return; }
      const problem = await ports.applyNativeOperation({
        expectedSources: new Map([[path, source]]),
        edits: new Map([[path, source.slice(0, edit.start) + edit.text + source.slice(edit.end)]]),
        done: `Text changed on ${ports.nativePageLabelOf(path)}.`,
        undone: `Undid the text change on ${ports.nativePageLabelOf(path)}.`,
      });
      if (problem) ports.errorMessage(new Error(problem));
    };
    return async () => {
    // The click that selected the element may still be opening its file.
    for (let waited = 0; ports.appStore.openFile.value === path && !ports.editorModule?.isMounted(path) && waited < 10_000 && allowed(); waited += 50)
      await new Promise((done) => setTimeout(done, 50));
    if (!allowed()) { await draftLeftPage(); return; }
    if (ports.appStore.openFile.value !== path || !ports.editorModule?.isMounted(path)) {
      const epoch = ports.generation;
      await ports.restoreFile(path, epoch, { linkDefaultStyle: false, beforeMount: allowed });
      if (epoch === ports.generation && !allowed()) { await draftLeftPage(); return; }
      if (epoch !== ports.generation || ports.appStore.openFile.value !== path || !ports.editorModule?.isMounted(path) || !allowed()) return;
    }
    applyInEditor();
    };
    function applyInEditor() {
    const editor = ports.editorModule;
    const preview = ports.nativePreview;
    if (!editor || !preview || !allowed()) return;
    const source = ports.nativeSources()[path] ?? "";
    const edit = nativeTextSourceEdit(source, node, before, after);
    if (!edit) {
      preview.refresh();
      ports.errorMessage(new Error("That text change could not be placed in the source. Change text within one formatting at a time."));
      return;
    }
    preview.selectAfterUpdate({ path, node });
    try {
      editor.replaceActiveRanges([{ path, ...edit, expected: source.slice(edit.start, edit.end) }]);
      ports.element("status").textContent = "Text changed";
    } catch (error) {
      preview.selectAfterUpdate(undefined);
      preview.refresh();
      ports.errorMessage(error);
    }
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
    sectionMoveProof,
    moveNativeSection,
    moveNativeSectionAfterOpening,
    moveNativeSectionTo,
    applyNativeTextEdit,
    nativeTextSourceEdit,
    prepareNativeTextEdit,
    get nativeFormatActions() { return nativeFormatActions; },
    get nativeEditBarModel() { return nativeEditBarModel; },
    get nativeElementMoveAction() { return nativeElementMoveAction; },
    set nativeElementMoveAction(value: typeof nativeElementMoveAction) { nativeElementMoveAction = value; },
  };
}

export type PageStructureController = ReturnType<typeof createPageStructureController>;
