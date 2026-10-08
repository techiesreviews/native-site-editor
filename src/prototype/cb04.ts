// PROTOTYPE (wayfinder ticket 04, components-and-builder). Throwaway; not kept for the real build.
//
// The flag and the hooks the editor calls. Everything else loads lazily from
// ./cb04-app.ts, and only when the page URL has ?proto=components.

import type { NativePreviewSelection } from "../components/native-preview";
import type { EditBarControl } from "../components/edit-bar";
import type { ComponentDeps } from "../page-builder/components";

const params = new URLSearchParams(typeof location === "undefined" ? "" : location.search);
export const cb04Active = () => params.get("proto") === "components";
export type Cb04Variant = "A" | "B" | "C" | "D" | "E";
export const cb04Variant = (): Cb04Variant => {
  const v = (params.get("variant") ?? "A").toUpperCase();
  return v === "B" || v === "C" || v === "D" || v === "E" ? v : "A";
};

/** Filled in by the lazy app (variant D): edit bar controls while a component is being made. */
export const cb04Hooks: { marking?: (selection: NativePreviewSelection) => EditBarControl[]; making?: () => boolean } = {};

/** Variant D's purple Editable toggle (+ slot name) for an element of the section being made. */
export function cb04MarkingControls(selection: NativePreviewSelection): EditBarControl[] {
  return cb04Active() ? cb04Hooks.marking?.(selection) ?? [] : [];
}

export interface Cb04Host {
  deps: ComponentDeps;
  editComponent: (tag: string) => Promise<void> | void;
}

const app = () => import("./cb04-app");

/** Called by createComponentTools (each mount); a no-op without the flag. */
export function cb04Install(host: Cb04Host) {
  if (!cb04Active()) return;
  void app().then((m) => m.install(host));
}

const CONTAINERS = new Set(["section", "article", "header", "footer", "aside", "nav", "figure", "div", "form", "main"]);

/** Edit bar buttons for a selected page element (not inside a template). */
export function cb04EditBarControls(selection: NativePreviewSelection): EditBarControl[] {
  if (!cb04Active() || cb04Hooks.making?.() || selection.host || !selection.node || !CONTAINERS.has(selection.tag) || selection.tag === "main") return [];
  return [{
    kind: "button",
    label: "Make component",
    title: "PROTOTYPE cb04: turn this element into a component",
    className: "edit-bar__component-action cb04-editbar-make",
    onPress: () => void app().then((m) => m.makeFromSelection(selection, "edit-bar")),
  }];
}

/** Files panel folder menu items (variant C entry for New component). */
export function cb04FileItems(folder: string): { label: string; run: () => void }[] {
  if (!cb04Active()) return [];
  return [{ label: "New component… (prototype)", run: () => void app().then((m) => m.newComponent("files", folder)) }];
}
