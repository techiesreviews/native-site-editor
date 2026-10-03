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
import { getCurrentBreakpoint, setCurrentBreakpoint, subscribeBreakpoint, type Breakpoint } from "../page-builder/breakpoints";
import { breakpointWidths } from "../page-builder/breakpoints";
import { cssClassSelector, writeCssProperties, validateCssSource, locateWriteRule, scanCss, siteVariables, resolveVariableValue, type CssTarget, type SiteVariable } from "../page-builder/css-write";

export type StyleState = "" | ":hover" | ":focus-visible";
export interface StylePanelContext {
  key: string; selectionKey?: string; tag: string; className?: string; classes?: string[]; target?: CssTarget;
  modelProof?: { isCurrent(): boolean }; assetRevision?: string; files: Record<string, string>; workspace?: CssWorkspace; computed: Record<string, string>; readOnly?: boolean;
}
export interface StylePanelHandlers {
  context: () => StylePanelContext | undefined;
  write: (properties: Record<string, string | null>, breakpoint: Breakpoint, state: StyleState, expected?: StylePanelContext) => Promise<void>;
  variable: (variable: SiteVariable, value: string, expected?: StylePanelContext) => Promise<void>;
  selectClass: (name: string, expected: StylePanelContext) => void;
  addClass: (name: string, expected?: StylePanelContext) => Promise<void>;
  focalAsset?: (expected: StylePanelContext) => Promise<{ mode: "object-position" | "background-position"; asset: FocalPreviewAsset } | undefined>;
  showCode: (expected: StylePanelContext) => Promise<void>;
  history: (direction: "undo" | "redo") => void;
  error: (message: string) => void;
}
const sides = ["top", "right", "bottom", "left"];

