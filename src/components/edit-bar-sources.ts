/** Sources whose changes can invalidate the current edit bar's callbacks. */
export function editBarSources(
  sources: Record<string, string>,
  pages: readonly string[],
  selectedPath: string | undefined,
  shownPage: string | undefined,
): Record<string, string> {
  if (!selectedPath) return sources;
  const otherPages = new Set(pages.filter(path => path !== selectedPath && path !== shownPage));
  // Background indexing fills other pages after the first paint. Their
  // contents do not invalidate this selection; changed labels/options are
  // already represented by the serialized edit bar model.
  return Object.fromEntries(Object.entries(sources).filter(([path]) => !otherPages.has(path)));
}
