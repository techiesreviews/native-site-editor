// The component tools' guarded plans (sturdy-base slice 13; src/guarded-edit.ts):
// a slot chip's change, removing a part of a template, renaming a component,
// making one from a page's element and adding a new one (its files are the
// step's creates, beside the page's edit: one undo step).
// Each reads every file it depends on through `r`, empty and absent ones too,
// so one that changed meanwhile refuses the step instead of being left behind.
// DOM-free: tests/component-plans.test.ts runs them on the memory workspace.

import type { Planned, Reads } from "../guarded-edit";
import { nativePageStylesheets, type NativeSite } from "../../shared/native-project";
import { expandStyleImports } from "../../shared/css-imports";
import { slotChange, slotChangePages, tagNameProblem, type InstanceRange, type MakeComponentPlan, type RangeEdit, type SlotChange } from "./component-model";
import { blankComponentFiles } from "./blank-component";
import type { ComponentLoaderPlan } from "./component-loader";
import type * as Css from "./component-css";
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

/** A component loader plan (slice 103) with the proof its host read it under. */
export interface PreparedComponentLoader extends ComponentLoaderPlan {
  expectedSources: Map<string, string | undefined>;
  current(): boolean;
}
/** Plans the component loader for the page `path` reading `next` (src/main.ts): why not, nothing needed, or the plan. */
export type LoaderPlanner = (path: string, next: string) => Promise<PreparedComponentLoader | string | undefined>;

/** The files Make component writes: the component's template and CSS, then each card component's. */
export function madeFiles(tag: string, made: MakeComponentPlan) {
  return [{ tag, template: made.template, css: made.css }, ...made.cards].flatMap((component) => [
    { path: `components/${component.tag}/${component.tag}.html`, content: component.template },
    { path: `components/${component.tag}/${component.tag}.css`, content: component.css },
  ]);
}
export const madeMessage = (tag: string, made: MakeComponentPlan) =>
  `Made the component <${tag}>: components/${tag}/${tag}.html${made.cards.map((card) => `, and <${card.tag}>`).join("")}`;

/**
 * The loader's part of the step, its pages read through `r`: still the bytes it was planned from, or the refusal.
 * (Its own proof, `current`, guards the whole site and file list from the plan to the write.)
 */
function loaderReads(r: Reads, loader: PreparedComponentLoader, changed: string): string | undefined {
  for (const path of loader.edits.keys()) if (r.source(path) !== loader.expectedSources.get(path)) return changed;
  return undefined;
}

export type MadePlanned = Planned & { made: MakeComponentPlan; loader?: PreparedComponentLoader };

/**
 * Make component (build slice 22): the element at `range` of the page `path`, read as `source`, becomes an
 * instance of `tag` (`bare`: the plan before the page's CSS), with the page CSS that styled it (slice 64, read
 * through `r` from the page's stylesheets), the component's files (and its cards') created, and the component
 * loader when the site lacks it (slice 103): one undo step.
 */
export async function makeComponentStep(r: Reads, input: {
  path: string; source: string; range: InstanceRange; node: readonly number[]; tag: string; bare: MakeComponentPlan;
  carry: typeof Css; loader?: LoaderPlanner;
}): Promise<MadePlanned | { refuse: string }> {
  const { path, source, range, tag } = input;
  const changed = "The page, its styles or the repository changed meanwhile; no component was made.";
  if (r.source(path) !== source) return { refuse: changed };
  // The names were chosen against the component map: it is read (and proved) too.
  const taken = new Set(Object.keys(r.site()?.components ?? {}));
  if ([tag, ...input.bare.cards.map(card => card.tag)].some(name => taken.has(name))) return { refuse: changed };
  const linked = nativePageStylesheets(source, path).filter(file => r.source(file) !== undefined);
  const sheets = expandStyleImports(linked, file => r.source(file)).sheets;
  const made = input.carry.withPageCss(input.bare, source, range, tag, sheets);
  const next = source.slice(0, range.start) + made.instance + source.slice(range.end);
  const loader = await input.loader?.(path, next);
  if (typeof loader === "string") return { refuse: loader };
  const problem = loader && loaderReads(r, loader, changed);
  if (problem) return { refuse: problem };
  const at = { path, node: [...input.node] };
  return {
    edits: new Map([[path, next], ...loader?.edits ?? []]), creates: [...madeFiles(tag, made), ...loader?.creates ?? []],
    select: { before: at, after: at }, made, loader,
    done: loader?.added ? `${madeMessage(tag, made)}. ${loader.added}` : madeMessage(tag, made),
    undone: loader?.added ? `Undid making <${tag}> and adding the component loader.` : `Undid making <${tag}>.`,
  };
}

export type NewPlanned = Planned & { loader?: PreparedComponentLoader };

/**
 * A new blank section component `tag` (its files created) and its instance put into the page `path`, read
 * as `source`, at `node` (`insert`: the instance's edit in the page's bytes), with the component loader when
 * the site lacks it: one undo step.
 */
export async function newComponentStep(r: Reads, input: {
  path: string; source: string; node: readonly number[]; tag: string; before?: { path: string; node: number[] };
  insert: (page: string, template: string) => RangeEdit | undefined; loader?: LoaderPlanner;
}): Promise<NewPlanned | { refuse: string }> {
  const { path, source, tag } = input;
  const changed = "The page or repository changed meanwhile; no component was made.";
  if (r.source(path) !== source) return { refuse: changed };
  const problem = tagNameProblem(tag, Object.keys(r.site()?.components ?? {}));
  if (problem) return { refuse: problem };
  const files = blankComponentFiles(tag);
  const edit = input.insert(source, files[0].content);
  if (!edit) return { refuse: "The insertion point changed; choose the destination again." };
  const next = source.slice(0, edit.start) + edit.text + source.slice(edit.end);
  const loader = await input.loader?.(path, next);
  if (typeof loader === "string") return { refuse: loader };
  const stale = loader && loaderReads(r, loader, changed);
  if (stale) return { refuse: stale };
  return {
    edits: new Map([[path, next], ...loader?.edits ?? []]), creates: [...files, ...loader?.creates ?? []], loader,
    select: { before: input.before, after: { path, node: [...input.node] } },
    done: `Made the component <${tag}>: components/${tag}/${tag}.html${loader?.added ? `. ${loader.added}` : ""}`,
    undone: loader?.added ? `Undid making <${tag}> and adding the component loader.` : `Undid making <${tag}>.`,
  };
}
