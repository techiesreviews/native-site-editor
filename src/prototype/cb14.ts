// PROTOTYPE (wayfinder ticket 14, components-and-builder). Throwaway; not kept for the real build.
//
// The flag and the hooks the editor calls. Everything else loads lazily from
// ./cb14-app.ts, and only when the page URL has ?proto=template.
//
// Hooks (each line marked `// PROTOTYPE cb14`):
//   components.ts       cb14Install, cb14InterceptEdit (top of editComponent),
//                       cb14EditBarControls (an instance's edit bar)
//   native-preview.ts   cb14FrameTag (the frame script beside the runtime)

import type { NativePreviewSelection } from "../components/native-preview";
import type { EditBarControl } from "../components/edit-bar";
import type { ComponentDeps } from "../page-builder/components";

const params = new URLSearchParams(typeof location === "undefined" ? "" : location.search);
export const cb14Active = () => params.get("proto") === "template";
export type Cb14Variant = "A" | "B" | "C";
export const cb14Variant = (): Cb14Variant => {
  const v = (params.get("variant") ?? "A").toUpperCase();
  return v === "B" || v === "C" ? v : "A";
};

export interface Cb14Host {
  deps: ComponentDeps;
  /** The editor's own Edit component (opens the template in the code pane, permits template edits in the preview). */
  editComponent: (tag: string) => Promise<void>;
}

const app = () => import("./cb14-app");
let hostDeps: ComponentDeps | undefined;
let bypass = false;

/** Called by createComponentTools (each mount); a no-op without the flag. */
export function cb14Install(host: Cb14Host) {
  if (!cb14Active()) return;
  hostDeps = host.deps;
  const wrapped: Cb14Host = {
    deps: host.deps,
    // The prototype's own calls go straight through (the flag is read synchronously at the top).
    editComponent: (tag) => { bypass = true; try { return host.editComponent(tag); } finally { bypass = false; } },
  };
  void app().then((m) => m.install(wrapped));
}

/**
 * The top of editComponent: every entry (edit bar name, Structure row, Used on,
 * after Create) comes to the prototype's Edit component mode instead.
 * True when the prototype took it.
 */
export function cb14InterceptEdit(tag: string) {
  if (!cb14Active() || bypass) return false;
  void app().then((m) => m.requestEdit(tag));
  return true;
}

// The frame script (fallback swap, the stage, measurements), emitted as-is like the runtime.
const FRAME_URL = new URL("./cb14-frame.js", import.meta.url).href;
/** A second script for the preview frame's document; empty without the flag. */
export function cb14FrameTag() {
  return cb14Active() ? `<script src="${FRAME_URL}" defer></script>` : "";
}

/** An instance's edit bar: an explicit "Edit component" (the name chip does it too). */
export function cb14EditBarControls(selection: NativePreviewSelection): EditBarControl[] {
  if (!cb14Active() || !hostDeps) return [];
  const site = hostDeps.site();
  if (!site || !Object.hasOwn(site.components, selection.tag)) return [];
  const tag = selection.tag;
  return [{
    kind: "button",
    label: "Edit component",
    title: `PROTOTYPE cb14: edit <${tag}>'s template here, visually`,
    className: "cb14-edit-button",
    onPress: () => void app().then((m) => m.requestEdit(tag)),
  }];
}
