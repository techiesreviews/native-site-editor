export const screens = ["editor", "media-gallery", "media-select", "file-details", "image-popup", "picker", "files", "pages", "site-settings", "cleanup", "improve-images", "add-panel", "structure"] as const;
export type Screen = typeof screens[number];
export type Theme = "light" | "dark";
export type Step =
  | { kind: "click"; name: string }
  | { kind: "type"; text: string; label: string }
  | { kind: "hover"; target: string | number }
  | { kind: "press"; key: string }
  | { kind: "scroll"; direction: "down" | "up" }
  | { kind: "wait"; text: string };
export type Scenario = { screen: Screen; name?: string; steps: string[] };
export type Options = { screens: Screen[]; widths: number[]; themes: Theme[]; steps?: string; spec?: string; out?: string };

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
    if (!["--width", "--theme", "--steps", "--spec", "--out"].includes(flag)) throw new Error(`Unknown flag: ${flag}`);
    if (seen.has(flag)) throw new Error(`Repeated flag: ${flag}`);
    seen.add(flag);
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
  if (options.spec && (options.screens.length || options.steps || seen.has("--width") || seen.has("--theme"))) throw new Error("--spec accepts only --out; raw specs control their own matrix");
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

export type Shot = { screen: Screen; name?: string; width: number; theme: Theme; files: { path: string; bytes: number }[]; attempts: number; failures: { attempt: number; step: string; error: string }[]; layout: unknown[]; ok: boolean };
export function makeIndex(shots: Shot[]) {
  return { version: 1, screens: shots, files: shots.flatMap(shot => shot.files), failures: shots.flatMap(shot => shot.failures.map(failure => ({ screen: shot.screen, name: shot.name, width: shot.width, theme: shot.theme, ...failure }))), outputFailures: [] as { step: string; error: string }[], layoutFindings: shots.flatMap(shot => shot.layout.map(finding => ({ screen: shot.screen, width: shot.width, theme: shot.theme, finding }))) };
}

const escape = (value: string) => value.replace(/[&<>"']/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]!);
export function contactHtml(shots: Shot[]) {
  // One row per screen with its sizes and themes side by side; a before/after
  // pair gets its own row per size and theme so the two sit next to each other.
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
  const rows = [...groups].map(([label, { paired, shots: group }]) => {
    if (paired) group.sort((a, b) => (a.name === "before" ? -1 : b.name === "before" ? 1 : 0));
    return `<section><h2>${escape(label)}</h2><div class="row${paired ? " paired" : ""}">${group.map(shot => {
      const caption = paired ? shot.name! : `${shot.width}px · ${shot.theme}`;
      const file = shot.files.find(file => file.path.endsWith(".webp"));
      return `<figure><figcaption>${escape(caption)}${shot.ok ? "" : " — failed"}</figcaption>${file ? `<img src="${escape(encodeURI(file.path))}" alt="${escape(`${label} ${caption}`)}">` : "<p>No screenshot</p>"}</figure>`;
    }).join("")}</div></section>`;
  }).join("\n");
  return `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Kit shots</title><style>
  :root{font:14px system-ui;overflow-wrap:break-word;color:oklch(.2 0 none);background:oklch(.96 0 none)}
  body{margin:0;padding:20px}h1{font-size:22px}h2{font-size:16px;margin-block:20px 8px}
  main{display:grid;grid-template-columns:repeat(auto-fill,minmax(min(100%,180px),1fr));gap:0 16px}
  section:has(figure + figure){grid-column:1/-1}
  .row.paired{grid-template-columns:repeat(2,minmax(0,1fr))}
  .row{display:grid;grid-template-columns:repeat(auto-fill,minmax(min(100%,150px),1fr));gap:12px}
  figure{margin:0;min-inline-size:0}figcaption{padding-block:6px}img{display:block;inline-size:100%;block-size:auto;max-block-size:420px;object-position:top;object-fit:contain}
  </style><h1>Kit shots</h1><main>${rows}</main></html>`;
}
