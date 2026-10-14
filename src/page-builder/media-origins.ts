export interface MediaSite { origins: string[] }

export function mediaOwnOrigins(url?: string, cname?: string): string[] {
  const origins = new Set<string>();
  for (const value of [url, cname?.trim().split(/\s/)[0]]) {
    if (!value) continue;
    try { origins.add(new URL(/^[a-z][\w+.-]*:\/\//i.test(value) ? value : "https://" + value.replace(/^\/\//, "")).origin); } catch { /* Invalid settings cannot identify a host. */ }
  }
  return [...origins];
}
export function mediaOwnAddress(value: string, site?: MediaSite): boolean {
  try {
    const host = (url: URL) => url.host.toLowerCase().replace(/^www\./, "");
    const address = new URL(value.startsWith("//") ? "https:" + value : value);
    return !site?.origins.length || site.origins.some(origin => {
      try { return host(new URL(origin)) === host(address); } catch { return false; }
    });
  } catch { return false; }
}
