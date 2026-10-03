import type { NativePreviewSelection } from "../components/native-preview";

/** Resolve actual shadow owners to an allowed source scope, never by selector. */
export function nativeComponentScopeSelection(
  selection: NativePreviewSelection,
  scopePath: string,
  components: Readonly<Record<string, string>>,
  sources: Readonly<Record<string, string>>,
  hostTag: (source: string, node: readonly number[]) => string | undefined,
): NativePreviewSelection | undefined {
  if (selection.path === scopePath) return selection;
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
