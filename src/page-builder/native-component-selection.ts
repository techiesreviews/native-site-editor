import type { NativePreviewSelection } from "../components/native-preview";

/** Resolve actual shadow owners to an allowed source scope, never by selector. */
export function nativeComponentScopeSelection(
  selection: NativePreviewSelection,
  scopePath: string,
  components: Readonly<Record<string, string>>,
  sources: Readonly<Record<string, string>>,
  hostTag: (source: string, node: readonly number[]) => string | undefined,
  isContent: (source: string, node: readonly number[], tag: string) => boolean = (_source, _node, tag) =>
    /^(h[1-6]|p|span|a|button|img|picture|blockquote|figcaption|small|label|strong|em|b|i|cite|q|mark|code)$/.test(tag),
): NativePreviewSelection | undefined {
  if (selection.path === scopePath) {
    // Explicit template Edit unlocks its structure. Page-owned slot assignments still
    // belong to their component instance, so only their content can be targeted.
    if (Object.values(components).includes(scopePath) || !selection.node) return selection;
    const source = sources[scopePath];
    if (source === undefined) return;
    let hostDepth = -1;
    for (let depth = selection.node.length - 1; depth > 0; depth--) {
      const tag = hostTag(source, selection.node.slice(0, depth));
      if (tag && components[tag]) { hostDepth = depth; break; }
    }
    if (hostDepth < 0 || components[selection.tag] || isContent(source, selection.node, selection.tag)) return selection;
    for (let depth = selection.node.length - 1; depth >= hostDepth; depth--) {
      const node = selection.node.slice(0, depth);
      const tag = hostTag(source, node);
      if (tag && (depth === hostDepth || isContent(source, node, tag))) return {
        ...selection, node, tag, selectors: [], cascade: undefined, text: "", link: undefined,
        host: undefined, hostChain: undefined, selector: undefined,
      };
    }
    return;
  }
  const chain = selection.hostChain ?? (selection.host ? [selection.host] : []);
  if (!chain.length || chain.length > 16) return;
  let innerPath = selection.path;
  const seen = new Set<string>();
  for (const host of chain) {
    if (!host.path || !host.node || components[host.tag] !== innerPath) return;
    const source = sources[host.path];
    if (source === undefined || host.paintedSource !== undefined && host.paintedSource !== source || hostTag(source, host.node) !== host.tag) return;
    const key = `${host.path}:${host.node.join(".")}`;
    if (seen.has(key)) return;
    seen.add(key);
    if (host.path === scopePath) return {
      ...selection, path: host.path, node: [...host.node], tag: host.tag,
      selectors: [], cascade: undefined, text: "", link: undefined,
      host: undefined, hostChain: undefined, selector: host.selector, rect: host.rect ?? selection.rect, paintedSource: host.paintedSource,
    };
    innerPath = host.path;
  }
}

export interface LockedComponentPart {
  part: { path: string; node: number[]; tag: string };
  instance: { path: string; node: number[]; tag: string };
}

/** A verified template click on the page, excluding slot placeholders and edit mode. */
export function nativeLockedComponentPart(
  selection: NativePreviewSelection,
  pagePath: string,
  components: Readonly<Record<string, string>>,
  sources: Readonly<Record<string, string>>,
  tagAt: (source: string, node: readonly number[]) => string | undefined,
  editing = false,
): LockedComponentPart | undefined {
  if (editing || selection.path === pagePath || !selection.node) return;
  const mapped = nativeComponentScopeSelection(selection, pagePath, components, sources, tagAt);
  if (!mapped?.node || mapped.path !== pagePath) return;
  const chain = selection.hostChain ?? (selection.host ? [selection.host] : []);
  const outer = chain.findIndex(host => host.path === pagePath);
  const part = outer > 0 ? chain[outer - 1] : selection;
  if (!part.path || !part.node) return;
  const source = sources[part.path];
  if (source === undefined || tagAt(source, part.node) !== part.tag) return;
  for (let depth = 1; depth <= part.node.length; depth++) {
    if (tagAt(source, part.node.slice(0, depth)) === "slot") return;
  }
  return {
    part: { path: part.path, node: [...part.node], tag: part.tag },
    instance: { path: mapped.path, node: [...mapped.node], tag: mapped.tag },
  };
}
