export type IndexLayoutFinding = {
  screen: string;
  width: number;
  theme: string;
  finding: { kind: string; selector: string; text: string; detail: string };
};

type FindingShot = {
  screen: string;
  name?: string;
  width: number;
  theme: string;
  ok: boolean;
  layout: IndexLayoutFinding["finding"][];
};

const findingKey = (finding: IndexLayoutFinding["finding"]) => JSON.stringify([finding.kind, finding.selector, finding.detail]);
const shotKey = (shot: FindingShot) => JSON.stringify([shot.screen, shot.width, shot.theme]);

/** Format current findings and only mark fixes confirmed by a successful matching shot. */
export function findingsSections(screens: FindingShot[]): string[] {
  const hasBefore = screens.some(shot => shot.name === "before");
  const after = screens.filter(shot => shot.name !== "before");
  const flatten = (shots: FindingShot[]) => shots.flatMap(shot => shot.layout.map(finding => ({ screen: shot.screen, width: shot.width, theme: shot.theme, finding })));
  const current = findingsList(flatten(after));
  if (!hasBefore) return current.length ? ["layout findings:", ...current.map(line => `  ${line}`)] : [];
  const successful = new Map(after.filter(shot => shot.ok).map(shot => [shotKey(shot), shot]));
  const fixed = screens.filter(shot => shot.name === "before").flatMap(shot => {
    const match = successful.get(shotKey(shot));
    if (!match) return [];
    const remaining = new Set(match.layout.map(findingKey));
    return flatten([{ ...shot, layout: shot.layout.filter(finding => !remaining.has(findingKey(finding))) }]);
  });
  return ["layout findings (after):", ...current.map(line => `  ${line}`),
    "fixed since before:", ...findingsList(fixed, 10).map(line => `  ${line}`)];
}

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
