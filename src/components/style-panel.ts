import "./style-panel.css";
import { node, button } from "../ui/dom";
import { getCurrentBreakpoint, setCurrentBreakpoint, subscribeBreakpoint, type Breakpoint } from "../page-builder/breakpoints";
import { breakpointWidths } from "../page-builder/breakpoints";
import { writeCssProperties, validateCssSource, locateWriteRule, scanCss, siteVariables, resolveVariableValue, type CssTarget, type SiteVariable } from "../page-builder/css-write";

export type StyleState = "" | ":hover" | ":focus-visible";
export interface StylePanelContext {
  key: string; tag: string; className?: string; target?: CssTarget;
  files: Record<string, string>; computed: Record<string, string>; readOnly?: boolean;
}
export interface StylePanelHandlers {
  context: () => StylePanelContext | undefined;
  write: (properties: Record<string, string | null>, breakpoint: Breakpoint, state: StyleState, expected?: StylePanelContext) => Promise<void>;
  variable: (variable: SiteVariable, value: string, expected?: StylePanelContext) => Promise<void>;
  addClass: (name: string, expected?: StylePanelContext) => Promise<void>;
  history: (direction: "undo" | "redo") => void;
  error: (message: string) => void;
}
interface Field { label: string; property: string; options?: string[]; kind?: "space" | "type" | "color" | "font"; unit?: boolean }
const sides = ["top", "right", "bottom", "left"];
const sections: { title: string; fields: Field[] }[] = [
  { title: "Layout", fields: [
    { label: "Display", property: "display", options: ["block", "flex", "grid", "none", "inline", "inline-block", "inline-flex"] },
    { label: "Direction", property: "flex-direction", options: ["row", "column", "row-reverse", "column-reverse"] },
    { label: "Wrap", property: "flex-wrap", options: ["nowrap", "wrap", "wrap-reverse"] },
    { label: "Justify", property: "justify-content", options: ["flex-start", "center", "flex-end", "space-between", "space-around", "space-evenly"] },
    { label: "Align", property: "align-items", options: ["stretch", "flex-start", "center", "flex-end", "baseline"] },
    { label: "Gap", property: "gap", kind: "space", unit: true },
    { label: "Columns", property: "grid-template-columns" },
  ] },
  { title: "Size", fields: [
    { label: "Width", property: "width", unit: true }, { label: "Min width", property: "min-width", unit: true },
    { label: "Max width", property: "max-width", unit: true }, { label: "Height", property: "height", unit: true },
  ] },
  { title: "Typography", fields: [
    { label: "Font family", property: "font-family", kind: "font" },
    { label: "Font size", property: "font-size", kind: "type", unit: true },
    { label: "Weight", property: "font-weight", options: ["100", "200", "300", "400", "500", "600", "700", "800", "900", "normal", "bold"] },
    { label: "Line height", property: "line-height", kind: "type" }, { label: "Letter spacing", property: "letter-spacing", unit: true },
    { label: "Text align", property: "text-align", options: ["left", "center", "right", "justify", "start", "end"] },
    { label: "Text colour", property: "color", kind: "color" },
  ] },
  { title: "Background", fields: [ { label: "Background colour", property: "background-color", kind: "color" }, { label: "Background image", property: "background-image" } ] },
  { title: "Border", fields: [
    { label: "Border width", property: "border-width", unit: true }, { label: "Border style", property: "border-style", options: ["none", "solid", "dashed", "dotted", "double"] },
    { label: "Border colour", property: "border-color", kind: "color" },
    ...["top-left", "top-right", "bottom-right", "bottom-left"].map((corner) => ({ label: `${corner.replace("-", " ")} radius`, property: `border-${corner}-radius`, unit: true })),
  ] },
  { title: "Effects", fields: [ { label: "Opacity", property: "opacity" }, { label: "Box shadow", property: "box-shadow" }, { label: "Transition", property: "transition" }, { label: "Transform", property: "transform" }, { label: "Transform origin", property: "transform-origin" } ] },
];

