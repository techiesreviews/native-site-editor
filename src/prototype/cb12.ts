// PROTOTYPE (wayfinder ticket 12, components-and-builder). Throwaway; not kept for the real build.
//
// The flag and the hooks the editor calls. Everything else loads lazily from
// ./cb12-app.ts, and only when the page URL has ?proto=blocks.

import type { NativePreviewSelection } from "../components/native-preview";
import type { EditBarControl } from "../components/edit-bar";
import type { ComponentDeps } from "../page-builder/components";

const params = new URLSearchParams(typeof location === "undefined" ? "" : location.search);
export const cb12Active = () => params.get("proto") === "blocks";
export type Cb12Variant = "A" | "B" | "C";
export const cb12Variant = (): Cb12Variant => {
  const v = (params.get("variant") ?? "A").toUpperCase();
  return v === "B" || v === "C" ? v : "A";
};

export interface Cb12Host { deps: ComponentDeps }

const app = () => import("./cb12-app");

/** Called by createComponentTools (each mount); a no-op without the flag. */
export function cb12Install(host: Cb12Host) {
  if (!cb12Active()) return;
  void app().then((m) => m.install(host));
}

// The frame script (measures the page for the prototype), emitted as-is like the runtime.
const FRAME_URL = new URL("./cb12-frame.js", import.meta.url).href;
/** A second script for the preview frame's document; empty without the flag. */
export function cb12FrameTag() {
  return cb12Active() ? `<script src="${FRAME_URL}" defer></script>` : "";
}

/** Edit bar buttons for a selected page element: a drag handle, and per variant a keyboard way. */
export function cb12EditBarControls(selection: NativePreviewSelection): EditBarControl[] {
  if (!cb12Active() || selection.host || !selection.node?.length || selection.tag === "main" || selection.tag === "body") return [];
  const variant = cb12Variant();
  const out: EditBarControl[] = [{
    kind: "button",
    label: "Drag to move",
    icon: "grip",
    title: variant === "A" ? "Drag to move (Enter: Move to…)" : variant === "B" ? "Drag to move (Enter: insert mode)" : "Drag to move (Enter: move in Structure with Alt+arrows)",
    className: "cb12-grip",
    onPress: () => void app().then((m) => m.gripPressed(selection)),
  }];
  if (variant === "A") out.push({ kind: "button", label: "Move to…", title: "PROTOTYPE cb12: pick where this block goes", className: "cb12-moveto", onPress: () => void app().then((m) => m.openMoveTo(selection)) });
  if (variant === "B") out.push({ kind: "button", label: "Move…", title: "PROTOTYPE cb12: insert mode (arrows walk the gap, Enter drops)", className: "cb12-moveto", onPress: () => void app().then((m) => m.gripPressed(selection)) });
  return out;
}
