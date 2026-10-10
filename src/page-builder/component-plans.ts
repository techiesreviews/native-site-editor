// The component tools' guarded plans (sturdy-base slice 13; src/guarded-edit.ts):
// a slot chip's change, removing a part of a template, renaming a component.
// Each reads every file it depends on through `r`, empty and absent ones too,
// so one that changed meanwhile refuses the step instead of being left behind.
// DOM-free: tests/component-plans.test.ts runs them on the memory workspace.

import type { Planned, Reads } from "../guarded-edit";
import type { NativeSite } from "../../shared/native-project";
import { slotChange, slotChangePages, type SlotChange } from "./component-model";
import { templateRemoval } from "./remove";
import type { SlotChipReport } from "./edit-component-mode";
import type * as Rename from "./component-rename";

/** Every page and template of the site but `except`, read through `r` (an empty one is kept, an absent one recorded). */
export function siteFiles(r: Reads, except: string): { site: NativeSite | undefined; files: Record<string, string> } {
  const site = r.site(), files: Record<string, string> = {};
  for (const path of new Set([...Object.values(site?.routes ?? {}), ...Object.values(site?.components ?? {})])) {
    if (path === except) continue;
    const text = r.source(path);
    if (text !== undefined) files[path] = text;
  }
  return { site, files };
}

/** " 2 pages and 1 component using it follow." for the files besides the template that change with it. */
function followers(site: NativeSite | undefined, changed: Iterable<string>) {
  const routes = new Set(Object.values(site?.routes ?? {})), all = [...changed];
  const pages = all.filter(path => routes.has(path)).length;
  const counted = [[pages, "page"], [all.length - pages, "component"]].filter(([count]) => count)
    .map(([count, what]) => `${count} ${what}${count === 1 ? "" : "s"}`);
  return counted.length ? ` ${counted.join(" and ")} using it ${all.length === 1 ? "follows" : "follow"}.` : "";
}

const tagOf = (site: NativeSite | undefined, template: string) =>
  site ? Object.entries(site.components).find(([, file]) => file === template)?.[0] : undefined;

export type SlotChipPlanned = Planned & { change: SlotChange; source: string; node: number[] };

/** A slot chip's toggle or rename on `report.template`, with every page and template using the component following. */
export function slotChipPlan(r: Reads, report: SlotChipReport): SlotChipPlanned | { refuse: string } {
  const source = r.source(report.template);
  if (source === undefined) return { refuse: "The template is not available for editing." };
  const plan = slotChange(source, report, tag => r.template(tag)?.source);
  if ("error" in plan) return { refuse: plan.error };
  const { change } = plan;
  // Every page (and other template) using the component follows in the same step (decided at handoff 6).
  const { site, files } = siteFiles(r, report.template), tag = tagOf(site, report.template);
  const pages = tag ? slotChangePages(files, tag, plan.source, change) : new Map<string, string>();
  const name = change.kind === "renamed" ? undefined : change.name || "items";
  const done = (change.kind === "made-slot" ? `Made “${name}” a slot.` : change.kind === "made-fixed" ? `Made “${name}” fixed.`
    : `Renamed slot “${change.from || "items"}” to “${change.to}”.`) + followers(site, pages.keys());
  const undone = change.kind === "made-slot" ? `Undid making “${name}” a slot.` : change.kind === "made-fixed" ? `Undid making “${name}” fixed.`
    : `Undid renaming slot “${change.from || "items"}” to “${change.to}”.`;
  return {
    edits: new Map([[report.template, plan.source], ...pages]), done, undone, change, source: plan.source, node: plan.select,
    // The chip's caller selects the part again only while the user hasn't moved on.
    select: { before: { path: report.template, node: [...report.node] }, after: { path: report.template, node: plan.select }, historyOnly: true },
  };
}

/**
 * Removing the part at `node` of the template `path` (its slots go, and their fills on every page and
 * template using `tag`); `kind` names the part. Undefined when the part cannot be removed.
 */
export function templateRemovalPlan(r: Reads, path: string, node: readonly number[], tag: string, kind: string): (Planned & { node: number[] }) | { refuse: string } | undefined {
  const source = r.source(path);
  if (source === undefined) return { refuse: "The template is not available for editing." };
  const { site, files } = siteFiles(r, path);
  const plan = templateRemoval(source, node, files, tag);
  if (!plan) return undefined;
  const done = `${kind} removed` + (plan.slots.length ? `; ${plan.slots.map(name => `slot “${name || "items"}” removed`).join("; ")}.` : "") + followers(site, plan.pages.keys());
  return {
    edits: new Map([[path, plan.source], ...plan.pages]), done, undone: `Undid removing ${kind.toLowerCase()}.`, node: plan.select,
    select: { before: { path, node: [...node] }, after: { path, node: plan.select }, historyOnly: true },
  };
}

export type RenamePlanned = Planned & { tag: string; template: string; notes: string[] };

/**
 * Renaming the component `from` to the name `typed` (build slice 76): its files move, its instances
 * and the stylesheet rules naming it follow. Reads every page, template and stylesheet among `files`
 * through `r`, and each file it moves. `part` stays selected in the template. No edits: the name is the same.
 */
export function componentRenameStep(r: Reads, rename: typeof Rename, request: { from: string; typed: string; files: readonly string[]; part: readonly number[] }): RenamePlanned | { refuse: string } {
  const { from, files, part } = request;
  const site = r.site();
  if (!site) return { refuse: `The component <${from}> is not there any more.` };
  // A component's stylesheet it doesn't have is not read: only files that are there.
  const sources: Record<string, string> = {};
  for (const path of files) {
    if (!/\.(?:html?|css)$/i.test(path)) continue;
    const text = r.source(path);
    if (text !== undefined) sources[path] = text;
  }
  const renamed = rename.componentRenamePlan({ from, typed: request.typed, components: site.components, files, sources, pages: Object.values(site.routes) });
  if ("unchanged" in renamed) return { tag: from, template: site.components[from], notes: [], done: "", undone: "" };
  if ("error" in renamed) return { refuse: renamed.error };
  // Each file that moves is proved still there (an image in the folder too).
  for (const move of renamed.moves) r.exists(move.from);
  const { done, undone, notes } = rename.renameMessages(from, renamed);
  const templatePath = site.components[from];
  return {
    moves: renamed.moves, edits: renamed.edits, done, undone, tag: renamed.tag, template: renamed.template, notes,
    select: { before: { path: templatePath, node: [...part] }, after: { path: renamed.template, node: [...part] } },
  };
}