/** A native controls panel. Commits on change; scrubs commit once on release. */
export function createStylePanel(handlers: StylePanelHandlers) {
  const root = node("aside", "style-panel");
  root.setAttribute("aria-label", "Style panel");
  const opener = button("Style", () => { collapsed = false; render(); }, "style-panel__opener");
  opener.setAttribute("aria-label", "Open Style panel");
  const body = node("div", "style-panel__body");
  root.append(opener, body);
  let collapsed = true, global = false, state: StyleState = "", key = "", busy = false;
  const links = { margin: false, padding: false };
  const opened = new Set(["Spacing"]);
  let pending = false, interacting = false;
  root.addEventListener("pointerdown", () => { interacting = true; }, true);
  root.addEventListener("pointerup", () => setTimeout(() => {
    interacting = false;
    if (pending && !root.contains(document.activeElement)) { pending = false; render(); }
  }, 0));
  root.addEventListener("pointercancel", () => { interacting = false; });
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
    // Preview refreshes must not destroy the field under the user's pointer.
    if (interacting || root.contains(document.activeElement)) { pending = true; refreshValues(); }
    else render();
  }
  root.addEventListener("focusout", () => queueMicrotask(() => {
    if (pending && !interacting && !root.contains(document.activeElement)) { pending = false; render(); }
  }));
  root.addEventListener("keydown", (event) => {
    if (event.key === "Escape") { collapsed = true; render(); opener.focus(); }
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
      style.setProperty(declaration.property, declaration.value.replace(/\s*!important\s*$/, ""));
    }
    for (const field of [...sections.flatMap((s) => s.fields), ...["margin", "padding"].flatMap((p) => sides.map((s) => ({ property: `${p}-${s}` })))]) {
      out[field.property] ||= style.getPropertyValue(field.property);
    }
    return out;
  }
  function refreshValues() {
    const context = handlers.context(), own = ownValues();
    renderContext = context; renderOwn = own;
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
      Object.keys(expected.files).some((path) => expected.files[path] !== current.files[path])) {
      report("The style target changed. Select the element again.");
      return undefined;
    }
    return expected;
  }
  const controlSnapshots = new Set<{ expected?: StylePanelContext }>();
  async function write(properties: Record<string, string | null>, snapshot = renderContext) {
    try { if (snapshot?.target) validateCssSource(snapshot.files[snapshot.target.path] ?? ""); } catch (error) { report(error); return; }
    const breakpoint = getCurrentBreakpoint(), currentState = state;
    const expected = currentContext(snapshot);
    if (!expected?.target) return;
    const target = expected.target;
    let written: string;
    try {
      written = writeCssProperties(expected.files[target.path] ?? "", { selector: target.selector, baseStart: target.start, breakpoint: breakpointWidths[breakpoint], state: currentState }, properties);
    } catch (error) { report(error); return; }
    if (!(await commit(() => handlers.write(properties, breakpoint, currentState, expected)))) return;
    const current = handlers.context();
    // Advance focused controls only after our exact source edit is visible.
    // An external edit, navigation or rejected host write cannot refresh them.
    if (!current || current.key !== expected.key || current.target?.path !== target.path || current.target?.selector !== target.selector || current.readOnly ||
      Object.keys(current.files).length !== Object.keys(expected.files).length ||
      Object.keys(expected.files).some((path) => current.files[path] !== (path === target.path ? written : expected.files[path]))) return;
    for (const snapshot of controlSnapshots) {
      const before = snapshot.expected;
      if (before?.key === expected.key && before.target?.path === target.path && before.target?.selector === target.selector &&
        Object.keys(before.files).every((path) => before.files[path] === expected.files[path])) snapshot.expected = current;
    }
  }
  function fieldControl(field: Field, variables: SiteVariable[], onChange?: (value: string, expected?: StylePanelContext) => Promise<void>) {
    const wrapper = node("div", "style-panel__control");
    const snapshot = { expected: renderContext };
    controlSnapshots.add(snapshot);
    const own = renderOwn[field.property] ?? "", computed = renderContext?.computed[field.property] ?? "";
    const apply = (value: string) => {
      if (!currentContext(snapshot.expected)) return;
      if (field.unit && /^-?(?:\d+\.?\d*|\.\d+)$/.test(value)) value += "px";
      if (field.property === "grid-template-columns" && /^\d+$/.test(value)) {
        if (+value < 1 || +value > 24) { report("Choose 1–24 grid columns, or enter a CSS template."); return; }
        value = `repeat(${value}, minmax(0, 1fr))`;
      }
      if (value && !CSS.supports(field.property, value.replace(/\s*!important\s*$/, ""))) { report(`Enter a valid ${field.label.toLowerCase()} value.`); return; }
      if (onChange) void onChange(value, snapshot.expected); else void write({ [field.property]: value }, snapshot.expected);
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
      input.addEventListener("keydown", (event) => { if (event.key === "Enter") { event.preventDefault(); input.blur(); } });
      control = input;
    }
    control.name = field.property; control.setAttribute("aria-label", field.label);
    control.dataset.property = field.property; control.value = own; control.classList.toggle("is-computed", !own);
    control.addEventListener("focus", () => { if (handlers.context()?.key === snapshot.expected?.key) snapshot.expected = handlers.context(); });
    control.addEventListener("change", () => apply(control.value.trim()));
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
  function render() {
    root.classList.toggle("is-collapsed", collapsed); root.parentElement?.classList.toggle("has-style-panel", !collapsed);
    opener.hidden = !collapsed; opener.setAttribute("aria-expanded", String(!collapsed)); body.hidden = collapsed;
    if (collapsed) return;
    const scrollTop = body.querySelector(".style-panel__scroll")?.scrollTop ?? 0;
    renderContext = handlers.context(); renderOwn = ownValues();
    controlSnapshots.clear();
    body.replaceChildren();
    const header = node("div", "style-panel__header"); header.append(node("strong", "", "Style"));
    const close = button("×", () => { collapsed = true; render(); opener.focus(); }, "style-panel__close"); close.setAttribute("aria-label", "Collapse Style panel"); header.append(close); body.append(header);
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
    const target = node("div", "style-panel__target", context.target?.selector ?? context.tag); target.title = context.target?.path ?? context.tag; body.append(target);
    if (context.readOnly) { body.append(node("p", "style-panel__hint", "This version is read only.")); return; }
    if (!context.className) {
      const form = node("form", "style-panel__add-class"); const input = node("input"); input.type = "text"; input.name = "class"; input.placeholder = "e.g. hero-title"; input.setAttribute("aria-label", "Class name"); const add = button("Add class", () => {}, ""); add.type = "submit";
      form.append(node("p", "style-panel__hint", "Add a class to style this element in the site's CSS."), input, add);
      form.addEventListener("submit", (event) => { event.preventDefault(); if (currentContext(context)) void commit(() => handlers.addClass(input.value.trim(), context)); }); body.append(form); return;
    }
    if (getCurrentBreakpoint() !== "all") body.append(button("Hide on this size", () => void write({ display: "none" }, context), "style-panel__hide"));
    const content = node("div", "style-panel__scroll");
    content.append(node("p", "style-panel__hint", "Muted values are computed. Clear a field to remove its declaration."));
    for (const title of ["Layout", "Spacing", "Size", "Typography", "Background", "Border", "Effects"]) {
      const details = node("details", "style-panel__section"); details.open = opened.has(title);
      const summary = node("summary", "style-panel__section-title", title); details.append(summary); details.addEventListener("toggle", () => { if (details.open) opened.add(title); else opened.delete(title); });
      if (title === "Spacing") details.append(spacing(variables));
      else for (const field of sections.find((s) => s.title === title)!.fields) {
        const row = node("div", "style-panel__field"); row.append(node("span", "", field.label), fieldControl(field, variables)); details.append(row);
      }
      content.append(details);
    }
    body.append(content); content.scrollTop = scrollTop;
  }
  render();
  return { root, update, dispose: unsubscribe };
}
