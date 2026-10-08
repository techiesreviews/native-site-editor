#!/usr/bin/env node
// Line-based checks on Playwright specs. See docs/agents/guardrails.md.
//
// Clipboard race: a copy button writes the clipboard asynchronously, so a test that reads
// navigator.clipboard.readText() right after clicking can read the previous contents.
// Every read must follow an `expect.poll(...)` whose callback reads navigator.clipboard and
// which closes within the three lines before the read:
//
//   await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toContain("Server: `");
//   const prompt = await page.evaluate(() => navigator.clipboard.readText());
//
// Also allowed: reads inside an expect.poll callback, helpers
// that `return` the read (poll them at the call site), and reads right after a keyboard
// copy (Ctrl/Cmd+C), which writes synchronously. Opt out with a
// `// clipboard-ready: <reason>` comment on the read or the line above it.
import { readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const WINDOW = 3;
const READ = /navigator\.clipboard\.readText\(/;
const POLL = /expect\.poll\(/g;
const KEY_COPY = /keyboard\.press\(["'](ControlOrMeta|Control|Meta)\+C["']\)/;
const RETURNS = /^\s*return\b/;
const OPT_OUT = /\/\/\s*clipboard-ready:\s*\S/;

/** Each expect.poll(...) argument: first and last line (0-based) and whether it reads the clipboard. */
function polls(text) {
  const found = [];
  for (const match of text.matchAll(POLL)) {
    let depth = 1, quote = "", at = match.index + match[0].length;
    for (; at < text.length && depth > 0; at++) {
      const char = text[at];
      if (quote) { if (char === "\\") at++; else if (char === quote) quote = ""; continue; }
      if (char === '"' || char === "'" || char === "`") quote = char;
      else if (char === "(") depth++;
      else if (char === ")") depth--;
    }
    const callback = text.slice(match.index, at);
    const lineOf = (offset) => text.slice(0, offset).split("\n").length - 1;
    found.push({ start: lineOf(match.index), end: lineOf(at - 1), clipboard: READ.test(callback) });
  }
  return found;
}

/** Line numbers (1-based) of clipboard reads in `text` that are not ready. */
export function unreadyClipboardReads(text) {
  const lines = text.split("\n");
  const ranges = polls(text);
  const unready = [];
  lines.forEach((line, index) => {
    if (!READ.test(line) || RETURNS.test(line)) return;
    if (OPT_OUT.test(line) || OPT_OUT.test(lines[index - 1] ?? "")) return;
    // Inside a poll callback: the poll retries it.
    if (ranges.some((poll) => poll.start <= index && index <= poll.end)) return;
    // A keyboard copy (Ctrl/Cmd+C) writes the clipboard before press() resolves.
    if (lines.slice(Math.max(0, index - WINDOW), index).some((previous) => KEY_COPY.test(previous))) return;
    // A clipboard poll that closed just before.
    if (ranges.some((poll) => poll.clipboard && poll.end < index && index - poll.end <= WINDOW)) return;
    unready.push(index + 1);
  });
  return unready;
}

function specs(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return entry.name === "node_modules" ? [] : specs(path);
    return entry.name.endsWith(".spec.ts") ? [path] : [];
  });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const root = fileURLToPath(new URL("..", import.meta.url));
  const findings = specs(join(root, "tests")).flatMap((file) => unreadyClipboardReads(readFileSync(file, "utf8"))
    .map((line) => `${relative(root, file)}:${line}: clipboard read without a preceding expect.poll on the clipboard`));
  if (findings.length) {
    console.error(findings.join("\n"));
    console.error(`check-specs: ${findings.length} finding(s). Poll the clipboard first or add "// clipboard-ready: <reason>".`);
    process.exit(1);
  }
}
