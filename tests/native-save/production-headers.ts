/** Path-scoped subset of Cloudflare _headers used by the dist fixture server. */
export function staticAssetHeaders(source: string, pathname: string): Map<string, string> {
  const headers = new Map([["Cache-Control", "public, max-age=0, must-revalidate"]]);
  let matches = false;
  for (const line of source.split("\n")) {
    if (!line.trim() || line.trimStart().startsWith("#")) continue;
    if (!/^\s/.test(line)) {
      const pattern = line.trim().split("*").map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join(".*");
      matches = new RegExp(`^${pattern}$`).test(pathname);
      continue;
    }
    const header = line.trim().match(/^([A-Za-z-]+):\s*(.+)$/);
    if (matches && header) headers.set(header[1], header[2]);
  }
  return headers;
}
