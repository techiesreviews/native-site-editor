// Side by side with the page: its stylesheet, and after a click in the
// preview, every rule that styles the selected element in the order the
// cascade applies them (shared/cascade.ts): rules that decide the element's
// look first, rules whose declarations all lose last. An edit to either file
// re-maps the rules to their source. The host (src/main.ts) keeps the drafts,
// the preview, the editor and the native site, and hands them in as live ports.

import type { DeclarationStatus, RuleStatus } from "../../shared/cascade";
import { nativeComponentCssPath, type NativeSite } from "../../shared/native-project";
import { isNewDraft } from "../../shared/site-overlay";
import type { SessionInfo, TreeEntry } from "../../shared/types";
import type { VariantFiles } from "../../shared/variant-lookup";
import type { AppStore } from "../app-store";
import type { NativePreviewSelection } from "../components/native-preview";
import type * as SourceEditor from "../components/source-editor";
import { draftKey, type DraftScope, type SavedDraft } from "../drafts";
import { locateNativeElement } from "../native-source-location";
import type { CssWorkspace } from "../page-builder/css-intelligence";
import { resolveSelectedRules, ruleOrigin, type NativeCascade, type NativeSelectedRule } from "../style-cascade";
import { declarationRanges, findStyleRulesInSources, type StyleRule } from "../styles-index";
import { button, node } from "../ui/dom";
import type { SessionStamp } from "../workspace-session";

// A rule in the Source editor rule chips: its range in its file and how the cascade treats it.
interface LinkedRule extends StyleRule {
  rule: NativeSelectedRule;
  status: RuleStatus;
  // Per declaration of `rule.declarations`, and for an overridden one the rule that wins its property.
  declarations: DeclarationStatus[];
  winners: (NativeSelectedRule | undefined)[];
}
// Rules the preview matched on an element, with what resolves them.
interface NativeStyles {
  rules: NativeSelectedRule[];
  cascade?: NativeCascade;
  // The element, for its `style` attribute's range in the source.
  node?: number[];
}

export interface LinkedStylesPorts {
  appStore: Pick<AppStore, "openFile" | "repository" | "snapshot">;
  workspaceSession: { begin(): SessionStamp };
  editorModule: Pick<typeof SourceEditor, "mountSourceEditor" | "highlightRanges" | "revealRange">;
  /** Host state, read at call time. */
  readonly info: Pick<SessionInfo, "user">;
  readonly nativeSite: NativeSite | undefined;
  /** The live primary pane's journal, which the stylesheet beside it shares. */
  readonly primaryHistoryScope: { key: string; session: string; proof: { isCurrent(): boolean } } | undefined;
  readonly nativeVariantFiles: VariantFiles;
  element(id: string): HTMLElement;
  nativeModeActive(): boolean;
  nativeSources(): Record<string, string>;
  nativePageStyles(): string[];
  nativeEffectiveSource(path: string): string | undefined;
  nativeComponentTagForPath(path: string): string | undefined;
  /** A free function: the editor calls it without a receiver. */
  nativeCssWorkspace: () => CssWorkspace | undefined;
  nativeHistorySession(scope: DraftScope, path: string): string;
  draftScope(): DraftScope | undefined;
  draftStore(): { get(scope: DraftScope, path: string): SavedDraft | undefined };
  findEntry(path: string): Promise<TreeEntry | undefined>;
  readFile(repo: string, sha: string): Promise<string>;
  /** The code panes' width handle (src/controllers/code-panes-controller.ts). */
  applyWidth(): void;
  updateNativePreviewSources(): void;
  refreshFiles(): void;
  /** The guarded edit module, told of the stylesheet the pane mounts. */
  mounted(path: string, pane: boolean): void;
  errorMessage(error: unknown): void;
}

