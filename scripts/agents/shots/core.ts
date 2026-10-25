export const screens = ["editor", "media-gallery", "media-select", "file-details", "image-popup", "picker", "files", "pages", "site-settings", "cleanup", "improve-images", "add-panel", "structure"] as const;
export type Screen = typeof screens[number];
export type Theme = "light" | "dark";
export type Step =
  | { kind: "click"; name: string }
  | { kind: "type"; text: string; label: string }
  | { kind: "hover"; target: string | number }
  | { kind: "press"; key: string }
  | { kind: "scroll"; direction: "down" | "up" }
  | { kind: "wait"; text: string }
  | { kind: "drag"; name: string; target: string; edge?: Edge }
  | { kind: "record"; name: string; ms: number }
  | { kind: "expect"; text: string };
export type Edge = "top" | "bottom" | "left" | "right";
export type Scenario = { screen: Screen; name?: string; steps: string[] };
export type Options = { screens: Screen[]; widths: number[]; themes: Theme[]; steps?: string; spec?: string; out?: string; files?: boolean };

export function screenName(value: string): Screen {
  if (!screens.includes(value as Screen)) throw new Error(`Unknown screen: ${value}. Screens: ${screens.join(", ")}`);
  return value as Screen;
}

export function parseArgs(args: string[]): Options {
  const options: Options = { screens: [], widths: [390, 768, 1280], themes: ["light", "dark"] };
  const seen = new Set<string>();
  for (let i = 0; i < args.length; i++) {
    const flag = args[i];
    if (!flag.startsWith("-")) { options.screens.push(screenName(flag)); continue; }
    if (!["--width", "--theme", "--steps", "--spec", "--out", "--files"].includes(flag)) throw new Error(`Unknown flag: ${flag}`);
    if (seen.has(flag)) throw new Error(`Repeated flag: ${flag}`);
    seen.add(flag);
    if (flag === "--files") { options.files = true; continue; }
    const value = args[++i];
    if (!value || value.startsWith("--")) throw new Error(`Missing value for ${flag}`);
    if (flag === "--width") {
      if (!/^\d+(,\d+)*$/.test(value)) throw new Error("--width needs comma-separated pixel widths");
      options.widths = [...new Set(value.split(",").map(Number))];
      if (options.widths.some(width => width < 1 || width > 7680)) throw new Error("--width must be between 1 and 7680");
    } else if (flag === "--theme") {
      if (value !== "light" && value !== "dark") throw new Error("--theme must be light or dark");
      options.themes = [value];
    } else if (flag === "--steps") options.steps = value;
    else if (flag === "--spec") options.spec = value;
    else options.out = value;
  }
  options.screens = [...new Set(options.screens)];
  if (options.spec && (options.screens.length || options.steps || seen.has("--width") || seen.has("--theme") || seen.has("--files"))) throw new Error("--spec accepts only --out; raw specs control their own matrix");
  if (options.steps && options.screens.length) throw new Error("--steps supplies its own screen; omit screen arguments");
  if (!options.screens.length && !options.steps && !options.spec) throw new Error(`Choose a screen: ${screens.join(", ")}`);
  return options;
}

export function expandMatrix(widths: number[], themes: Theme[]) {
  return widths.flatMap(width => themes.map(theme => ({ width, theme })));
}

export function parseStep(source: string): Step {
  let match: RegExpExecArray | null;
  if ((match = /^click "([^"]+)"$/.exec(source))) return { kind: "click", name: match[1] };
  if ((match = /^type "([^"]*)" in (.+)$/.exec(source))) return { kind: "type", text: match[1], label: match[2] };
  if ((match = /^hover "([^"]+)"$/.exec(source))) return { kind: "hover", target: match[1] };
  if ((match = /^hover (first|last|nth ([1-9]\d*)) tile$/.exec(source))) return { kind: "hover", target: match[1] === "first" ? 0 : match[1] === "last" ? -1 : Number(match[2]) - 1 };
  if ((match = /^press (\S+)$/.exec(source))) return { kind: "press", key: match[1] };
  if ((match = /^scroll (down|up)$/.exec(source))) return { kind: "scroll", direction: match[1] as "down" | "up" };
  if ((match = /^wait for "([^"]+)"$/.exec(source))) return { kind: "wait", text: match[1] };
  if ((match = /^drag "([^"]+)" to "([^"]+)"(?: edge (top|bottom|left|right))?$/.exec(source))) return { kind: "drag", name: match[1], target: match[2], ...(match[3] ? { edge: match[3] as Edge } : {}) };
  // The name becomes part of the strip's file name.
  if ((match = /^record ([a-zA-Z0-9][a-zA-Z0-9_-]*) ([1-9]\d{2,3})$/.exec(source))) return { kind: "record", name: match[1], ms: Number(match[2]) };
  if ((match = /^expect visible "([^"]+)"$/.exec(source))) return { kind: "expect", text: match[1] };
  throw new Error(`Unknown step: ${source}`);
}

