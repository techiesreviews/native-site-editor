import { findStyleRulesInSources } from "../styles-index";
import type { NativeSelectedRule } from "../style-cascade";
import { mountGridEditor } from "./grid-editor";
import { mountImageFocalPoint, type FocalPreviewAsset } from "./image-focal-point";
import "./grid-editor.css";
import "./image-focal-point.css";
import { cssVariableDeclarations, type CssWorkspace } from "../page-builder/css-intelligence";
import { relevantVariables } from "./style-variables";
import { sections, sectionTitles, matchesStyleSearch, type Field } from "./style-fields";
import "./style-panel.css";
import { mountStylePanelResize } from "./style-panel-resize";
import { node, button } from "../ui/dom";
import { icon } from "../icons";
import { getCurrentBreakpoint, setCurrentBreakpoint, subscribeBreakpoint, type Breakpoint } from "../page-builder/breakpoints";
import { breakpointWidths } from "../page-builder/breakpoints";
import { cssClassSelector, writeCssProperties, validateCssSource, locateWriteRule, scanCss, siteVariables, variableResolver, type CssTarget, type SiteVariable } from "../page-builder/css-write";

export type StyleState = "" | ":hover" | ":focus-visible";
export interface StylePanelContext {
  key: string; selectionKey?: string; tag: string; className?: string; classes?: string[]; target?: CssTarget;
  matchedRules?: NativeSelectedRule[]; modelProof?: { isCurrent(): boolean }; assetRevision?: string; files: Record<string, string>; workspace?: CssWorkspace; computed: Record<string, string>; readOnly?: boolean;
}
export interface StylePanelHandlers {
  context: () => StylePanelContext | undefined;
  selectionPanel?: (host: HTMLElement) => { update(): void; destroy(): void };
  write: (properties: Record<string, string | null>, breakpoint: Breakpoint, state: StyleState, expected?: StylePanelContext) => Promise<void>;
  variable: (variable: SiteVariable, value: string, expected?: StylePanelContext) => Promise<void>;
  selectClass: (name: string, expected: StylePanelContext) => void;
  addClass: (name: string, expected?: StylePanelContext) => Promise<void>;
  focalAsset?: (expected: StylePanelContext) => Promise<{ mode: "object-position" | "background-position"; asset: FocalPreviewAsset } | undefined>;
  showCode: (expected: StylePanelContext) => Promise<void>;
  history: (direction: "undo" | "redo") => void | Promise<unknown>;
  error: (message: string) => void;
}
const sides = ["top", "right", "bottom", "left"];

