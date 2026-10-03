// Search for the command palette: fuzzy matching with the matched
// characters (to highlight), ranking with recent items first, and grouping.
// Pure, so it is unit tested in Node (tests/palette-search.test.ts).

export interface FuzzyMatch {
  score: number;
  // Offsets in the text of the matched characters, ascending.
  indices: number[];
}

const SEPARATOR = /[\s\-_/.:·,()<>"“”]/;

// How much a character is worth when matched at `j`: the start of the text
// or of a word (after a separator, or an upper-case letter after a lower-case
// one) counts more than the middle of a word.
function boundaryBonus(text: string, j: number) {
  if (j === 0) return 10;
  const before = text[j - 1];
  if (SEPARATOR.test(before)) return 8;
  if (/[a-z]/.test(before) && /[A-Z]/.test(text[j])) return 7;
  return 0;
}

const CONSECUTIVE = 6;
const BASE = 4;
const GAP = 0.6;
const NONE = -Infinity;

/**
 * Matches `query` as a subsequence of `text`, case-insensitively, choosing
 * the placement that scores best (characters at word starts and in runs).
 * Undefined when some character of the query is missing.
 */
export function fuzzyMatch(query: string, text: string): FuzzyMatch | undefined {
  const q = query.toLowerCase();
  const t = text.toLowerCase();
  const m = q.length;
  const n = t.length;
  if (!m) return { score: 0, indices: [] };
  if (m > n) return undefined;
  // Quick reject: every query character, in order.
  for (let i = 0, j = 0; i < m; i++, j++) {
    j = t.indexOf(q[i], j);
    if (j < 0) return undefined;
  }
  // at[i][j]: best score with query[i] matched at text[j] (run[i][j]: right after query[i-1]).
  // best[i][j]: best score with query[0..i] matched within text[0..j]; bestAt: where query[i] went.
  const at: Float64Array[] = [];
  const run: Uint8Array[] = [];
  const best: Float64Array[] = [];
  const bestAt: Int32Array[] = [];
  for (let i = 0; i < m; i++) {
    at.push(new Float64Array(n).fill(NONE));
    run.push(new Uint8Array(n));
    best.push(new Float64Array(n).fill(NONE));
    bestAt.push(new Int32Array(n).fill(-1));
    for (let j = i; j < n; j++) {
      if (t[j] === q[i]) {
        const own = BASE + boundaryBonus(text, j);
        if (i === 0) {
          at[i][j] = own - j * 0.15;
        } else {
          const chained = at[i - 1][j - 1] === NONE ? NONE : at[i - 1][j - 1] + CONSECUTIVE;
          const jumped = best[i - 1][j - 1];
          if (chained !== NONE && chained >= jumped) { at[i][j] = chained + own; run[i][j] = 1; }
          else if (jumped !== NONE) at[i][j] = jumped + own;
        }
      }
      const carried = j > 0 && best[i][j - 1] !== NONE ? best[i][j - 1] - GAP : NONE;
      if (at[i][j] !== NONE && at[i][j] >= carried) { best[i][j] = at[i][j]; bestAt[i][j] = j; }
      else if (carried !== NONE) { best[i][j] = carried; bestAt[i][j] = bestAt[i][j - 1]; }
    }
  }
  const score = best[m - 1][n - 1];
  if (score === NONE) return undefined;
  const indices: number[] = new Array(m);
  let j = bestAt[m - 1][n - 1];
  for (let i = m - 1; i >= 0; i--) {
    indices[i] = j;
    if (i === 0) break;
    j = run[i][j] ? j - 1 : bestAt[i - 1][j - 1];
  }
  // Whole-text and prefix matches beat scattered ones; long texts lose a little.
  let total = score - n * 0.05;
  if (t.startsWith(q)) total += 12;
  if (t === q) total += 20;
  return { score: total, indices };
}

// A match worth showing: letters at word starts or in runs, not scattered
// through the middle of words ("css" finds site.css, not components.js; a
// single letter finds a word that starts with it).
const STRONG = 6.5;
const strong = (word: string, match: FuzzyMatch | undefined) => (match && match.score >= word.length * STRONG ? match : undefined);

export interface Searchable {
  id: string;
  title: string;
  hint?: string;
  keywords?: string[];
  group: string;
}

export interface Ranked<T extends Searchable> {
  item: T;
  score: number;
  // Matched offsets in the title and the hint, to highlight.
  title: number[];
  hint: number[];
}

/**
 * Items matching every word of `query` (each in the title, else the hint,
 * else the start of a keyword), best first. Recently run items rank above
 * others; with an empty query everything is kept, recent first, else in
 * the given order.
 */
export function rankItems<T extends Searchable>(items: T[], query: string, recent: string[] = []): Ranked<T>[] {
  const words = query.trim().split(/\s+/).filter(Boolean);
  const recency = (id: string) => {
    const index = recent.indexOf(id);
    return index < 0 ? 0 : 8 - Math.min(index, 7);
  };
  const out: (Ranked<T> & { order: number })[] = [];
  items.forEach((item, order) => {
    if (!words.length) {
      out.push({ item, score: recency(item.id), title: [], hint: [], order });
      return;
    }
    let score = 0;
    const title = new Set<number>();
    const hint = new Set<number>();
    for (const word of words) {
      const inTitle = strong(word, fuzzyMatch(word, item.title));
      const inHint = item.hint ? strong(word, fuzzyMatch(word, item.hint)) : undefined;
      const keyword = item.keywords?.some((key) => key.toLowerCase().startsWith(word.toLowerCase()));
      if (inTitle && (!inHint || inTitle.score >= inHint.score - 4)) {
        score += inTitle.score;
        inTitle.indices.forEach((index) => title.add(index));
      } else if (inHint) {
        // A hit in the hint (a path, a kind) counts for less than one in the title.
        score += inHint.score * 0.7;
        inHint.indices.forEach((index) => hint.add(index));
      } else if (keyword) {
        score += 6 + word.length;
      } else {
        return;
      }
    }
    out.push({ item, score: score + recency(item.id) * 1.5, title: [...title].sort((a, b) => a - b), hint: [...hint].sort((a, b) => a - b), order });
  });
  out.sort((a, b) => b.score - a.score || a.order - b.order);
  return out.map(({ order: _order, ...rest }) => rest);
}

export interface ResultGroup<T extends Searchable> {
  group: string;
  items: Ranked<T>[];
}

/**
 * Ranked items in groups, each group where its best item ranks (so the best
 * match always comes first), holding at most `limits[group]` items, else
 * `fallback`.
 */
export function groupRanked<T extends Searchable>(ranked: Ranked<T>[], limits: Record<string, number> = {}, fallback = 8): ResultGroup<T>[] {
  const groups = new Map<string, Ranked<T>[]>();
  for (const entry of ranked) {
    let list = groups.get(entry.item.group);
    if (!list) groups.set(entry.item.group, (list = []));
    if (list.length < (limits[entry.item.group] ?? fallback)) list.push(entry);
  }
  return [...groups].map(([group, items]) => ({ group, items }));
}

/** `id` moved to the front of the recent list, which keeps at most `max`. */
export function pushRecent(list: string[], id: string, max = 12) {
  return [id, ...list.filter((other) => other !== id)].slice(0, max);
}

/** Splits text into runs, marking those at `indices`, for highlighting. */
export function markRuns(text: string, indices: number[]): { text: string; marked: boolean }[] {
  const set = new Set(indices);
  const runs: { text: string; marked: boolean }[] = [];
  for (let i = 0; i < text.length; i++) {
    const marked = set.has(i);
    const last = runs.at(-1);
    if (last && last.marked === marked) last.text += text[i];
    else runs.push({ text: text[i], marked });
  }
  return runs;
}

// What the palette searches: everything, actions only (`>`), pages only
// (`/`), or pages, files and components to open (⌘P).
export type PaletteScope = "all" | "actions" | "pages" | "go";

/**
 * A leading `>` searches actions only and a leading `/` pages only (a URL
 * starts with one, so `/about` still finds the About page by its address).
 */
export function parseQuery(raw: string, scope: PaletteScope = "all"): { scope: PaletteScope; text: string } {
  if (raw.startsWith(">")) return { scope: "actions", text: raw.slice(1).trim() };
  if (raw.startsWith("/")) return { scope: "pages", text: raw.trim() === "/" ? "" : raw.trim() };
  return { scope, text: raw.trim() };
}
