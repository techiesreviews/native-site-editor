export function samePreviewFiles(previous: Record<string, string>, next: Record<string, string>): boolean {
  const paths = Object.keys(previous);
  return paths.length === Object.keys(next).length && paths.every(path => previous[path] === next[path]);
}
