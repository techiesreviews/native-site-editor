import type { NativePreviewSelection } from "./native-preview";
import type { MenuItem } from "./row-menu";

export type ElementMenuTarget = Pick<NativePreviewSelection, "path" | "node" | "tag" | "host">;
export type ElementMenuProvider = (target: ElementMenuTarget) => MenuItem[];

export function elementMenuItems(target: ElementMenuTarget, providers: ElementMenuProvider[]): MenuItem[] {
  return providers.flatMap(provider => provider(target));
}