/** A native controls panel. Commits on change; scrubs commit once on release. */
export function createStylePanel(handlers: StylePanelHandlers, workspace: HTMLElement) {
  const root = node("aside", "style-panel");
  root.setAttribute("aria-label", "Style panel");
  const opener = button("Style", () => resize.expand(), "style-panel__opener");
  opener.setAttribute("aria-label", "Open Style panel");
  const body = node("div", "style-panel__body");
  root.append(opener, body);
  let collapsed = true, global = false, state: StyleState = "", key = "", busy = false;
  const links = { margin: false, padding: false };
  const opened = new Set(["Spacing"]);
  let pending = false, interacting = false;
  let searchQuery = "";
  let widgets: { kind: "grid" | "focal"; isCurrent(): boolean; dispose(): void; refresh(): void }[] = [];
  let writing = false;
  let widgetRender = 0;
  let rebuildWidgets: ((focalOnly?: boolean) => void) | undefined;
  let widgetsPending = false;
  let gridShown = false;
  let restoringWidgetFocus = false, focusRestoreToken = 0;
  let variableMenu: HTMLElement | undefined;
  let variableMenuOrigin: { key: string; property: string } | undefined;
  function closeVariableMenu() { variableMenu?.remove(); variableMenu = undefined; variableMenuOrigin = undefined; }
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
    if (event.key === "Escape") { resize.collapse(); opener.focus(); }
    const modifier = event.ctrlKey || event.metaKey;
    const direction = modifier && event.key.toLowerCase() === "z" ? (event.shiftKey ? "redo" : "undo")
      : event.ctrlKey && event.key.toLowerCase() === "y" ? "redo" : undefined;
    if (direction) { event.preventDefault(); event.stopPropagation(); handlers.history(direction); }
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
        const expected = currentContext(show.isConnected && fresh?.key === captured.key ? fresh : captured);
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
    widgets.forEach(widget => widget.refresh());
    if (global && context) {
      const variables = siteVariables(context.files);
      for (const input of body.querySelectorAll<HTMLInputElement>(".style-panel__variable input")) {
        const variable = variables.find((v) => v.name === input.name);
        if (variable && input !== document.activeElement) input.value = variable.value;
        const swatch = input.parentElement?.querySelector<HTMLElement>(".style-panel__swatch");
        if (swatch && variable) swatch.style.backgroundColor = resolveVariableValue(variable.value, variables);
      }
    }
    for (const input of body.querySelectorAll<HTMLInputElement | HTMLSelectElement>("[data-property]")) {
      if (input === document.activeElement) continue;
      const property = input.dataset.property!, value = own[property] ?? "";
      input.classList.toggle("is-computed", !value);
      if (input instanceof HTMLInputElement) { input.value = value; input.placeholder = context?.computed[property] || "—"; }
      else { if (value && ![...input.options].some((o) => o.value === value)) { const option = node("option", "", value); option.value = value; input.append(option); } input.options[0].textContent = context?.computed[property] ? `${context.computed[property]} · computed` : "Default"; input.value = value; }
    }
  }
  function presets(field: Field, variables: SiteVariable[]) {
    return variables.filter((v) => field.kind === "space" ? /^--(?:space|spacing|gap|size)-/.test(v.name)
      : field.kind === "type" ? /^--(?:text|font-size|line)-/.test(v.name)
      : field.kind === "font" ? /^--font-/.test(v.name) && !/^--font-size-/.test(v.name)
      : field.kind === "color" ? CSS.supports("color", resolveVariableValue(v.value, variables)) && !resolveVariableValue(v.value, variables).includes("var(") || /(?:color|colour|ink|accent|surface|page|muted)/.test(v.name) : false);
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
      if (value && !CSS.supports(field.property, value.replace(/\s*!important\s*$/, ""))) { report(`Enter a valid ${field.label.toLowerCase()} value.`); return; }
      if (value === acceptedValue || value === pendingValue) return;
      if (!currentContext(snapshot.expected)) return;
      pendingValue = value;
      try {
        const accepted = onChange ? await onChange(value, snapshot.expected) : await write({ [field.property]: value }, snapshot.expected);
        if (accepted !== false) acceptedValue = value;
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
    control.addEventListener("change", () => { void apply(control.value.trim()); });
    function openVariableMenu(x: number, y: number) {
      closeVariableMenu();
      const expected = currentContext(control.isConnected && snapshot.expected?.key === renderContext?.key ? renderContext : snapshot.expected), workspace = expected?.workspace;
      if (!expected || !workspace) return;
      const menuBreakpoint = getCurrentBreakpoint(), menuState = state;
      const menuCurrent = () => {
        if (menuBreakpoint !== getCurrentBreakpoint() || menuState !== state) { report("The style target changed. Select the element again."); return false; }
        return !!currentContext(expected);
      };
      const declarations = cssVariableDeclarations(workspace);
      const offered = relevantVariables(field.property, declarations, (property, value) => CSS.supports(property, value));
      const menu = node("div", "style-panel__variable-menu"); variableMenu = menu; variableMenuOrigin = { key: expected.key, property: field.property };
      menu.setAttribute("role", "menu"); menu.setAttribute("aria-label", `${field.label} variables`);
      menu.style.left = `${Math.max(0, Math.min(x, innerWidth - 260))}px`; menu.style.top = `${Math.max(0, Math.min(y, innerHeight - 240))}px`;
      if (!offered.length) menu.append(node("p", "style-panel__hint", "No compatible variables."));
      for (const declaration of offered) {
        const row = node("div", "style-panel__variable-choice"); row.setAttribute("role", "none");
        const choose = button("", () => {
          if (menuCurrent()) {
            const value = `var(${declaration.name})`;
            if (onChange) void onChange(value, expected); else void write({ [field.property]: value }, expected);
          }
          closeVariableMenu(); if (control.isConnected) control.focus();
        }); choose.setAttribute("role", "menuitem"); choose.tabIndex = -1; choose.setAttribute("aria-label", `${declaration.name} · ${declaration.value} · ${declaration.path}`);
        choose.append(node("strong", "", declaration.name), node("span", "style-panel__variable-provenance", `${declaration.value} · ${declaration.path}`));
        const definition = button("↗", () => {
          const current = menuCurrent(); closeVariableMenu();
          if (current) void workspace.openDefinition(declaration.path, declaration.start, declaration.end, workspace.revision).then(ok => { if (!ok) report("The variable source changed. Open its definition again."); }).catch(report);
        }); definition.setAttribute("role", "menuitem"); definition.tabIndex = -1; definition.setAttribute("aria-label", `Go to ${declaration.name} in ${declaration.path}`);
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
        setTimeout(() => { if (variableMenu === menu && !menu.contains(document.activeElement)) closeVariableMenu(); }, 0);
      });
      menu.tabIndex = -1; root.append(menu); const first = menu.querySelector<HTMLButtonElement>("button"); if (first) first.tabIndex = 0; (first ?? menu).focus();
    }
    control.addEventListener("contextmenu", event => { if (!handlers.context()?.workspace) return; event.preventDefault(); if (event instanceof MouseEvent) openVariableMenu(event.clientX, event.clientY); });
    control.addEventListener("keydown", event => {
      if (event instanceof KeyboardEvent && (event.key === "ContextMenu" || event.shiftKey && event.key === "F10") && handlers.context()?.workspace) { event.preventDefault(); const rect = control.getBoundingClientRect(); openVariableMenu(rect.left, rect.bottom); }
    });
    wrapper.append(control);
    const offered = presets(field, variables);
    if (offered.length) {
      const select = node("select", "style-panel__preset");
      select.name = `${field.property}-preset`; select.setAttribute("aria-label", `${field.label} preset`); select.title = "Choose a site variable";
      const blank = node("option", "", "◇"); blank.value = ""; select.append(blank);
      for (const variable of offered) { const option = node("option", "", `${variable.name} · ${variable.value}`); option.value = variable.name; select.append(option); }
      select.addEventListener("change", () => { if (select.value) apply(`var(${select.value})`); select.value = ""; });
      wrapper.append(select);
    }
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
      row.append(node("span", "", `${kind} preset`), fieldControl({ label: `${kind} preset`, property: kind, kind: "space", unit: true }, variables));
      group.append(row);
    }
    return group;
  }
  function applyFold() {
    root.classList.toggle("is-collapsed", collapsed); root.parentElement?.classList.toggle("has-style-panel", !collapsed);
    opener.hidden = !collapsed; opener.setAttribute("aria-expanded", String(!collapsed)); body.hidden = collapsed;
  }
  let pendingWidgetRestore: ((final?: boolean) => void) | undefined;
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
    controlSnapshots.clear();
    body.replaceChildren();
    const header = node("div", "style-panel__header"); header.append(node("strong", "", "Style"));
    const close = button("×", () => { resize.collapse(); opener.focus(); }, "style-panel__close"); close.setAttribute("aria-label", "Collapse Style panel"); header.append(close); body.append(header);
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
      for (const title of ["Colours", "Typography", "Spacing", "Other"]) {
        const group = variables.filter((v) => (CSS.supports("color", resolveVariableValue(v.value, variables)) && !resolveVariableValue(v.value, variables).includes("var(") ? "Colours" : /^--(?:font|text|line)-/.test(v.name) ? "Typography" : /^--(?:space|spacing|gap|size)-/.test(v.name) ? "Spacing" : "Other") === title);
        if (!group.length) continue;
        const heading = node("h3", "style-panel__section-title", title); content.append(heading);
        for (const variable of group) {
          const row = node("label", "style-panel__variable"); row.append(node("span", "", variable.name)); row.title = variable.path;
          if (title === "Colours") { const swatch = node("span", "style-panel__swatch"); swatch.style.backgroundColor = resolveVariableValue(variable.value, variables); row.append(swatch); }
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
    const scope = node("div", "style-panel__scope");
    const bp = node("select"); bp.name = "style-breakpoint"; bp.setAttribute("aria-label", "Style breakpoint");
    for (const [value, label] of [["all", "All sizes"], ["tablet", "Tablet ≤768"], ["mobile", "Mobile ≤390"]]) { const option = node("option", "", label); option.value = value; bp.append(option); }
    bp.value = getCurrentBreakpoint(); bp.addEventListener("change", () => setCurrentBreakpoint(bp.value as Breakpoint));
    const states = node("select"); states.name = "style-state"; states.setAttribute("aria-label", "Style state");
    for (const [value, label] of [["", "State: none"], [":hover", ":hover"], [":focus-visible", ":focus-visible"]]) { const option = node("option", "", label); option.value = value; states.append(option); }
    states.value = state; states.addEventListener("change", () => { state = states.value as StyleState; render(); }); scope.append(bp, states); body.append(scope);
    const classSnapshot = { expected: context }; controlSnapshots.add(classSnapshot);
    const chips = node("div", "style-panel__classes"); chips.setAttribute("role", "group"); chips.setAttribute("aria-label", "Element classes");
    for (const name of context.classes ?? (context.className ? [context.className] : [])) {
      const chip = button(name, () => { const expected = currentContext(classSnapshot.expected); if (expected) { handlers.selectClass(name, expected); render(); [...root.querySelectorAll<HTMLButtonElement>(".style-panel__class")].find(button => button.getAttribute("aria-label") === `Style class ${name}`)?.focus(); } }, "style-panel__class");
      chip.setAttribute("aria-label", `Style class ${name}`); chip.setAttribute("aria-pressed", String(name === context.className)); chips.append(chip);
    }
    body.append(chips);
    const target = node("div", "style-panel__target");
    target.append(node("span", "style-panel__selector", context.target?.selector ?? context.tag), node("span", "style-panel__path", context.target?.path ?? "No class rule selected"));
    if (context.target?.start !== undefined && context.workspace) target.append(button("Show in code", () => { const expected = currentContext(classSnapshot.expected); if (expected) void handlers.showCode(expected).catch(report); }, "style-panel__show-code"));
    body.append(target);
    if (context.target && context.target.start === undefined) body.append(node("p", "style-panel__hint style-panel__new-rule-hint", "No class rule yet. The first style edit creates it in this stylesheet."));
    if (context.className) body.append(node("p", "style-panel__shared-scope", context.target?.selector === cssClassSelector(context.className) ? `Edits apply to every element with class “${context.className}”.` : `Edits apply to every element matching “${context.target?.selector ?? cssClassSelector(context.className)}”.`));
    if (context.readOnly) { body.append(node("p", "style-panel__hint", "This version is read only.")); return; }
    {
      const form = node("form", "style-panel__add-class"); const input = node("input"); input.type = "text"; input.name = "class"; input.placeholder = "e.g. hero-title"; input.setAttribute("aria-label", "Class name"); const add = button("Add class", () => {}, ""); add.type = "submit";
      if (!context.className) form.append(node("p", "style-panel__hint", "Add a class to style this element in the site's CSS."));
      form.append(input, add);
      form.addEventListener("submit", (event) => { event.preventDefault(); const fresh = handlers.context(); const expected = currentContext(form.isConnected && fresh?.key === classSnapshot.expected?.key ? fresh : classSnapshot.expected); if (expected) void commit(() => handlers.addClass(input.value.replace(/^[\t\n\f\r ]+|[\t\n\f\r ]+$/g, ""), expected)); }); body.append(form);
    }
    if (!context.className) return;
    if (getCurrentBreakpoint() !== "all") body.append(button("Hide on this size", () => void write({ display: "none" }, context), "style-panel__hide"));
    const content = node("div", "style-panel__scroll");
    content.append(node("p", "style-panel__hint", "Muted values are computed. Clear a field to remove its declaration."));
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
          if (!result) { focal.details.remove(); filter(); restore(true); return; }
          const view = mountImageFocalPoint(focal.host, { mode: result.mode, previewAsset: result.asset,
            authored: own[result.mode], computed: widgetContext.computed[result.mode], fit: widgetContext.computed["object-fit"], size: widgetContext.computed["background-size"],
            expected: proof.captured, readOnly: () => busy || !!handlers.context()?.readOnly, isCurrent: () => proof.isCurrent(true),
            onChange: async properties => {
              if (!proof.isCurrent(true)) throw new Error("The image or style source changed. Retry with the current preview.");
              const target = proof.captured.expected.target;
              const rule = target && locateWriteRule(proof.captured.expected.files[target.path] ?? "", options());
              const declaration = document.createElement("div").style;
              declaration.cssText = (rule?.declarations ?? []).map(item => `${item.property}:${item.value};`).join("");
              const prioritized = Object.fromEntries(Object.entries(properties).map(([property, value]) => [property, value && declaration.getPropertyPriority(property) === "important" ? `${value} !important` : value]));
              await proof.change(prioritized);
            }, onError: report });
          widgets.push({ ...view, kind: "focal", isCurrent: () => proof.isCurrent(true) });
          filter(); restore(true);
        }).catch(error => { if (request === focalRequest && widgetRequest === widgetRender && focal.host.isConnected) { focal.details.remove(); restore(true); report(error); } });
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
      for (const details of content.querySelectorAll<HTMLDetailsElement>("details")) {
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
  return { root, update, dispose() { gestureEvents.abort(); if (gestureTimer) clearTimeout(gestureTimer); rebuildWidgets = undefined; widgetRender++; widgets.forEach(widget => widget.dispose()); widgets = []; closeVariableMenu(); unsubscribe(); resize.dispose(); root.remove(); } };
}