/** YAML subset: one mapping, scalar screen/name, and an indented steps list. */
export function parseSteps(source: string, yaml = false): Scenario {
  let value: unknown;
  if (!yaml) value = JSON.parse(source);
  else {
    const mapping: Record<string, unknown> = {};
    let inSteps = false;
    const scalar = (text: string) => text.startsWith('"') ? JSON.parse(text) : text.startsWith("'") && text.endsWith("'") ? text.slice(1, -1).replaceAll("''", "'") : text;
    for (const line of source.split(/\r?\n/)) {
      if (!line.trim() || line.trimStart().startsWith("#")) continue;
      const item = /^\s+- (.+)$/.exec(line);
      if (item && inSteps) { (mapping.steps as unknown[]).push(scalar(item[1])); continue; }
      const field = /^(screen|name|steps):\s*(.*?)\s*$/.exec(line);
      if (!field || field[1] in mapping) throw new Error(`Unsupported YAML line: ${line}`);
      inSteps = field[1] === "steps";
      mapping[field[1]] = inSteps ? (field[2] === "[]" ? [] : field[2] ? JSON.parse(field[2]) : []) : scalar(field[2]);
    }
    value = mapping;
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Steps file must contain one scenario object");
  const data = value as Record<string, unknown>;
  if (Object.keys(data).some(key => !["screen", "steps", "name"].includes(key))) throw new Error("Unknown scenario field");
  if (typeof data.screen !== "string" || !Array.isArray(data.steps) || data.steps.some(step => typeof step !== "string")) throw new Error("Steps file needs screen and steps (string array)");
  if (data.name !== undefined && (typeof data.name !== "string" || !/^[a-zA-Z0-9][a-zA-Z0-9_-]*$/.test(data.name))) throw new Error("Scenario name must use letters, numbers, underscores or hyphens");
  const steps = data.steps as string[];
  for (const step of steps) parseStep(step);
  return { screen: screenName(data.screen), steps, ...(data.name ? { name: data.name as string } : {}) };
}

export type Encoding = { quality: number; width: number; height: number };
/** Exhaust quality first, then shrink dimensions; null means no smaller encoding exists. */
export function nextEncoding(current: Encoding): Encoding | null {
  if (current.quality > 20) return { ...current, quality: Math.max(20, current.quality - 15) };
  const width = Math.max(1, Math.floor(current.width * 0.8));
  const height = Math.max(1, Math.floor(current.height * 0.8));
  return width === current.width && height === current.height ? null : { quality: 20, width, height };
}

export type Shot = { screen: Screen; name?: string; width: number; height?: number; theme: Theme; files: { path: string; bytes: number }[]; attempts: number; failures: { attempt: number; step: string; error: string }[]; layout: unknown[]; ok: boolean };
/** A failed attempt keeps the strips its `record` steps already saved: flicker before a failure is evidence. */
export function failShot(shot: Shot, failure: Shot["failures"][number], strips: Shot["files"]) {
  shot.failures.push(failure);
  shot.files = [...strips];
}
export function makeIndex(shots: Shot[]) {
  return { version: 1, screens: shots, files: shots.flatMap(shot => shot.files), failures: shots.flatMap(shot => shot.failures.map(failure => ({ screen: shot.screen, name: shot.name, width: shot.width, theme: shot.theme, ...failure }))), outputFailures: [] as { step: string; error: string }[], layoutFindings: shots.flatMap(shot => shot.layout.map(finding => ({ screen: shot.screen, width: shot.width, theme: shot.theme, finding }))) };
}

const escape = (value: string) => value.replace(/[&<>"']/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]!);
const padding = 20, header = 40, gap = 16, heading = 28, caption = 48;
const maxWidth = 1600, maxHeight = 2400;
type Tile = { shot: Shot; label: string; width: number; imageWidth: number; imageHeight: number };
type Row = { label: string; paired: boolean; tiles: Tile[]; width: number; height: number };

function contactRows(shots: Shot[]): Row[] {
  const pairs = new Set(shots.filter(shot => shot.name === "after").map(shot => `${shot.screen}|${shot.width}|${shot.theme}`)
    .filter(key => shots.some(shot => shot.name === "before" && `${shot.screen}|${shot.width}|${shot.theme}` === key)));
  const groups = new Map<string, { paired: boolean; shots: Shot[] }>();
  for (const shot of shots) {
    const paired = (shot.name === "before" || shot.name === "after") && pairs.has(`${shot.screen}|${shot.width}|${shot.theme}`);
    const key = paired ? `${shot.screen} · ${shot.width}px · ${shot.theme}` : `${shot.screen}${shot.name ? `-${shot.name}` : ""}`;
    const group = groups.get(key) ?? { paired, shots: [] };
    group.shots.push(shot);
    groups.set(key, group);
  }
  const rows: Row[] = [];
  for (const [label, group] of groups) {
    if (group.paired) group.shots.sort((a, b) => (a.name === "before" ? -1 : b.name === "before" ? 1 : 0));
    let row: Row = { label, paired: group.paired, tiles: [], width: 0, height: 0 };
    for (const shot of group.shots) {
      const height = shot.height ?? 900;
      // Preserve narrow shots at CSS width; exceptionally tall shots must also fit a whole sheet.
      const scale = Math.min(1, 400 / shot.width, (maxHeight - 2 * padding - header - heading - caption) / height);
      const imageWidth = Math.max(1, Math.floor(shot.width * scale));
      const imageHeight = Math.max(1, Math.floor(height * scale));
      const width = Math.max(200, imageWidth);
      if (row.tiles.length && row.width + gap + width > maxWidth - 2 * padding) {
        rows.push(row);
        row = { label, paired: group.paired, tiles: [], width: 0, height: 0 };
      }
      row.width += (row.tiles.length ? gap : 0) + width;
      row.height = Math.max(row.height, heading + caption + imageHeight);
      row.tiles.push({ shot, label: `${shot.screen} · ${shot.width}px · ${shot.theme}${shot.name ? ` · ${shot.name}` : ""}${shot.ok ? "" : " — failed"}`, width, imageWidth, imageHeight });
    }
    if (row.tiles.length) rows.push(row);
  }
  return rows;
}

function renderContact(rows: Row[], width: number) {
  const sections = rows.map(row => `<section><h2>${escape(row.label)}</h2><div class="row${row.paired ? " paired" : ""}">${row.tiles.map(tile => {
    // The small per-shot WebP may already have lost dimensions. Compose from the original PNG.
    // A record strip is never the screen's picture.
    const file = tile.shot.files.find(file => file.path.endsWith(".png")) ?? tile.shot.files.find(file => file.path.endsWith(".webp") && !file.path.endsWith("-strip.webp"));
    return `<figure style="inline-size:${tile.width}px"><figcaption>${escape(tile.label)}</figcaption>${file ? `<img style="inline-size:${tile.imageWidth}px;block-size:${tile.imageHeight}px" src="${escape(encodeURI(file.path))}" alt="${escape(tile.label)}">` : `<p style="block-size:${tile.imageHeight}px">No screenshot</p>`}</figure>`;
  }).join("")}</div></section>`).join("\n");
  return `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Kit shots</title><style>
  :root{font:14px system-ui;overflow-wrap:break-word;color:oklch(.2 0 none);background:oklch(.96 0 none)}
  *{box-sizing:border-box}body{margin:0;padding:${padding}px;inline-size:${width}px}
  h1{font-size:22px;line-height:28px;margin:0;block-size:${header}px}h2{font-size:16px;line-height:20px;margin:0;block-size:${heading}px}
  main{display:grid;gap:${gap}px}.row{display:flex;align-items:start;gap:${gap}px}
  figure{margin:0;flex:none;min-inline-size:0}figcaption{block-size:${caption}px;line-height:20px;padding-block:4px;overflow:clip}
  img{display:block;object-fit:contain;object-position:top}p{margin:0}
  </style><h1>Kit shots</h1><main>${sections}</main></html>`;
}

/** Deterministic geometry; pagination never splits a row or a before/after pair. */
export function contactSheets(shots: Shot[]) {
  const pages: { rows: Row[]; width: number; height: number }[] = [];
  let page = { rows: [] as Row[], width: 2 * padding + 200, height: 2 * padding + header };
  for (const row of contactRows(shots)) {
    const extra = (page.rows.length ? gap : 0) + row.height;
    if (page.rows.length && page.height + extra > maxHeight) {
      pages.push(page);
      page = { rows: [], width: 2 * padding + 200, height: 2 * padding + header };
    }
    page.height += (page.rows.length ? gap : 0) + row.height;
    page.width = Math.max(page.width, row.width + 2 * padding);
    page.rows.push(row);
  }
  pages.push(page);
  return pages.map((page, index) => ({ ...page, path: pages.length === 1 ? "contact.webp" : `contact-${index + 1}.webp`, html: renderContact(page.rows, page.width) }));
}

/** Standalone HTML for small callers; capture uses the paginated contactSheets plans. */
export function contactHtml(shots: Shot[]) {
  const rows = contactRows(shots);
  return renderContact(rows, Math.max(240, ...rows.map(row => row.width + 2 * padding)));
}

/** Pure initial encoding bounds, shared by the encoder and its stepping tests. */
export function initialEncoding(width: number, height: number, contact = false): Encoding {
  const scale = Math.min(1, (contact ? maxWidth : 16000) / width, (contact ? maxHeight : 16000) / height);
  return { width: Math.max(1, Math.floor(width * scale)), height: Math.max(1, Math.floor(height * scale)), quality: 85 };
}

/** Shared normal/compare output contract. Child capture output belongs on stderr. */
export function contactOutput(index: ReturnType<typeof makeIndex>, out: string, files = false) {
  const path = (file: string) => `${out}/${file}`;
  const contacts = index.files.filter(file => /^contact(?:-\d+)?\.webp$/.test(file.path)).map(file => path(file.path));
  const listing = files ? [...index.files.map(file => `${path(file.path)} (${file.bytes} bytes)`), path("index.json")] : [`${index.files.length} files: ${path("index.json")}`];
  return {
    lines: [...contacts.map(file => `contact: ${file}`), ...listing],
    summary: `contact ${contacts[0] ?? "none"}${contacts.length > 1 ? ` +${contacts.length - 1} more` : ""}`,
  };
}
