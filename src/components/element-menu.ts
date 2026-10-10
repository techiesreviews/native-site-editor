import type { NativePreviewSelection } from "./native-preview";
import type { MenuItem } from "./row-menu";

export type ElementMenuTarget = Pick<NativePreviewSelection, "path" | "node" | "tag" | "host" | "paintedSource">
  // A Structure row's own slot badge, for Rename slot (the canvas uses the edit bar's label chip).
  & { renameChip?: () => HTMLElement | undefined };
export type ElementMenuProvider = (target: ElementMenuTarget) => MenuItem[];

export function elementMenuItems(target: ElementMenuTarget, providers: ElementMenuProvider[]): MenuItem[] {
  return providers.flatMap(provider => provider(target));
}