export function createLinkedStylesController(ports: LinkedStylesPorts) {
  const { appStore, editorModule } = ports;
  const linkedStyleSourceByPath = new Map<string, string>();
  let linkedStyleContext = "";
  function syncLinkedStyles(path: string, content: string) {
    const context = `${ports.info.user?.login}:${appStore.repository.value?.id}:${appStore.snapshot.value?.branch}`;
    if (linkedStyleContext !== context) {
      linkedStyleSourceByPath.clear();
      linkedStyleContext = context;
    }
    const previous = linkedStyleSourceByPath.get(path);
    linkedStyleSourceByPath.set(path, content);
    if (previous !== content && linkedStyle && (path === linkedStyle.page || path === secondaryPath)) void refreshLinkedStyleRules();
  }
  let linkedStyle: { page: string; css?: string; rules: LinkedRule[]; isDefault?: boolean } | undefined;
  let nativeLinkedStyles: NativeStyles | undefined;
  // The rules styling the preview's <body>: with nothing selected, the first
  // stylesheet among them opens beside a page.
  let nativeBodyStyles: NativeStyles | undefined;
  let linkedStyleRequest = 0;
  let disposeSecondary: (() => void) | undefined;
  let secondaryPath: string | undefined;
  let secondaryHistoryScope: string | undefined;
  let secondaryRequest = 0;

  // The cascade over `styles`, in display order, mapped to source ranges. A
  // rule whose declarations the CSSOM splits around nested rules is one entry.
  function linkedRules(styles: NativeStyles): LinkedRule[] {
    const sources = ports.nativeSources();
    const result = resolveSelectedRules(styles.rules, styles.cascade);
    const found = new Map<number, StyleRule[]>();
    const lookups = styles.rules.map((rule) => rule.kind === "inline" ? { path: "", selector: "" } : rule);
    for (const rule of findStyleRulesInSources(sources, lookups)) {
      if (!found.has(rule.match)) found.set(rule.match, []);
      found.get(rule.match)!.push(rule);
    }
    styles.rules.forEach((rule, index) => {
      const source = sources[rule.path];
      const tag = rule.kind === "inline" && styles.node && source !== undefined ? locateNativeElement(source, styles.node) : undefined;
      if (tag) found.set(index, [{ path: rule.path, selector: rule.selector, start: tag.start, end: tag.end, match: index }]);
    });
    const winner = (property: string) => {
      const at = result.winners[property];
      return at ? styles.rules[at.rule] : undefined;
    };
    const out: LinkedRule[] = [];
    const byRange = new Map<string, LinkedRule>();
    for (const index of result.order) {
      const rule = styles.rules[index];
      const statuses = result.declarations[index];
      const winners = (rule.declarations ?? []).map((item, n) => statuses[n] === "overridden" ? winner(item.property) : undefined);
      for (const located of found.get(index) ?? []) {
        const key = `${located.path}\n${located.start}\n${located.end}`;
        const same = byRange.get(key);
        if (!same) {
          const linked: LinkedRule = { ...located, rule, status: result.rules[index], declarations: statuses, winners };
          byRange.set(key, linked);
          out.push(linked);
          continue;
        }
        same.rule = { ...same.rule, declarations: [...(same.rule.declarations ?? []), ...(rule.declarations ?? [])] };
        same.declarations = [...same.declarations, ...statuses];
        same.winners = [...same.winners, ...winners];
        same.status = same.status === "wins" || result.rules[index] === "wins" ? "wins"
          : same.status === "overridden" && result.rules[index] === "overridden" ? "overridden" : "neutral";
      }
    }
    return out;
  }

  function defaultLinkedStyle() {
    if (!ports.nativeSite) return undefined;
    const rules = nativeBodyStyles ? linkedRules(nativeBodyStyles) : [];
    const css = rules.find((rule) => /\.css$/.test(rule.path))?.path ?? ports.nativePageStyles()[0];
    return css ? { css, rules } : undefined;
  }
  async function openDefaultLinkedStyle(page = appStore.openFile.value) {
    const found = defaultLinkedStyle();
    if (!page || !found) return false;
    const request = ++linkedStyleRequest;
    const at = ports.workspaceSession.begin();
    nativeLinkedStyles = nativeBodyStyles;
    linkedStyle = { page, css: found.css, rules: found.rules.length ? found.rules : linkedStyleIdle, isDefault: true };
    if (!(await openSecondary(found.css))) return false;
    if (request !== linkedStyleRequest || !at.holds() || linkedStyle?.page !== page) return false;
    renderLinkedStyle();
    return true;
  }
  // New <body> rules from the preview: a page showing them follows, opening
  // another stylesheet when the cascade now puts another one first.
  function updateBodyStyles(styles: NativeStyles) {
    nativeBodyStyles = styles;
    if (!linkedStyle?.isDefault || linkedStyle.page !== appStore.openFile.value) return;
    const found = defaultLinkedStyle();
    if (found && found.css === linkedStyle.css) {
      nativeLinkedStyles = styles;
      linkedStyle = { ...linkedStyle, rules: found.rules.length ? found.rules : linkedStyleIdle };
      renderLinkedStyle();
    } else void openDefaultLinkedStyle(linkedStyle.page);
  }
  function closeSecondary() {
    secondaryRequest++;
    disposeSecondary?.();
    disposeSecondary = undefined;
    secondaryPath = undefined;
    secondaryHistoryScope = undefined;
    ports.element("secondary-pane").hidden = true;
    ports.element("main").classList.remove("has-secondary");
    ports.applyWidth();
  }
  // Opens `css` in the secondary pane (or keeps it if already there), then resolves.
  async function openSecondary(css: string, guard: () => boolean = () => true) {
    if (!appStore.repository.value || !appStore.snapshot.value || !ports.info.user || !guard()) return false;
    const request = ++secondaryRequest;
    const scope = {
      account: ports.info.user.login,
      repoId: appStore.repository.value.id,
      repo: appStore.repository.value.full_name,
      branch: appStore.snapshot.value.branch,
    };
    const primaryKey = appStore.openFile.value ? draftKey(scope, appStore.openFile.value) : undefined;
    const primary = primaryKey && ports.primaryHistoryScope?.key === primaryKey && ports.primaryHistoryScope.proof.isCurrent() ? ports.primaryHistoryScope : undefined;
    const historyScope = primary?.session ?? (appStore.openFile.value ? ports.nativeHistorySession(scope, appStore.openFile.value) : undefined);
    const current = () => {
      const liveScope = ports.draftScope();
      return guard() && (!primary || ports.primaryHistoryScope === primary && primary.proof.isCurrent() &&
        !!appStore.openFile.value && !!liveScope && draftKey(liveScope, appStore.openFile.value) === primary.key);
    };
    if (ports.draftStore().get(scope, css)?.deleted) return false;
    if (secondaryPath === css && secondaryHistoryScope === historyScope && disposeSecondary) return true;
    try {
      // A stylesheet only in the drafts (a new component's) opens from its draft.
      const draft = ports.draftStore().get(scope, css);
      const created = isNewDraft(draft, { uploads: false });
      const entry = created ? undefined : await ports.findEntry(css);
      if (!current() || request !== secondaryRequest) return false;
      if (!created && (!entry || (entry.size ?? 0) > 1024 * 1024)) throw new Error(`Could not open ${css}.`);
      // The stylesheet's source editor mounts at once; its code shows with Monaco.
      const source = entry ? await ports.readFile(scope.repo, entry.sha) : "";
      if (request !== secondaryRequest || !current() || ports.draftStore().get(scope, css)?.deleted) return false;
      disposeSecondary?.();
      ports.element("secondary-pane").hidden = false;
      ports.element("main").classList.add("has-secondary");
      ports.applyWidth();
      disposeSecondary = editorModule.mountSourceEditor(
        ports.element("content-secondary"),
        { key: draftKey(scope, css), historyScope, cssWorkspace: ports.nativeCssWorkspace, variants: ports.nativeVariantFiles, scope, baseSha: entry?.sha ?? null, path: css, source, readOnly: entry?.mode === "120000",
          onContextChange: (value) => {
            if (value) {
              syncLinkedStyles(value.path, value.content);
              if (ports.nativeModeActive()) ports.updateNativePreviewSources();
            }
            ports.refreshFiles();
          } },
        null,
      );
      secondaryPath = css;
      secondaryHistoryScope = historyScope;
      ports.mounted(css, true);
      return true;
    } catch (error) {
      if (request === secondaryRequest) ports.errorMessage(error);
      return false;
    }
  }
  // Title and rule chips of the secondary pane; highlights the rules in both
  // panes, crossing out the declarations the cascade overrides.
  function renderLinkedStyle() {
    const linked = linkedStyle;
    const title = ports.element("secondary-title");
    const chips = ports.element("secondary-rules");
    chips.replaceChildren();
    if (!linked || !secondaryPath) return;
    title.textContent = secondaryPath;
    const inPane = (path: string) => linked.rules.filter((rule) => rule.path === path).map(ruleMarks);
    editorModule?.highlightRanges(secondaryPath, inPane(secondaryPath));
    if (appStore.openFile.value && appStore.openFile.value !== secondaryPath) editorModule?.highlightRanges(appStore.openFile.value, inPane(appStore.openFile.value));
    if (!linked.rules.length) {
      if (linked.rules !== linkedStyleIdle) chips.append(node("span", "muted", "No rules match this element"));
      return;
    }
    for (const rule of linked.rules) chips.append(ruleChip(rule));
  }
  const linkedStyleIdle: LinkedRule[] = [];

  // Longhands a property sets, as this browser expands it (itself for a longhand).
  const longhandCache = new Map<string, string[]>();
  function longhandsOf(property: string) {
    if (!longhandCache.has(property)) {
      const style = document.createElement("div").style;
      if (!property.startsWith("--")) style.setProperty(property, "inherit");
      const list = Array.from(style);
      longhandCache.set(property, list.length ? list : [property]);
    }
    return longhandCache.get(property)!;
  }

  // A rule's highlight: the whole rule, dimmed when all of it is overridden,
  // and each declaration in its source whose longhands are all overridden.
  function ruleMarks(rule: LinkedRule) {
    const struck: { start: number; end: number }[] = [];
    const source = ports.nativeSources()[rule.path];
    if (rule.rule.kind !== "inline" && source !== undefined) {
      const items = rule.rule.declarations ?? [];
      for (const declaration of declarationRanges(source, rule.start, rule.end)) {
        const longhands = new Set(longhandsOf(declaration.property));
        const statuses = items.flatMap((item, index) =>
          longhands.has(item.property) || item.shorthand === declaration.property ? [rule.declarations[index]] : []);
        if (statuses.length && statuses.every((status) => status === "overridden")) struck.push(declaration);
      }
    }
    return { start: rule.start, end: rule.end, overridden: rule.status === "overridden", struck };
  }

  const fileName = (path: string) => path.split("/").pop() ?? path;

  // A chip per rule: its selector, where it comes from (context, layer,
  // conditions, state), its file when that is not the pane's, and a tooltip
  // listing its declarations with what the cascade makes of each.
  function ruleChip(rule: LinkedRule) {
    const origin = ruleOrigin(rule.rule);
    const inline = rule.rule.kind === "inline";
    const chip = button("", () => void revealRule(rule), `code-pane__rule code-pane__rule--${rule.status}`);
    chip.append(node("span", "code-pane__rule-selector", inline ? "style=\"…\"" : rule.selector));
    const layer = origin.layer === "unlayered" ? "" : origin.layer.replace(/^@layer /, "");
    const tags = [inline ? "" : origin.context, layer, ...origin.conditions.map((condition) => condition.split(" ")[0]),
      ...origin.state.filter((state) => !rule.selector.includes(state))].filter(Boolean);
    if (tags.length) chip.append(node("span", "code-pane__rule-origin", [...new Set(tags)].join(" ")));
    if (rule.path !== secondaryPath) chip.append(node("span", "code-pane__rule-file", fileName(rule.path)));
    const items = rule.rule.declarations ?? [];
    const having = (status: DeclarationStatus) => [...new Set(items.filter((_, index) => rule.declarations[index] === status).map((item) => item.property))];
    chip.dataset.cascade = rule.status;
    chip.dataset.wins = having("wins").join(" ");
    chip.dataset.overridden = having("overridden").join(" ");
    chip.title = ruleTooltip(rule);
    return chip;
  }

  const MAX_TOOLTIP_DECLARATIONS = 14;
  function ruleTooltip(rule: LinkedRule) {
    const origin = ruleOrigin(rule.rule);
    const lines = [
      rule.rule.kind === "inline" ? "style attribute" : rule.selector,
      rule.path + (rule.rule.importer ? ` (imported by ${rule.rule.importer})` : ""),
      [origin.context, origin.layer, ...origin.conditions, ...origin.state.map((state) => `in ${state} state`)].filter(Boolean).join(" · "),
    ];
    // A shorthand written with var() is one line, not one per longhand.
    const seen = new Set<string>();
    const described = (rule.rule.declarations ?? []).flatMap((item, index) => {
      const text = `${item.shorthand ?? item.property}: ${item.value}${item.important ? " !important" : ""}`;
      const status = rule.declarations[index];
      const by = rule.winners[index];
      const line = status === "overridden" ? `✕ ${text} — overridden${by ? ` by ${by.kind === "inline" ? "style attribute" : by.selector} (${fileName(by.path)})` : ""}`
        : status === "wins" ? `✓ ${text}`
        : status === "inactive" ? `· ${text} — @container not met`
        : status === "state" ? `· ${text} — ${origin.state.join(", ")} only`
        : `· ${text} — not verified`;
      if (seen.has(line)) return [];
      seen.add(line);
      return [line];
    });
    if (described.length > MAX_TOOLTIP_DECLARATIONS) described.splice(MAX_TOOLTIP_DECLARATIONS, Infinity, `… ${described.length - MAX_TOOLTIP_DECLARATIONS} more`);
    return [...lines.filter(Boolean), ...described].join("\n");
  }

  async function revealRule(rule: StyleRule) {
    if (rule.path === appStore.openFile.value) {
      editorModule?.revealRange(rule.path, rule.start, rule.end);
      return;
    }
    if (rule.path !== secondaryPath) {
      if (!(await openSecondary(rule.path))) return;
      renderLinkedStyle();
    }
    editorModule?.revealRange(rule.path, rule.start, rule.end);
  }

  function refreshLinkedStyleRules() {
    if (!appStore.repository.value || !appStore.snapshot.value || !linkedStyle || !nativeLinkedStyles?.rules.length || !ports.nativeModeActive()) return;
    const page = linkedStyle.page;
    if (page !== appStore.openFile.value) return;
    linkedStyle = { ...linkedStyle, rules: linkedRules(nativeLinkedStyles) };
    renderLinkedStyle();
  }

  async function linkNativeStyles(selection: NativePreviewSelection, reveal: boolean) {
    const request = reveal ? ++linkedStyleRequest : linkedStyleRequest;
    const at = ports.workspaceSession.begin();
    const page = selection.path;
    // An element no rule matches shows what it inherits from: the <body> rules.
    const styles = selection.selectors.length
      ? { rules: selection.selectors, cascade: selection.cascade, node: selection.node }
      : nativeBodyStyles;
    if (!reveal && (!styles?.rules.length || !secondaryPath)) return;
    nativeLinkedStyles = styles;
    const rules = styles ? linkedRules(styles) : [];
    if (request !== linkedStyleRequest || !at.holds() || page !== appStore.openFile.value) return;
    // Explicit template entry keeps its authored stylesheet when the selected
    // template element has no direct rules, rather than using page-body rules.
    const componentCss = page && ports.nativeComponentTagForPath(page) && !selection.selectors.length
      ? nativeComponentCssPath(page) : undefined;
    const scope = ports.draftScope();
    const componentDraft = componentCss && scope ? ports.draftStore().get(scope, componentCss) : undefined;
    const fallbackCss = componentCss && !componentDraft?.deleted && !componentDraft?.upload && !componentDraft?.opaque &&
      ports.nativeEffectiveSource(componentCss) !== undefined ? componentCss : undefined;
    const css = fallbackCss ?? rules.find((rule) => rule.path !== page)?.path ??
      styles?.rules.find((rule) => rule.path !== page)?.path ?? defaultLinkedStyle()?.css ?? secondaryPath;
    if (!reveal && css !== secondaryPath) {
      // Code selection updates matching rules without moving the open CSS pane.
      linkedStyle = { page, css: secondaryPath, rules };
      renderLinkedStyle();
      return;
    }
    linkedStyle = { page, css, rules };
    const current = () => {
      const draft = fallbackCss && scope ? ports.draftStore().get(scope, fallbackCss) : undefined;
      return request === linkedStyleRequest && at.holds() && page === appStore.openFile.value &&
        (!fallbackCss || (!draft?.deleted && !draft?.upload && !draft?.opaque && ports.nativeEffectiveSource(fallbackCss) !== undefined));
    };
    if (css && !(await openSecondary(css, current))) return;
    if (!current()) return;
    if (!css) closeSecondary();
    renderLinkedStyle();
    // The first rule in the pane's file, which decides the most; the page's
    // own caret stays on the selected element.
    const top = rules.find((rule) => rule.path === css);
    if (reveal && top && top.path !== page) editorModule?.revealRange(top.path, top.start, top.end);
  }

  // The component's same-named `.css` in the secondary pane, with no rule chips
  // until an element is selected; the shared stylesheet when it has none.
  async function openComponentLinkedStyle(page: string) {
    const css = nativeComponentCssPath(page);
    const request = ++linkedStyleRequest;
    const at = ports.workspaceSession.begin();
    const scope = ports.draftScope();
    if (!scope) return false;
    const draft = ports.draftStore().get(scope, css);
    // A new component's stylesheet may exist only in drafts, as openSecondary
    // already supports. A branch-tree miss must not hide that authored file.
    const created = isNewDraft(draft, { uploads: false });
    const entry = created ? undefined : await ports.findEntry(css);
    if (request !== linkedStyleRequest || !at.holds() || appStore.openFile.value !== page) return false;
    const latestDraft = ports.draftStore().get(scope, css);
    if (latestDraft?.deleted || latestDraft?.upload || latestDraft?.opaque ||
        (!entry && !isNewDraft(latestDraft, { uploads: false }))) return openDefaultLinkedStyle(page);
    nativeLinkedStyles = undefined;
    linkedStyle = { page, css, rules: linkedStyleIdle };
    const current = () => {
      const draft = ports.draftStore().get(scope, css);
      return request === linkedStyleRequest && at.holds() && appStore.openFile.value === page &&
        linkedStyle?.page === page && linkedStyle.css === css && !draft?.deleted && !draft?.upload && !draft?.opaque &&
        Boolean(entry || isNewDraft(draft, { uploads: false }));
    };
    if (!(await openSecondary(css, current))) return false;
    if (request !== linkedStyleRequest || !at.holds() || linkedStyle?.page !== page) return false;
    renderLinkedStyle();
    return true;
  }

  return {
    syncLinkedStyles,
    updateBodyStyles,
    openDefaultLinkedStyle,
    openComponentLinkedStyle,
    openSecondary,
    closeSecondary,
    renderLinkedStyle,
    linkNativeStyles,
    /** The stylesheet the secondary pane shows. */
    secondaryPath: () => secondaryPath,
    /** The page the linked stylesheet belongs to. */
    linkedPage: () => linkedStyle?.page,
    /** Another page's stylesheet does not carry over: the link goes and the pane closes. */
    unlink() {
      linkedStyle = undefined;
      closeSecondary();
    },
    /** A preview click about to reveal its rules supersedes pending links and pane opens. */
    beginReveal() {
      const request = ++linkedStyleRequest;
      secondaryRequest++;
      return request;
    },
    styleRequest: () => linkedStyleRequest,
    /** Nothing selected: the page's default stylesheet again. */
    clearStyles() {
      nativeLinkedStyles = undefined;
      linkedStyle = undefined;
      void openDefaultLinkedStyle();
    },
    /** The site closed: no <body> rules until the next one paints. */
    clearBodyStyles() { nativeBodyStyles = undefined; },
    /** Signing out forgets the stylesheet texts seen. */
    clearSources() { linkedStyleSourceByPath.clear(); },
  };
}