/** A native controls panel. Commits on change; scrubs commit once on release. */
export function createStylePanel(handlers: StylePanelHandlers, workspace: HTMLElement) {
  const root = node("aside", "style-panel");
  root.setAttribute("aria-label", "Style panel");
  const body = node("div", "style-panel__body");
  root.append(body);
  const selectionHost = node("div", "style-panel__selection");
  const selectionPanel = handlers.selectionPanel?.(selectionHost);
  let collapsed = true, global = false, state: StyleState = "", key = "", busy = false;
  const links = { margin: false, padding: false };
  const opened = new Set(["Spacing"]);
  let pending = false, interacting = false;
  let searchQuery = "";
  let widgets: { kind: "grid" | "focal"; isCurrent(): boolean; dispose(): void; refresh(computed?: Readonly<Record<string, string | undefined>>): void }[] = [];
  let writing = false;
  let widgetRender = 0;
  let rebuildWidgets: ((focalOnly?: boolean) => void) | undefined;
  let widgetsPending = false;
  let gridShown = false;
  let restoringWidgetFocus = false, focusRestoreToken = 0;
  let variableMenu: HTMLElement | undefined;
  // owner/settle: the field whose typed --text is pending while its action menu is open.
  let variableMenuOrigin: { key: string; property: string; control?: HTMLElement; owner?: HTMLElement; settle?: () => void } | undefined;
  function closeVariableMenu() {
    // Drop references to the removed list so none dangle.
    variableMenuOrigin?.control?.removeAttribute("aria-controls"); variableMenuOrigin?.control?.removeAttribute("aria-activedescendant");
    variableMenu?.remove(); variableMenu = undefined; variableMenuOrigin = undefined;
  }
  const live = node("div", "style-panel__live"); live.setAttribute("role", "status"); live.setAttribute("aria-live", "polite");
  root.append(live);
  function announce(message: string) { live.textContent = message; }
  /** An unpicked typed variable is a cancellation, not a failure: say so inline
   *  beside the field (and once, politely) instead of raising the global error. */
  const notApplied = "Variable not applied. Choose one from the list to write var(--name).";
  // Survives a same-element re-render; a new selection or edit drops it.
  let fieldNotice: { key: string; property: string } | undefined;
  function clearFieldNotices() { fieldNotice = undefined; body.querySelectorAll(".style-panel__field-notice").forEach(notice => notice.remove()); }
  function variableNotApplied(property: string, speak = true) {
    clearFieldNotices();
    fieldNotice = { key, property };
    const control = [...body.querySelectorAll<HTMLElement>("[data-property]")].find(item => item.dataset.property === property);
    const wrapper = control?.closest(".style-panel__control");
    if (!wrapper) return;
    // Spacing box fields sit inside the box grid: put the notice below the box,
    // naming the field, so the margin and padding rings keep their size.
    const box = wrapper.closest(".style-panel__box--margin");
    const notice = node("p", "style-panel__field-notice", box ? `${control!.getAttribute("aria-label")}: ${notApplied}` : notApplied); notice.dataset.noticeFor = property;
    (box ?? wrapper).after(notice); if (speak) announce(notApplied);
  }
  root.addEventListener("pointerdown", () => { interacting = true; }, true);
  const gestureEvents = new AbortController();
  let gestureTimer: ReturnType<typeof setTimeout> | undefined;
  const finishGesture = () => {
    if (!interacting) return;
    if (gestureTimer) clearTimeout(gestureTimer);
    gestureTimer = setTimeout(() => {
      gestureTimer = undefined;
      interacting = false;
      if (widgetsPending) { widgetsPending = false; report("The style source changed during the gesture. Review the current values and retry."); rebuildWidgets?.(); }
      else if (pending && !root.contains(document.activeElement)) { pending = false; render(); }
    }, 0);
  };
  document.addEventListener("pointerup", finishGesture, { capture: true, signal: gestureEvents.signal });
  document.addEventListener("pointercancel", finishGesture, { capture: true, signal: gestureEvents.signal });
  const ownHistorySources: StylePanelContext[] = [];
  let renderContext: StylePanelContext | undefined;
  let renderOwn: Record<string, string> = {};
  function report(error: unknown) { handlers.error(error instanceof Error ? error.message : String(error)); }
  async function commit(action: () => Promise<void>) {
    if (busy) return false;
    busy = true; root.setAttribute("aria-busy", "true");
    try { await action(); return true; } catch (error) { report(error); return false; }
    finally { busy = false; root.removeAttribute("aria-busy"); update(); }
  }
  function update() {
    selectionPanel?.update();
    const context = handlers.context();
    const nextKey = context?.key ?? "";
    if (nextKey !== key) { key = nextKey; render(); return; }
    const own = ownValues();
    const nextGrid = /^(?:inline-)?grid$/.test(own.display || context?.computed.display || "");
    const widgetFocused = document.activeElement instanceof Element && document.activeElement.closest(".grid-editor, .image-focal-point");
    const staleWidget = widgetFocused && widgets.some(widget => !widget.isCurrent());
    if (!writing && interacting && staleWidget) widgetsPending = true;
    else if (nextGrid !== gridShown || !writing && staleWidget) rebuildWidgets?.();
    else if (context?.assetRevision !== renderContext?.assetRevision) rebuildWidgets?.(true);
    // Preview refreshes must not destroy the field under the user's pointer.
    if (interacting || root.contains(document.activeElement)) { pending = true; refreshValues(); }
    else render();
  }
  root.addEventListener("focusout", () => queueMicrotask(() => {
    if (pending && !interacting && !restoringWidgetFocus && !root.contains(document.activeElement)) { pending = false; render(); }
  }));
  root.addEventListener("keydown", (event) => {
    // Collapsing moves focus to the resize separator, the only control left reachable.
    if (event.key === "Escape") resize.collapse();
    const modifier = event.ctrlKey || event.metaKey;
    const direction = modifier && event.key.toLowerCase() === "z" ? (event.shiftKey ? "redo" : "undo")
      : event.ctrlKey && event.key.toLowerCase() === "y" ? "redo" : undefined;
    if (direction) {
      event.preventDefault(); event.stopPropagation();
      const before = handlers.context();
      const snapshots = [...controlSnapshots].filter(snapshot => sameSource(snapshot.expected, before));
      const advance = (accepted?: unknown) => {
        const current = handlers.context();
        if (!root.isConnected || accepted === false || !before || !current || current.readOnly || !sameTarget(before, current) ||
          !ownHistorySources.some(source => sameSource(source, current))) return;
        // Only controls current before this user history action may advance.
        // A stale control from an earlier external edit remains stale.
        for (const snapshot of snapshots) if (controlSnapshots.has(snapshot)) snapshot.expected = current;
        update();
      };
      try {
        const result = handlers.history(direction);
        if (result) void result.then(advance, report);
        else advance();
      } catch (error) { report(error); }
    }
  });
  const unsubscribe = subscribeBreakpoint(() => render());
  function options() { return { selector: handlers.context()?.target?.selector ?? "", baseStart: handlers.context()?.target?.start, breakpoint: breakpointWidths[getCurrentBreakpoint()], state }; }
  function ownValues() {
    const context = handlers.context(), out: Record<string, string> = {};
    if (!context?.target) return out;
    const rule = locateWriteRule(context.files[context.target.path] ?? "", options());
    // CSSStyleDeclaration expands authored shorthand values without resolving
    // inherited or computed styles into source.
    const style = document.createElement("div").style;
    for (const declaration of rule?.declarations ?? []) {
      out[declaration.property] = declaration.value;

    }
    style.cssText = (rule?.declarations ?? []).map(declaration => `${declaration.property}:${declaration.value};`).join("");
    for (const field of [...["grid-template-rows", "column-gap", "row-gap", "object-position", "background-position", "background-size"].map(property => ({ property })), ...sections.flatMap((s) => s.fields), ...["margin", "padding"].flatMap((p) => sides.map((s) => ({ property: `${p}-${s}` })))]) {
      const value = style.getPropertyValue(field.property);
      const priority = style.getPropertyPriority(field.property);
      const raw = (rule?.declarations ?? []).filter(declaration => declaration.property === field.property && /!important\s*$/i.test(declaration.value) === (priority === "important")).at(-1)?.value.replace(/\s*!important\s*$/, "");
      const probe = document.createElement("div").style;
      if (raw) probe.setProperty(field.property, raw);
      out[field.property] = raw && probe.getPropertyValue(field.property) === value ? raw : value || out[field.property] || "";
    }
    return out;
  }
  function syncTarget(context: StylePanelContext) {
    const target = body.querySelector<HTMLElement>(".style-panel__target");
    if (!target) return;
    const selector = target.querySelector(".style-panel__selector"), path = target.querySelector(".style-panel__path");
    if (selector) selector.textContent = context.target?.selector ?? context.tag;
    if (path) path.textContent = context.target?.path ?? "No class rule selected";
    const old = target.querySelector(".style-panel__show-code");
    if (context.target?.start === undefined || !context.workspace) old?.remove();
    else if (!old) {
      const captured = context;
      const show = button("Show in code", () => {
        const fresh = handlers.context();
        const expected = currentContext(show.isConnected && fresh && sameTarget(captured, fresh) ? fresh : captured);
        if (expected) void handlers.showCode(expected).catch(report);
      }, "style-panel__show-code");
      target.append(show);
    }
    const hint = body.querySelector(".style-panel__new-rule-hint");
    if (context.target?.start !== undefined) hint?.remove();
  }
  function refreshValues() {
    const context = handlers.context(), own = ownValues();
    renderContext = context; renderOwn = own;
    if (context) syncTarget(context);
    widgets.forEach(widget => widget.kind === "grid" && context?.key === key
      ? widget.refresh(context.computed) : widget.refresh());
    if (global && context) {
      const variables = siteVariables(context.files), resolve = variableResolver(variables);
      // The first variable of each name, as a row shows.
      const byName = new Map<string, SiteVariable>();
      for (const variable of variables) if (!byName.has(variable.name)) byName.set(variable.name, variable);
      for (const input of body.querySelectorAll<HTMLInputElement>(".style-panel__variable input")) {
        const variable = byName.get(input.name);
        if (variable && input !== document.activeElement) input.value = variable.value;
        const swatch = input.parentElement?.querySelector<HTMLElement>(".style-panel__swatch");
        if (swatch && variable) swatch.style.backgroundColor = resolve(variable.value);
      }
    }
    for (const input of body.querySelectorAll<HTMLInputElement | HTMLSelectElement>("[data-property]")) {
      // Focused fields and typed text pending in an open variable menu keep their text.
      if (input === document.activeElement || input.dataset.pendingVariable) continue;
      const property = input.dataset.property!, value = own[property] ?? "";
      input.classList.toggle("is-computed", !value);
      if (input instanceof HTMLInputElement) { input.value = value; input.placeholder = context?.computed[property] || "—"; }
      else { if (value && ![...input.options].some((o) => o.value === value)) { const option = node("option", "", value); option.value = value; input.append(option); } input.options[0].textContent = context?.computed[property] ? `${context.computed[property]} · computed` : "Default"; input.value = value; }
    }
  }
  function sameTarget(before: StylePanelContext, current: StylePanelContext) {
    return before.key === current.key && before.selectionKey === current.selectionKey &&
      before.target?.path === current.target?.path && before.target?.selector === current.target?.selector;
  }
  function sameSource(before: StylePanelContext | undefined, current: StylePanelContext | undefined) {
    return !!before && !!current && sameTarget(before, current) && before.target?.start === current.target?.start &&
      Object.keys(before.files).length === Object.keys(current.files).length &&
      Object.entries(before.files).every(([path, source]) => current.files[path] === source);
  }
  function currentContext(expected = renderContext) {
    const current = handlers.context();
    if (!expected || !current || current.readOnly || expected.key !== current.key || expected.target?.path !== current.target?.path || expected.target?.selector !== current.target?.selector || expected.target?.start !== current.target?.start ||
      Object.keys(expected.files).length !== Object.keys(current.files).length || Object.keys(expected.files).some((path) => expected.files[path] !== current.files[path])) {
      report("The style target changed. Select the element again.");
      return undefined;
    }
    return expected;
  }
  const controlSnapshots = new Set<{ expected?: StylePanelContext }>();
  async function write(properties: Record<string, string | null>, snapshot = renderContext) {
    try { if (snapshot?.target) validateCssSource(snapshot.files[snapshot.target.path] ?? ""); } catch (error) { report(error); return false; }
    const breakpoint = getCurrentBreakpoint(), currentState = state;
    const expected = currentContext(snapshot);
    if (!expected?.target) return false;
    const target = expected.target;
    let written: string;
    try {
      written = writeCssProperties(expected.files[target.path] ?? "", { selector: target.selector, baseStart: target.start, breakpoint: breakpointWidths[breakpoint], state: currentState }, properties);
    } catch (error) { report(error); return false; }
    if (busy) return false;
    writing = true;
    const accepted = await commit(() => handlers.write(properties, breakpoint, currentState, expected));
    writing = false;
    if (!accepted) { update(); return false; }
    const current = handlers.context();
    // Advance focused controls only after our exact source edit is visible.
    // An external edit, navigation or rejected host write cannot refresh them.
    if (!current || current.key !== expected.key || current.target?.path !== target.path || current.target?.selector !== target.selector || current.readOnly ||
      Object.keys(current.files).length !== Object.keys(expected.files).length ||
      Object.keys(expected.files).some((path) => current.files[path] !== (path === target.path ? written : expected.files[path]))) { report("The source changed after your edit. Review the current values and retry."); update(); return false; }
    for (const snapshot of controlSnapshots) {
      const before = snapshot.expected;
      if (before?.key === expected.key && before.target?.path === target.path && before.target?.selector === target.selector &&
        Object.keys(before.files).every((path) => before.files[path] === expected.files[path])) snapshot.expected = current;
    }
    ownHistorySources.push(expected, current);
    if (ownHistorySources.length > 100) ownHistorySources.splice(0, ownHistorySources.length - 100);
    widgetsPending = false; widgets.forEach(widget => widget.refresh());
    return true;
  }
  function fieldControl(field: Field, variables: SiteVariable[], onChange?: (value: string, expected?: StylePanelContext) => Promise<void | boolean>) {
    const wrapper = node("div", "style-panel__control");
    const snapshot = { expected: renderContext };
    controlSnapshots.add(snapshot);
    const own = renderOwn[field.property] ?? "", computed = renderContext?.computed[field.property] ?? "";
    let acceptedValue: string | undefined;
    let pendingValue: string | undefined;
    const apply = async (value: string) => {
      if (field.unit && /^-?(?:\d+\.?\d*|\.\d+)$/.test(value)) value += "px";
      if (field.property === "grid-template-columns" && /^\d+$/.test(value)) {
        if (+value < 1 || +value > 24) { report("Choose 1–24 grid columns, or enter a CSS template."); return; }
        value = `repeat(${value}, minmax(0, 1fr))`;
      }
      if (/^(?:var\(\s*)?--[\w-]*$/.test(value)) { report("Choose a variable from the list to write var(--name)."); return; }
      if (value && !CSS.supports(field.property, value.replace(/\s*!important\s*$/, ""))) { report(`Enter a valid ${field.label.toLowerCase()} value.`); return; }
      if (value === pendingValue || value === acceptedValue && (ownValues()[field.property] ?? "") === value.replace(/\s*!important\s*$/i, "")) return;
      if (!currentContext(snapshot.expected)) return;
      pendingValue = value;
      try {
        const accepted = onChange ? await onChange(value, snapshot.expected) : await write({ [field.property]: value }, snapshot.expected);
        if (accepted !== false) { acceptedValue = value; clearFieldNotices(); }
      } catch (error) { report(error); }
      finally { pendingValue = undefined; }
    };
    let control: HTMLInputElement | HTMLSelectElement;
    if (field.options) {
      const select = node("select");
      for (const value of ["", ...new Set([...field.options, ...(own ? [own] : [])])]) { const option = node("option", "", value || (computed ? `${computed} · computed` : "Default")); option.value = value; select.append(option); }
      control = select;
    } else {
      const input = node("input"); input.type = "text"; input.placeholder = computed || "—";
      input.autocomplete = "off"; input.spellcheck = false;
      if (field.property === "grid-template-columns") input.title = "Enter a column count (1–24) or a CSS template.";
      if (field.kind === "font") {
        const list = node("datalist"); list.id = "style-panel-fonts";
        const fonts = Object.entries(renderContext?.files ?? {}).filter(([path]) => /\.css$/.test(path)).map(([, source]) => source).flatMap((source) => scanCss(source).filter((b) => /^@font-face\b/.test(b.selector)).flatMap((b) => b.declarations.filter((d) => d.property === "font-family").map((d) => d.value)));
        for (const value of new Set(fonts)) { const option = node("option"); option.value = value; list.append(option); }
        input.setAttribute("list", list.id); wrapper.append(list);
      }
      input.addEventListener("keydown", (event) => { if (event.key === "Enter") { event.preventDefault(); input.dispatchEvent(new Event("change", { bubbles: true })); } });
      control = input;
    }
    control.name = field.property; control.setAttribute("aria-label", field.label);
    control.dataset.property = field.property; control.value = own; control.classList.toggle("is-computed", !own);
    control.addEventListener("focus", () => { if (handlers.context()?.key === snapshot.expected?.key) snapshot.expected = handlers.context(); });
    control.addEventListener("change", () => {
      // Leaving the field with a raw --name is handled once, by the blur restore below.
      if (suggestionsOpen() || document.activeElement !== control && rawVariable(control.value)) return;
      void apply(control.value.trim());
    });
    const bare = (name: string) => name.replace(/^--/, "").toLowerCase();
    const rawVariable = (value: string) => /^(?:var\(\s*)?--[\w-]*$/.test(value.trim());
    /** Captures the variable workspace for this field, refusing stale targets on use. */
    function variableScope() {
      const expected = currentContext(control.isConnected && snapshot.expected?.key === renderContext?.key ? renderContext : snapshot.expected), workspace = expected?.workspace;
      if (!expected || !workspace) return undefined;
      const menuBreakpoint = getCurrentBreakpoint(), menuState = state;
      const isCurrent = () => {
        if (menuBreakpoint !== getCurrentBreakpoint() || menuState !== state) { report("The style target changed. Select the element again."); return false; }
        return !!currentContext(expected);
      };
      const offered = relevantVariables(field.property, cssVariableDeclarations(workspace), (property, value) => CSS.supports(property, value));
      const choose = (name: string) => {
        if (!isCurrent()) return;
        clearFieldNotices();
        const value = `var(${name})`;
        if (control instanceof HTMLInputElement) control.value = value;
        if (onChange) void onChange(value, expected); else void write({ [field.property]: value }, expected);
      };
      return { expected, workspace, isCurrent, offered, choose };
    }
    function place(menu: HTMLElement, x: number, y: number) {
      // Keep the whole menu inside the viewport; flip above the field when short.
      const box = menu.getBoundingClientRect(), fieldBox = control.getBoundingClientRect();
      menu.style.left = `${Math.max(4, Math.min(x, innerWidth - box.width - 4))}px`;
      menu.style.top = `${Math.max(4, y + box.height > innerHeight - 4 ? Math.min(fieldBox.top, y) - box.height - 2 : y)}px`;
    }
    // Right-click / Shift+F10: an action menu with "use variable" and "go to definition".
    function openVariableMenu(x: number, y: number) {
      // Another field's pending --text settles when its menu is replaced; this
      // field keeps its own text until the new menu closes.
      const previous = variableMenuOrigin;
      closeVariableMenu();
      if (previous?.owner && previous.owner !== control) previous.settle?.();
      const scope = variableScope();
      if (!scope) return;
      const { expected, workspace, isCurrent, offered, choose: use } = scope;
      if (rawVariable(control.value)) control.dataset.pendingVariable = "true";
      const menu = node("div", "style-panel__variable-menu"); variableMenu = menu; variableMenuOrigin = { key: expected.key, property: field.property, owner: control, settle: settleRaw };
      menu.setAttribute("role", "menu"); menu.setAttribute("aria-label", `${field.label} variables`);
      if (!offered.length) menu.append(node("p", "style-panel__hint", "No compatible variables."));
      for (const declaration of offered) {
        const row = node("div", "style-panel__variable-choice"); row.setAttribute("role", "none");
        const choose = button("", () => { delete control.dataset.pendingVariable; use(declaration.name); closeVariableMenu(); if (control.isConnected) control.focus(); });
        choose.setAttribute("role", "menuitem"); choose.tabIndex = -1; choose.setAttribute("aria-label", `${declaration.name} · ${declaration.value} · ${declaration.path}`);
        choose.append(node("strong", "", declaration.name), node("span", "style-panel__variable-provenance", `${declaration.value} · ${declaration.path}`));
        const definition = button("", () => {
          const current = isCurrent(); closeVariableMenu(); settleRaw();
          if (current) void workspace.openDefinition(declaration.path, declaration.start, declaration.end, workspace.revision).then(ok => { if (!ok) report("The variable source changed. Open its definition again."); }).catch(report);
        }); definition.setAttribute("role", "menuitem"); definition.tabIndex = -1; definition.setAttribute("aria-label", `Go to ${declaration.name} in ${declaration.path}`);
        definition.classList.add("style-panel__variable-definition"); definition.append(icon("arrow-up-right", 14));
        row.append(choose, definition); menu.append(row);
      }
      menu.addEventListener("keydown", event => {
        const buttons = [...menu.querySelectorAll<HTMLButtonElement>(".style-panel__variable-choice button:first-child")];
        const focus = (button: HTMLButtonElement | undefined) => { if (!button) return; menu.querySelectorAll<HTMLButtonElement>("button").forEach(item => item.tabIndex = -1); button.tabIndex = 0; button.focus(); };
        if (event.key === "Escape" || event.key === "Tab") { event.preventDefault(); event.stopPropagation(); closeVariableMenu(); if (control.isConnected) control.focus(); }
        else if (["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key) && buttons.length) {
          event.preventDefault(); const activeRow = document.activeElement?.closest(".style-panel__variable-choice");
          const current = buttons.findIndex(button => button.parentElement === activeRow);
          const index = event.key === "Home" ? 0 : event.key === "End" ? buttons.length - 1 : (current + (event.key === "ArrowDown" ? 1 : -1) + buttons.length) % buttons.length;
          focus(buttons[index]);
        } else if (event.key === "ArrowRight" || event.key === "ArrowLeft") {
          event.preventDefault(); const row = document.activeElement?.closest(".style-panel__variable-choice");
          focus(row?.querySelector<HTMLButtonElement>(event.key === "ArrowRight" ? "button:last-child" : "button:first-child") ?? undefined);
        }
      });
      menu.addEventListener("focusout", event => {
        if (event.relatedTarget instanceof Node && menu.contains(event.relatedTarget)) return;
        setTimeout(() => { if (variableMenu === menu && !menu.contains(document.activeElement)) { closeVariableMenu(); settleRaw(); } }, 0);
      });
      menu.tabIndex = -1; root.append(menu); place(menu, x, y);
      const first = menu.querySelector<HTMLButtonElement>("button"); if (first) first.tabIndex = 0; (first ?? menu).focus();
    }
    /** Leaving without a choice never keeps an unwritten raw --name in the field.
     *  A re-render or new selection removed this field: never restore onto another one. */
    function settleRaw() {
      if (document.activeElement !== control) delete control.dataset.pendingVariable;
      if (!(control instanceof HTMLInputElement) || !control.isConnected || document.activeElement === control || !rawVariable(control.value)) return;
      // Only on the same element: a new selection never receives the old text's outcome.
      if (handlers.context()?.key !== snapshot.expected?.key) return;
      control.value = ownValues()[field.property] ?? ""; control.classList.toggle("is-computed", !control.value);
      variableNotApplied(field.property);
    }
    // Typing "--" or "var(--" shows a listbox of matching variables. Focus stays
    // in the field; aria-activedescendant names the option Enter will choose.
    let suggestionIndex = 0;
    const suggestionsOpen = () => !!variableMenu && variableMenuOrigin?.control === control;
    function suggestionOptions() { return suggestionsOpen() ? [...variableMenu!.querySelectorAll<HTMLElement>('[role="option"]')] : []; }
    function highlight(index: number) {
      const options = suggestionOptions(); if (!options.length) return;
      suggestionIndex = (index + options.length) % options.length;
      options.forEach((option, i) => { option.setAttribute("aria-selected", String(i === suggestionIndex)); option.classList.toggle("is-active", i === suggestionIndex); });
      const active = options[suggestionIndex];
      control.setAttribute("aria-activedescendant", active.id); active.scrollIntoView({ block: "nearest" });
    }
    function openSuggestions(typed: string) {
      const scope = variableScope();
      const offered = (scope?.offered ?? []).filter(declaration => bare(declaration.name).includes(bare(typed)));
      // Exact, then prefix, then contained matches.
      const rank = (name: string) => bare(name) === bare(typed) ? 0 : bare(name).startsWith(bare(typed)) ? 1 : 2;
      offered.sort((a, b) => rank(a.name) - rank(b.name));
      if (!scope || !offered.length) { if (suggestionsOpen()) { closeVariableMenu(); announce("No matching variables."); } return; }
      closeVariableMenu();
      const list = node("div", "style-panel__variable-menu style-panel__variable-list"); variableMenu = list;
      variableMenuOrigin = { key: scope.expected.key, property: field.property, control };
      list.id = "style-panel-variable-list"; list.setAttribute("role", "listbox"); list.setAttribute("aria-label", `${field.label} variables`);
      offered.forEach((declaration, index) => {
        const option = node("div", "style-panel__variable-option"); option.id = `style-panel-variable-option-${index}`;
        option.setAttribute("role", "option"); option.dataset.name = declaration.name;
        option.setAttribute("aria-label", `${declaration.name} · ${declaration.value} · ${declaration.path}`);
        option.append(node("strong", "", declaration.name), node("span", "style-panel__variable-provenance", `${declaration.value} · ${declaration.path}`));
        option.addEventListener("click", () => { scope.choose(declaration.name); closeVariableMenu(); if (control.isConnected) control.focus(); });
        list.append(option);
      });
      // Pointer and touch choose without taking focus from the field.
      list.addEventListener("pointerdown", event => event.preventDefault());
      root.append(list);
      const rect = control.getBoundingClientRect(); place(list, rect.left, rect.bottom + 2);
      control.setAttribute("aria-controls", list.id);
      // The count is the only live message; aria-activedescendant announces the option.
      announce(`${offered.length} variable${offered.length === 1 ? "" : "s"} available.`);
      highlight(0);
    }
    if (control instanceof HTMLInputElement) {
      control.setAttribute("aria-autocomplete", "list");
      control.title = "Type -- for site variables.";
      control.addEventListener("input", () => {
        // New typing supersedes the cancellation: forget it, not just its DOM.
        clearFieldNotices();
        const typed = /^(?:var\(\s*)?(--[\w-]*)$/.exec(control.value.trim())?.[1];
        if (typed && handlers.context()?.workspace) openSuggestions(typed);
        else if (suggestionsOpen()) { closeVariableMenu(); announce("Variable suggestions closed."); }
      });
      control.addEventListener("keydown", event => {
        if (!suggestionsOpen()) return;
        if (event.key === "ArrowDown" || event.key === "ArrowUp") { event.preventDefault(); event.stopImmediatePropagation(); highlight(suggestionIndex + (event.key === "ArrowDown" ? 1 : -1)); }
        else if (event.key === "Enter") { event.preventDefault(); event.stopImmediatePropagation(); suggestionOptions()[suggestionIndex]?.click(); }
        else if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); closeVariableMenu(); announce("Variable suggestions closed."); }
        else if (event.key === "Tab") closeVariableMenu();
      });
      control.addEventListener("blur", () => {
        const wasRaw = rawVariable(control.value), fieldKey = snapshot.expected?.key;
        setTimeout(() => {
          // The right-click / Shift+F10 menu keeps the typed text pending until it closes.
          if (variableMenu?.contains(document.activeElement)) return;
          if (suggestionsOpen() && document.activeElement !== control) closeVariableMenu();
          // A same-element re-render already showed the source value; still say why.
          // A new selection is a different field: say nothing about the old text.
          if (!control.isConnected) { if (wasRaw && fieldKey && handlers.context()?.key === fieldKey) variableNotApplied(field.property); return; }
          settleRaw();
        }, 0);
      });
    }
    control.addEventListener("contextmenu", event => { if (!handlers.context()?.workspace) return; event.preventDefault(); if (event instanceof MouseEvent) openVariableMenu(event.clientX, event.clientY); });
    control.addEventListener("keydown", event => {
      if (event instanceof KeyboardEvent && (event.key === "ContextMenu" || event.shiftKey && event.key === "F10") && handlers.context()?.workspace) { event.preventDefault(); const rect = control.getBoundingClientRect(); openVariableMenu(rect.left, rect.bottom); }
    });
    wrapper.append(control);
    if (field.kind === "color") {
      const swatch = node("span", "style-panel__swatch"); swatch.setAttribute("aria-hidden", "true");
      // Site colors are content; editor chrome uses theme tokens exclusively.
      if (CSS.supports("color", computed || own)) swatch.style.backgroundColor = computed || own;
      wrapper.prepend(swatch);
    }
    return wrapper;
  }
  function spacing(variables: SiteVariable[]) {
    const outer = node("div", "style-panel__box style-panel__box--margin");
    const inner = node("div", "style-panel__box style-panel__box--padding");
    const center = node("div", "style-panel__box-center", "Content");
    function ring(kind: "margin" | "padding", host: HTMLElement) {
      const heading = node("div", "style-panel__box-label", kind);
      const link = button("Link", () => { links[kind] = !links[kind]; link.setAttribute("aria-pressed", String(links[kind])); }, "style-panel__link");
      link.setAttribute("aria-label", `Link ${kind} sides`); link.setAttribute("aria-pressed", String(links[kind])); heading.append(link); host.append(heading);
      for (const side of sides) {
        const field: Field = { label: `${kind[0].toUpperCase() + kind.slice(1)} ${side}`, property: `${kind}-${side}`, unit: true };
        const control = fieldControl(field, variables, (value, expected) => write(Object.fromEntries((links[kind] ? sides : [side]).map((s) => [`${kind}-${s}`, value])), expected));
        control.classList.add(`style-panel__box-${side}`);
        const scrub = control.querySelector("input")!; scrub.title = "Drag to adjust pixels. Alt+arrow adjusts by 1px (Shift: 10px).";
        const fieldKey = renderContext?.key;
        let drag: { x: number; value: number; next: number; context?: StylePanelContext } | undefined;
        scrub.addEventListener("pointerdown", (event) => {
          if (fieldKey !== handlers.context()?.key) { report("The style target changed. Select the element again."); return; }
          const input = control.querySelector("input")!;
          const raw = input.value || input.placeholder;
          if (!/^-?(?:\d+\.?\d*|\.\d+)(?:px)?$/.test(raw)) { report("Scrubbing needs a pixel value. Type a value to replace a variable or another unit."); return; }
          drag = { x: event.clientX, value: parseFloat(raw), next: parseFloat(raw), context: handlers.context() };
        });
        scrub.addEventListener("pointermove", (event) => { if (!drag || Math.abs(event.clientX - drag.x) < 5) return; scrub.setPointerCapture(event.pointerId); drag.next = Math.round(drag.value + event.clientX - drag.x); if (kind === "padding") drag.next = Math.max(0, drag.next); control.querySelector("input")!.value = `${drag.next}px`; });
        const finish = () => { if (!drag) return; const value = `${drag.next}px`; const changed = drag.next !== drag.value, expected = drag.context; drag = undefined; if (changed) void write(Object.fromEntries((links[kind] ? sides : [side]).map((s) => [`${kind}-${s}`, value])), expected); };
        scrub.addEventListener("pointerup", finish); scrub.addEventListener("pointercancel", () => { drag = undefined; refreshValues(); });
        scrub.addEventListener("keydown", (event) => { if (!event.altKey || !["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) return; event.preventDefault(); if (fieldKey !== handlers.context()?.key) { report("The style target changed. Select the element again."); return; } const raw = control.querySelector("input")!.value || control.querySelector("input")!.placeholder; if (!/^-?[\d.]+(?:px)?$/.test(raw)) return; let n = parseFloat(raw) + (["ArrowLeft", "ArrowDown"].includes(event.key) ? -1 : 1) * (event.shiftKey ? 10 : 1); if (kind === "padding") n = Math.max(0, n); void write(Object.fromEntries((links[kind] ? sides : [side]).map((s) => [`${kind}-${s}`, `${n}px`])), handlers.context()); });
        host.append(control);
      }
    }
    ring("margin", outer); ring("padding", inner); inner.append(center); outer.append(inner);
    const group = node("div"); group.append(outer);
    group.append(node("p", "style-panel__hint", "Click to type. Drag pixel values to scrub."));
    for (const kind of ["margin", "padding"]) {
      const row = node("div", "style-panel__field");
      const label = `${kind[0].toUpperCase()}${kind.slice(1)} (all)`;
      row.append(node("span", "", label), fieldControl({ label, property: kind, kind: "space", unit: true }, variables));
      group.append(row);
    }
    return group;
  }
  /** Existing CSS classes matching the typed partial, offered inline below Add class. */
  function classSuggestions(form: HTMLFormElement, input: HTMLInputElement, add: HTMLButtonElement, context: StylePanelContext) {
    const own = new Set(context.classes ?? (context.className ? [context.className] : []));
    // Read classes when suggesting: CSS edits made while focus is in the panel do not re-render it.
    const knownClasses = () => {
      const fresh = handlers.context(), files = fresh?.key === context.key ? fresh.files : context.files;
      const known = new Set<string>();
      for (const [path, source] of Object.entries(files)) {
        if (!/\.css$/i.test(path)) continue;
        try {
          for (const block of scanCss(source)) {
            // Attribute selectors and strings are not classes; escaped names are skipped, not truncated.
            const selector = block.selector.replace(/\[[^\]]*\]|"[^"]*"|'[^']*'/g, " ");
            for (const match of selector.matchAll(/\.(-?[_a-zA-Z][\w-]*)(?![\\\w-])/g)) if (!own.has(match[1])) known.add(match[1]);
          }
        } catch { /* unreadable CSS offers nothing */ }
      }
      return known;
    };
    // Focus stays in the field (a textbox with list autocomplete); the listbox's
    // options are not focusable and aria-activedescendant names the highlighted one.
    const list = node("div", "style-panel__class-suggestions"); list.id = "style-panel-class-suggestions"; list.setAttribute("role", "listbox"); list.setAttribute("aria-label", "Existing classes"); list.hidden = true;
    input.setAttribute("aria-autocomplete", "list");
    let active = -1;
    const options = () => [...list.querySelectorAll<HTMLElement>('[role="option"]')];
    const hide = () => { list.hidden = true; active = -1; input.removeAttribute("aria-controls"); input.removeAttribute("aria-activedescendant"); };
    const highlight = (index: number) => {
      const all = options(); active = index;
      all.forEach((option, i) => { option.setAttribute("aria-selected", String(i === index)); option.classList.toggle("is-active", i === index); });
      // aria-activedescendant announces the option itself; no extra live message per arrow.
      if (all[index]) input.setAttribute("aria-activedescendant", all[index].id);
      else input.removeAttribute("aria-activedescendant");
    };
    const choose = (name: string) => { input.value = name; hide(); input.focus(); form.requestSubmit(add); };
    const show = () => {
      const typed = input.value.trim().toLowerCase();
      const names = typed ? [...knownClasses()].filter(name => name.toLowerCase().includes(typed) && name.toLowerCase() !== typed)
        .sort((a, b) => Number(!a.toLowerCase().startsWith(typed)) - Number(!b.toLowerCase().startsWith(typed)) || a.localeCompare(b)).slice(0, 6) : [];
      const wasOpen = !list.hidden;
      list.replaceChildren(...names.map((name, index) => {
        const option = node("div", "style-panel__class-suggestion", name); option.id = `style-panel-class-option-${index}`; option.dataset.name = name;
        option.setAttribute("role", "option"); option.setAttribute("aria-selected", "false");
        option.addEventListener("click", () => choose(name)); return option;
      }));
      if (!names.length) { if (wasOpen) announce("Class suggestions closed."); hide(); return; }
      list.hidden = false; active = -1; input.setAttribute("aria-controls", list.id); input.removeAttribute("aria-activedescendant");
      announce(`${names.length} existing class${names.length === 1 ? "" : "es"} available.`);
    };
    input.addEventListener("input", show);
    // Pointer and touch choose without taking focus from the field.
    list.addEventListener("pointerdown", event => event.preventDefault());
    input.addEventListener("keydown", event => {
      const all = options();
      if (list.hidden || !all.length) return;
      if (event.key === "ArrowDown" || event.key === "ArrowUp") { event.preventDefault(); highlight(((active < 0 && event.key === "ArrowUp" ? 0 : active) + (event.key === "ArrowDown" ? 1 : -1) + all.length) % all.length); }
      else if (event.key === "Enter" && active >= 0) { event.preventDefault(); choose(all[active].dataset.name!); }
      else if (event.key === "Tab" && !event.shiftKey && all.length === 1) { event.preventDefault(); input.value = all[0].dataset.name!; hide(); }
      else if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); hide(); announce("Class suggestions closed."); }
    });
    input.addEventListener("blur", () => setTimeout(() => { if (document.activeElement !== input) hide(); }, 0));
    form.append(list);
  }
  function applyFold() {
    root.classList.toggle("is-collapsed", collapsed); root.parentElement?.classList.toggle("has-style-panel", !collapsed);
    body.hidden = collapsed;
  }
  let pendingWidgetRestore: ((final?: boolean) => void) | undefined;
  // The context the mounted focal widget was built from, and a focused focal
  // field's uncommitted text carried to the next focal mount (see rebuildWidgets).
  let focalBuiltFrom: StylePanelContext | undefined;
  let focalDraft: { label: string; value: string; start: number | null; end: number | null; key: string; breakpoint: Breakpoint; state: StyleState; files: Record<string, string>; target?: CssTarget } | undefined;
  const sameFiles = (a: Record<string, string>, b: Record<string, string>) => Object.keys(a).length === Object.keys(b).length && Object.entries(a).every(([path, source]) => b[path] === source);
  const sameCssTarget = (a?: CssTarget, b?: CssTarget) => !!a && !!b && a.path === b.path && a.selector === b.selector && a.start === b.start;
  function captureWidgetFocus() {
    if (restoringWidgetFocus && document.activeElement === document.body && pendingWidgetRestore) return pendingWidgetRestore;
    const previous = document.activeElement instanceof HTMLElement && document.activeElement.closest(".grid-editor, .image-focal-point") ? document.activeElement : undefined;
    const focusKey = renderContext?.key;
    const identity = (control: HTMLElement) => control.dataset.styleControl ?? control.getAttribute("aria-label") ?? control.closest("label")?.textContent ?? (control instanceof HTMLButtonElement ? control.textContent : undefined);
    const label = previous && identity(previous), token = ++focusRestoreToken;
    restoringWidgetFocus = !!previous;
    const restore = (final = false) => {
      if (token !== focusRestoreToken) return;
      if (!previous || previous.isConnected || !label || document.activeElement !== document.body || handlers.context()?.key !== focusKey) { restoringWidgetFocus = false; return; }
      const control = [...body.querySelectorAll<HTMLElement>(".grid-editor input, .grid-editor button, .image-focal-point input, .image-focal-point [tabindex]")].find(control => identity(control) === label);
      if (control) { control.focus(); restoringWidgetFocus = false; }
      else if (final) restoringWidgetFocus = false;
    };
    pendingWidgetRestore = restore;
    return restore;
  }
  function render() {
    const restoreWidgetFocus = captureWidgetFocus();
    const widgetRequest = ++widgetRender;
    widgets.forEach(widget => widget.dispose()); widgets = []; rebuildWidgets = undefined; gridShown = false; widgetsPending = false;
    const focusOrigin = variableMenu?.contains(document.activeElement) ? variableMenuOrigin : undefined;
    closeVariableMenu();
    if (focusOrigin) queueMicrotask(() => {
      if (root.isConnected && !collapsed && document.activeElement === document.body && handlers.context()?.key === focusOrigin.key)
        [...body.querySelectorAll<HTMLInputElement | HTMLSelectElement>("[data-property]")].find(control => control.dataset.property === focusOrigin.property)?.focus();
    });
    applyFold();
    if (collapsed) return;
    const scrollTop = body.querySelector(".style-panel__scroll")?.scrollTop ?? 0;
    renderContext = handlers.context(); key = renderContext?.key ?? ""; renderOwn = ownValues();
    const keptNotice = fieldNotice?.key === key ? fieldNotice : undefined; fieldNotice = undefined;
    if (keptNotice) queueMicrotask(() => { if (key === keptNotice.key && !fieldNotice) variableNotApplied(keptNotice.property, false); });
    controlSnapshots.clear();
    body.replaceChildren();
    const header = node("div", "style-panel__header"); header.append(node("strong", "", "Style"));
    const close = button("×", () => resize.collapse(), "style-panel__close"); close.setAttribute("aria-label", "Collapse Style panel"); header.append(close); body.append(header);
    const tabs = node("div", "style-panel__tabs");
    for (const [label, value] of [["Element", false], ["Global styles", true]] as const) {
      const tab = button(label, () => { global = value; render(); }, ""); tab.setAttribute("aria-pressed", String(global === value)); tabs.append(tab);
    }
    body.append(tabs);
    const context = renderContext;
    if (!context) { body.append(node("p", "style-panel__hint", "Select an element on the canvas to style it.")); return; }
    const variables = siteVariables(context.files);
    if (global) {
      const content = node("div", "style-panel__scroll");
      content.append(node("p", "style-panel__hint", "Site variables. Changes apply everywhere they are used."));
      // Each variable is resolved and sorted into its group once.
      const resolve = variableResolver(variables);
      const sorted = variables.map((variable) => {
        const resolved = resolve(variable.value);
        const title = CSS.supports("color", resolved) && !resolved.includes("var(") ? "Colours" : /^--(?:font|text|line)-/.test(variable.name) ? "Typography" : /^--(?:space|spacing|gap|size)-/.test(variable.name) ? "Spacing" : "Other";
        return { variable, resolved, title };
      });
      for (const title of ["Colours", "Typography", "Spacing", "Other"]) {
        const group = sorted.filter((item) => item.title === title);
        if (!group.length) continue;
        const heading = node("h3", "style-panel__section-title", title); content.append(heading);
        for (const { variable, resolved } of group) {
          const row = node("label", "style-panel__variable"); row.append(node("span", "", variable.name)); row.title = variable.path;
          if (title === "Colours") { const swatch = node("span", "style-panel__swatch"); swatch.style.backgroundColor = resolved; row.append(swatch); }
          const input = node("input"); input.type = "text"; input.name = variable.name; input.value = variable.value; input.setAttribute("aria-label", variable.name); input.disabled = !!context.readOnly;
          let expected = context;
          input.addEventListener("focus", () => { expected = handlers.context() ?? expected; });
          input.addEventListener("change", () => { if (currentContext(expected)) void commit(() => handlers.variable(variable, input.value.trim(), expected)); });
          input.addEventListener("keydown", (event) => { if (event.key === "Enter") input.blur(); }); row.append(input); content.append(row);
        }
      }
      if (!variables.length) content.append(node("p", "style-panel__hint", "No :root variables found in this site's stylesheets."));
      body.append(content); content.scrollTop = scrollTop; return;
    }
    if (!context.key) { body.append(node("p", "style-panel__hint", "Select an element on the canvas to style it.")); return; }
    // One scroll area holds the whole element view so short panels keep every
    // control reachable. Only the title, tabs and style search stay fixed.
    const content = node("div", "style-panel__scroll");
    const finish = () => { body.append(content); content.scrollTop = scrollTop; };
    const scope = node("div", "style-panel__scope");
    const bp = node("select"); bp.name = "style-breakpoint"; bp.setAttribute("aria-label", "Style breakpoint");
    for (const [value, label] of [["all", "All sizes"], ["tablet", "Tablet ≤768"], ["mobile", "Mobile ≤390"]]) { const option = node("option", "", label); option.value = value; bp.append(option); }
    bp.value = getCurrentBreakpoint(); bp.addEventListener("change", () => setCurrentBreakpoint(bp.value as Breakpoint));
    const states = node("select"); states.name = "style-state"; states.setAttribute("aria-label", "Style state");
    for (const [value, label] of [["", "State: none"], [":hover", ":hover"], [":focus-visible", ":focus-visible"]]) { const option = node("option", "", label); option.value = value; states.append(option); }
    states.value = state; states.addEventListener("change", () => { state = states.value as StyleState; render(); }); scope.append(bp, states); content.append(scope);
    const classSnapshot = { expected: context }; controlSnapshots.add(classSnapshot);
    const chips = node("div", "style-panel__classes"); chips.setAttribute("role", "group"); chips.setAttribute("aria-label", "Element classes");
    for (const name of context.classes ?? (context.className ? [context.className] : [])) {
      const chip = button(name, () => { const expected = currentContext(classSnapshot.expected); if (expected) { handlers.selectClass(name, expected); render(); [...root.querySelectorAll<HTMLButtonElement>(".style-panel__class")].find(button => button.getAttribute("aria-label") === `Style class ${name}`)?.focus(); } }, "style-panel__class");
      chip.setAttribute("aria-label", `Style class ${name}`); chip.setAttribute("aria-pressed", String(name === context.className)); chips.append(chip);
    }
    content.append(chips);
    const target = node("div", "style-panel__target");
    target.append(node("span", "style-panel__selector", context.target?.selector ?? context.tag), node("span", "style-panel__path", context.target?.path ?? "No class rule selected"));
    if (context.target?.start !== undefined && context.workspace) {
      const show = button("Show in code", () => {
        const fresh = handlers.context();
        const expected = currentContext(show.isConnected && fresh && sameTarget(context, fresh) ? fresh : classSnapshot.expected);
        if (expected) void handlers.showCode(expected).catch(report);
      }, "style-panel__show-code");
      target.append(show);
    }
    content.append(target);
    if (context.target && context.target.start === undefined) content.append(node("p", "style-panel__hint style-panel__new-rule-hint", "No class rule yet. The first style edit creates it in this stylesheet."));
    if (context.className) content.append(node("p", "style-panel__shared-scope", context.target?.selector === cssClassSelector(context.className) ? `Edits apply to every element with class “${context.className}”.` : `Edits apply to every element matching “${context.target?.selector ?? cssClassSelector(context.className)}”.`));
    if (context.readOnly) { content.append(node("p", "style-panel__hint", "This version is read only.")); finish(); return; }
    {
      const form = node("form", "style-panel__add-class"); const input = node("input"); input.type = "text"; input.name = "class"; input.placeholder = "e.g. hero-title"; input.setAttribute("aria-label", "Class name"); const add = button("Add class", () => {}, ""); add.type = "submit";
      if (!context.className) form.append(node("p", "style-panel__hint", "Add a class to style this element in the site's CSS."));
      form.append(input, add);
      form.addEventListener("submit", (event) => { event.preventDefault(); const fresh = handlers.context(); const expected = currentContext(form.isConnected && fresh?.key === classSnapshot.expected?.key ? fresh : classSnapshot.expected); if (expected) void commit(() => handlers.addClass(input.value.replace(/^[\t\n\f\r ]+|[\t\n\f\r ]+$/g, ""), expected)); }); content.append(form);
      classSuggestions(form, input, add, context);
    }
    if (!context.className) {
      if (selectionPanel) content.append(selectionHost);
      finish(); return;
    }
    if (getCurrentBreakpoint() !== "all") content.append(button("Hide on this size", () => void write({ display: "none" }, context), "style-panel__hide"));
    if (selectionPanel) content.append(selectionHost);
    content.append(node("p", "style-panel__hint", "Muted values are computed. Clear a field to remove its declaration. Type -- for site variables."));
    for (const title of sectionTitles) {
      const details = node("details", "style-panel__section"); details.open = opened.has(title);
      const summary = node("summary", "style-panel__section-title", title); details.append(summary); details.addEventListener("toggle", () => { if (searchQuery) return; if (details.open) opened.add(title); else opened.delete(title); });
      if (title === "Spacing") details.append(spacing(variables));
      else for (const field of sections.find((s) => s.title === title)!.fields) {
        const row = node("div", "style-panel__field"); row.dataset.searchLabel = field.label; row.dataset.searchProperty = field.property; row.append(node("span", "", field.label), fieldControl(field, variables)); details.append(row);
      }
      content.append(details);
    }
    const widgetSections: { kind: "grid" | "focal"; details: HTMLDetailsElement }[] = [];
    let focalRequest = 0;
    rebuildWidgets = (focalOnly = false) => {
      const restore = captureWidgetFocus();
      const widgetContext = handlers.context();
      if (!widgetContext || widgetContext.key !== context.key || collapsed) return;
      // A focal field's typed, uncommitted text survives only a remount for a new
      // image asset revision: same element, target, state and breakpoint, and the
      // CSS files byte-identical to those the focal widget was built from. Any
      // newer CSS (agent, code edit, Undo) or other change drops the draft.
      const typing = document.activeElement instanceof HTMLInputElement && document.activeElement.closest(".image-focal-point") && document.activeElement.dataset.focalDraft ? document.activeElement : undefined;
      if (typing) focalDraft = focalBuiltFrom && focalBuiltFrom.key === widgetContext.key && focalBuiltFrom.assetRevision !== widgetContext.assetRevision &&
        sameFiles(focalBuiltFrom.files, widgetContext.files) && sameCssTarget(focalBuiltFrom.target, widgetContext.target)
        ? { label: typing.closest("label")?.textContent ?? "", value: typing.value, start: typing.selectionStart, end: typing.selectionEnd,
          key: widgetContext.key, breakpoint: getCurrentBreakpoint(), state, files: widgetContext.files, target: widgetContext.target } : undefined;
      const own = ownValues();
      widgets = widgets.filter(widget => { if (!focalOnly || widget.kind === "focal") { widget.dispose(); return false; } return true; });
      for (let index = widgetSections.length - 1; index >= 0; index--) if (!focalOnly || widgetSections[index].kind === "focal") { widgetSections[index].details.remove(); widgetSections.splice(index, 1); }
      const section = (kind: "grid" | "focal", title: string, label: string, properties: string) => {
        const details = node("details", "style-panel__section"); details.open = opened.has(title);
        details.append(node("summary", "style-panel__section-title", title));
        details.addEventListener("toggle", () => { if (!searchQuery) { if (details.open) opened.add(title); else opened.delete(title); } });
        const host = node("div", "style-panel__widget"); host.dataset.searchLabel = label; host.dataset.searchProperty = properties;
        details.append(host); content.append(details); widgetSections.push({ kind, details }); return { details, host };
      };
      const snapshot = () => {
        const captured = { expected: widgetContext }; controlSnapshots.add(captured);
        const breakpoint = getCurrentBreakpoint(), currentState = state;
        const isCurrent = (asset = false) => {
          const before = captured.expected, current = handlers.context();
          return !!current && !current.readOnly && before.modelProof?.isCurrent() !== false && current.key === before.key &&
            (!asset || current.assetRevision === before.assetRevision) && getCurrentBreakpoint() === breakpoint && state === currentState &&
            current.target?.path === before.target?.path && current.target?.selector === before.target?.selector && current.target?.start === before.target?.start &&
            Object.keys(current.files).length === Object.keys(before.files).length && Object.entries(before.files).every(([path, source]) => current.files[path] === source);
        };
        const change = async (properties: Record<string, string | null>) => {
          if (!isCurrent() || !(await write(properties, captured.expected))) throw new Error("The style change was not applied. Review the current values and retry.");
        };
        return { captured, isCurrent, change };
      };
      if (!focalOnly) {
        gridShown = /^(?:inline-)?grid$/.test(own.display || widgetContext.computed.display || "");
        if (gridShown) {
          const grid = section("grid", "Grid", "Grid layout columns rows tracks gaps", "grid-template-columns grid-template-rows gap column-gap row-gap");
          const proof = snapshot();
          const view = mountGridEditor(grid.host, { authored: own, computed: widgetContext.computed, expected: proof.captured,
            readOnly: () => busy || !!handlers.context()?.readOnly, isCurrent: () => proof.isCurrent(), onChange: proof.change, onError: report });
          [...view.element.querySelectorAll<HTMLButtonElement>("button")].forEach((button, index) => button.dataset.styleControl = `grid-replace-${index === 0 ? "columns" : "rows"}`);
          widgets.push({ ...view, kind: "grid", isCurrent: () => proof.isCurrent() });
        }
      }
      const request = ++focalRequest;
      if (handlers.focalAsset) {
        const focal = section("focal", "Image focus", "Image focal point position", "object-position background-position");
        focal.host.append(node("p", "style-panel__hint", "Loading native image…"));
        const proof = snapshot();
        void handlers.focalAsset(widgetContext).then(result => {
          if (request !== focalRequest || widgetRequest !== widgetRender || !focal.host.isConnected || !proof.isCurrent(true)) return;
          focal.host.replaceChildren();
          if (!result) { focalDraft = undefined; focal.details.remove(); filter(); restore(true); return; }
          const view = mountImageFocalPoint(focal.host, { mode: result.mode, previewAsset: result.asset,
            authored: own[result.mode], computed: widgetContext.computed[result.mode], fit: widgetContext.computed["object-fit"], size: widgetContext.computed["background-size"],
            expected: proof.captured, readOnly: () => busy || !!handlers.context()?.readOnly, isCurrent: () => proof.isCurrent(true),
            onChange: async properties => {
              if (!proof.isCurrent(true)) throw new Error("The image or style source changed. Retry with the current preview.");
              const target = proof.captured.expected.target;
              const rule = target && locateWriteRule(proof.captured.expected.files[target.path] ?? "", options());
              // The runtime reports selectors matching this element in active media.
              // Selection can capture hover/focus while the user clicks the canvas.
              // The editor's selected state, not that captured interaction, owns
              // this write. Structural states such as checked remain applicable.
              const matched = (proof.captured.expected.matchedRules ?? []).filter(item => {
                const userStates = item.state?.filter(name => /^:(?:hover|active|focus-visible|focus-within|focus)$/.test(name)) ?? [];
                return !userStates.length || !!state && userStates.includes(state);
              });
              const located = findStyleRulesInSources(proof.captured.expected.files, matched);
              const competingPriority = matched.some((item, index) => {
                const important = item.declarations?.some(declaration => declaration.important &&
                  (declaration.property === result.mode || result.mode === "background-position" && /^(?:background|background-position-[xy])$/.test(declaration.property)));
                if (!important) return false;
                // Container queries may match conditionally. Do not pretend that
                // a write to such a scope has a verified visible result.
                if (item.possible) return true;
                const sources = located.filter(source => source.match === index);
                return !sources.length || sources.some(source => source.path !== target?.path || source.start !== rule?.start);
              });
              if (competingPriority) throw new Error("Another matching CSS rule has an important image position. Edit that rule in code before changing image focus.");
              const declaration = document.createElement("div").style;
              declaration.cssText = (rule?.declarations ?? []).map(item => `${item.property}:${item.value};`).join("");
              const prioritized = Object.fromEntries(Object.entries(properties).map(([property, value]) => [property, value && declaration.getPropertyPriority(property) === "important" ? `${value} !important` : value]));
              await proof.change(prioritized);
            }, onError: report });
          widgets.push({ ...view, kind: "focal", isCurrent: () => proof.isCurrent(true) });
          filter(); restore(true);
          focalBuiltFrom = widgetContext;
          const draft = focalDraft, now = handlers.context(); focalDraft = undefined;
          const field = document.activeElement instanceof HTMLInputElement && view.element.contains(document.activeElement) ? document.activeElement : undefined;
          if (draft && now && field && field.closest("label")?.textContent === draft.label && now.key === draft.key && getCurrentBreakpoint() === draft.breakpoint && state === draft.state &&
            sameFiles(draft.files, now.files) && sameCssTarget(draft.target, now.target)) {
            field.value = draft.value; field.dataset.focalDraft = "true";
            try { field.setSelectionRange(draft.start, draft.end); } catch { /* number inputs have no selection */ }
          }
        }).catch(error => { if (request === focalRequest && widgetRequest === widgetRender && focal.host.isConnected) { focalDraft = undefined; focal.details.remove(); restore(true); report(error); } });
      }
      // Grid owns these controls while present; they still remain searchable there.
      for (const row of content.querySelectorAll<HTMLElement>(".style-panel__field[data-search-property]")) row.dataset.gridDuplicate = String(gridShown && ["grid-template-columns", "grid-template-rows", "gap", "column-gap", "row-gap"].includes(row.dataset.searchProperty!));
      filter(); restore();
    };
    const search = node("div", "style-panel__search");
    const input = node("input"); input.type = "search"; input.value = searchQuery; input.placeholder = "Search styles"; input.setAttribute("aria-label", "Search styles");
    const clear = button("Clear", () => { input.value = ""; searchQuery = ""; filter(); input.focus(); }); clear.setAttribute("aria-label", "Clear style search");
    const empty = node("p", "style-panel__hint", "No matching styles."); empty.setAttribute("role", "status");
    function filter() {
      let matches = 0;
      for (const details of content.querySelectorAll<HTMLDetailsElement>(":scope > .style-panel__section")) {
        const title = details.querySelector("summary")!.textContent!;
        if (title === "Spacing") {
          const visible = matchesStyleSearch(searchQuery, "margin padding spacing box model", "margin padding", title) || ["margin", "padding"].some(kind => sides.some(side => matchesStyleSearch(searchQuery, `${kind} ${side}`, `${kind}-${side}`, title))); details.hidden = !visible; if (visible) matches++;
        } else {
          let count = 0;
          for (const row of details.querySelectorAll<HTMLElement>("[data-search-property]")) {
            row.hidden = row.dataset.gridDuplicate === "true" || !matchesStyleSearch(searchQuery, row.dataset.searchLabel!, row.dataset.searchProperty!, title); if (!row.hidden) count++;
          }
          details.hidden = count === 0; matches += count;
        }
        details.open = searchQuery ? !details.hidden : opened.has(title);
      }
      clear.hidden = !searchQuery; empty.hidden = matches > 0;
    }
    input.addEventListener("input", () => { searchQuery = input.value; filter(); });
    const searchIcon = node("span", "style-panel__search-icon"); searchIcon.setAttribute("aria-hidden", "true"); search.append(searchIcon, input, clear); body.append(search, content); content.append(empty); filter(); content.scrollTop = scrollTop; rebuildWidgets(); restoreWidgetFocus();
  }
  const resize = mountStylePanelResize(workspace, root, value => {
    const changed = collapsed !== value; collapsed = value;
    if (changed) render(); else applyFold();
  });
  render();
  return { root, update, dispose() { selectionPanel?.destroy(); gestureEvents.abort(); if (gestureTimer) clearTimeout(gestureTimer); rebuildWidgets = undefined; widgetRender++; widgets.forEach(widget => widget.dispose()); widgets = []; closeVariableMenu(); unsubscribe(); resize.dispose(); root.remove(); } };
}
