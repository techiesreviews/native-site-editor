export type IndexLayoutFinding = {
  screen: string;
  width: number;
  theme: string;
  finding: { kind: string; selector: string; text: string; detail: string };
};

/**
 * Merge identical findings (same screen, kind, selector and detail) across
 * widths and themes into one line, ordered by screen, then kind, then selector.
 * At most `limit` lines; the cut adds a final "… and N more" line.
 */
export function findingsList(findings: IndexLayoutFinding[], limit = 20): string[] {
  if (findings.length === 0) return [];
  const merged = new Map<string, { screen: string; widths: number[]; themes: string[]; kind: string; selector: string; detail: string }>();
  for (const { screen, width, theme, finding } of findings) {
    const key = `${screen}|${finding.kind}|${finding.selector}|${finding.detail}`;
    const entry = merged.get(key) ?? { screen, widths: [], themes: [], kind: finding.kind, selector: finding.selector, detail: finding.detail };
    if (!entry.widths.includes(width)) entry.widths.push(width);
    if (!entry.themes.includes(theme)) entry.themes.push(theme);
    merged.set(key, entry);
  }
  const lines = [...merged.values()]
    .sort((a, b) => a.screen.localeCompare(b.screen) || a.kind.localeCompare(b.kind) || a.selector.localeCompare(b.selector))
    .map(({ screen, widths, themes, kind, selector, detail }) =>
      `${screen} ${widths.sort((a, b) => a - b).join(",")} ${themes.join(",")}: ${kind} ${selector} — ${detail}`);
  if (lines.length <= limit) return lines;
  return [...lines.slice(0, limit), `… and ${lines.length - limit} more (see index.json)`];
}
