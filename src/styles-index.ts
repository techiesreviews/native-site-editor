import type { Directory, Snapshot, TreeEntry } from "../shared/types";

// Finds the stylesheets and rules behind a selected preview element, so the
// code pane can open the stylesheet beside the page and highlight its rules.
export interface StyleRule {
  path: string;
  selector: string;
  // Byte range of the whole rule (selector list through closing brace).
  start: number;
  end: number;
  specificity: number;
}

type Api = <T>(path: string, params: Record<string, string>) => Promise<T>;

const limit = 100;
let cache: { key: string; files: Promise<Record<string, string>> } | undefined;

async function index(api: Api, repo: string, snapshot: Snapshot) {
  const key = `${repo}@${snapshot.commit}`;
  if (cache?.key === key) return cache.files;
  const files = (async () => {
    const found: { path: string; sha: string }[] = [];
    async function walk(entries: TreeEntry[], prefix: string) {
      for (const entry of entries) {
        const path = prefix + entry.path;
        if (entry.type === "tree") {
          if (/^(node_modules|dist|\.git|\.astro|public|\.astro-editor)$/.test(entry.path)) continue;
          const tree = await api<Directory>("tree", { repo, sha: entry.sha });
          await walk(tree.entries, path + "/");
        } else if (/\.(css|scss|astro)$/.test(path) && (entry.size ?? 0) <= 128 * 1024) {
          if (found.length >= limit) return;
          found.push({ path, sha: entry.sha });
        }
      }
    }
    await walk(snapshot.entries, "");
    const result: Record<string, string> = {};
    await Promise.all(
      found.map(async (file) => {
        const { content } = await api<{ content: string }>("file", { repo, sha: file.sha });
        result[file.path] = content;
      }),
    );
    return result;
  })();
  cache = { key, files };
  return files;
}

// Astro scopes component styles with [data-astro-cid-*]; the source has no such attribute.
export function sourceSelector(selector: string) {
  return selector.replace(/\[data-astro-cid-[^\]]*\]/g, "").replace(/\s+/g, " ").trim();
}

// CSS specificity (ids, classes/attributes/pseudo-classes, types) as one number.
export function specificity(selector: string) {
  let rest = selector.replace(/::?(not|is|where|has)\([^)]*\)/g, " ");
  const ids = (rest.match(/#[\w-]+/g) ?? []).length;
  rest = rest.replace(/#[\w-]+/g, " ");
  const classes = (rest.match(/\.[\w-]+|\[[^\]]*\]|:[\w-]+(\([^)]*\))?/g) ?? []).filter((s) => !s.startsWith("::")).length;
  rest = rest.replace(/\.[\w-]+|\[[^\]]*\]|::?[\w-]+(\([^)]*\))?/g, " ");
  const types = (rest.match(/(^|[\s>+~])[a-zA-Z][\w-]*/g) ?? []).length;
  return ids * 65536 + classes * 256 + types;
}

// The CSS blocks of a file with their byte offsets: a stylesheet is one block;
// an .astro file contributes each of its <style> elements.
function styleBlocks(path: string, content: string) {
  if (!path.endsWith(".astro")) return [{ offset: 0, css: content }];
  const blocks: { offset: number; css: string }[] = [];
  for (const match of content.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g))
    blocks.push({ offset: match.index + match[0].indexOf(match[1]), css: match[1] });
  return blocks;
}

// Style rules in a block with their selector lists; at-rules such as @media
// are descended into. Comments are blanked so offsets stay intact.
function scanRules(css: string) {
  const clean = css.replace(/\/\*[\s\S]*?\*\//g, (comment) => " ".repeat(comment.length));
  const rules: { start: number; end: number; selectors: string[] }[] = [];
  let boundary = 0;
  for (let index = 0; index < clean.length; index++) {
    const char = clean[index];
    if (char === ";" || char === "}") boundary = index + 1;
    else if (char === "{") {
      const prelude = clean.slice(boundary, index);
      const start = boundary + (prelude.length - prelude.trimStart().length);
      boundary = index + 1;
      if (!prelude.trim() || prelude.trim().startsWith("@")) continue;
      let depth = 0;
      let end = index;
      for (; end < clean.length; end++) {
        if (clean[end] === "{") depth++;
        else if (clean[end] === "}" && --depth === 0) break;
      }
      rules.push({
        start,
        end: Math.min(end + 1, clean.length),
        selectors: prelude.split(",").map((part) => part.replace(/\s+/g, " ").trim()).filter(Boolean),
      });
    }
  }
  return rules;
}

export async function findStyleRules(
  api: Api,
  repo: string,
  snapshot: Snapshot,
  selectors: string[],
  page: string,
  overlay?: Record<string, string>,
): Promise<StyleRule[]> {
  const files = { ...await index(api, repo, snapshot), ...overlay };
  // Specificity counts the scoping attribute the source does not show.
  const candidates = new Map<string, number>();
  for (const selector of selectors) {
    const source = sourceSelector(selector);
    if (source && !candidates.has(source)) candidates.set(source, specificity(selector));
  }
  // Ties in specificity go to the page's own <style>, then stylesheets, then other components.
  const rank = (path: string) => (path === page ? 0 : /\.s?css$/.test(path) ? 1 : 2);
  const rules: StyleRule[] = [];
  for (const [path, content] of Object.entries(files)) {
    for (const block of styleBlocks(path, content)) {
      for (const rule of scanRules(block.css)) {
        const selector = rule.selectors.find((part) => candidates.has(part));
        if (selector === undefined) continue;
        rules.push({
          path,
          selector,
          start: block.offset + rule.start,
          end: block.offset + rule.end,
          specificity: candidates.get(selector)!,
        });
      }
    }
  }
  return rules.sort(
    (a, b) => b.specificity - a.specificity || rank(a.path) - rank(b.path) || a.path.localeCompare(b.path) || b.start - a.start,
  );
}

// Stylesheets a page imports, directly or through the layouts and components
// it imports, nearest first. Relative imports and the src/ aliases are followed.
export async function pageStylesheets(api: Api, repo: string, snapshot: Snapshot, page: string) {
  const files = await index(api, repo, snapshot);
  const sheets: string[] = [];
  const seen = new Set<string>();
  const resolve = (from: string, specifier: string) => {
    const aliased = specifier.replace(/^(@|~|src)\//, "src/");
    if (!/^\.\.?\//.test(specifier) && aliased === specifier) return undefined;
    const base = aliased === specifier ? from.split("/").slice(0, -1) : [];
    for (const part of aliased.split("/")) {
      if (part === "..") base.pop();
      else if (part !== ".") base.push(part);
    }
    return base.join("/");
  };
  const visit = (path: string, depth: number) => {
    if (seen.has(path) || depth > 4) return;
    seen.add(path);
    const frontmatter = files[path]?.match(/^---\n([\s\S]*?)\n---/)?.[1] ?? "";
    for (const match of frontmatter.matchAll(/import\s+(?:[^'"]*?\s+from\s+)?['"]([^'"]+)['"]/g)) {
      const target = resolve(path, match[1]);
      if (!target || !(target in files)) continue;
      if (/\.s?css$/.test(target)) {
        if (!sheets.includes(target)) sheets.push(target);
      } else visit(target, depth + 1);
    }
  };
  visit(page, 0);
  return sheets;
}

// Read-only source snapshot for verified visual CSS edits; callers overlay current drafts.
export async function styleSources(api: Api, repo: string, snapshot: Snapshot) {
  return { ...await index(api, repo, snapshot) };
}
