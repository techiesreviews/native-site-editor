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

/** `text` with comments and string contents blanked to spaces; offsets and newlines are kept. */
function codeOnly(text) {
  const out = [...text];
  const blank = (from, to) => { for (let i = from; i < to; i++) if (out[i] !== "\n") out[i] = " "; };
  for (let at = 0; at < text.length; at++) {
    const char = text[at], next = text[at + 1];
    if (char === "/" && next === "/") { const stop = text.indexOf("\n", at); const to = stop < 0 ? text.length : stop; blank(at, to); at = to - 1; }
    else if (char === "/" && next === "*") { const stop = text.indexOf("*/", at + 2); const to = stop < 0 ? text.length : stop + 2; blank(at, to); at = to - 1; }
    else if (char === '"' || char === "'" || char === "`") {
      let to = at + 1;
      while (to < text.length && text[to] !== char) to += text[to] === "\\" ? 2 : 1;
      blank(at + 1, to); at = to;
    }
  }
  return out.join("");
}

/** Each expect.poll(...) call in `code`: its start and end offsets and whether it reads the clipboard. */
function polls(code) {
  const found = [];
  for (const match of code.matchAll(POLL)) {
    let depth = 1, at = match.index + match[0].length;
    for (; at < code.length && depth > 0; at++) {
      if (code[at] === "(") depth++;
      else if (code[at] === ")") depth--;
    }
    found.push({ start: match.index, end: at, clipboard: READ.test(code.slice(match.index, at)) });
  }
  return found;
}

/** Line numbers (1-based) of clipboard reads in `text` that are not ready. */
export function unreadyClipboardReads(text) {
  const code = codeOnly(text);
  const lines = text.split("\n");
  const lineOf = (offset) => code.slice(0, offset).split("\n").length - 1;
  const ranges = polls(code).map((poll) => ({ ...poll, endLine: lineOf(poll.end) }));
  const unready = [];
  for (const match of code.matchAll(new RegExp(READ.source, "g"))) {
    const at = match.index, index = lineOf(at), line = lines[index];
    if (RETURNS.test(line)) continue;
    if (OPT_OUT.test(line) || OPT_OUT.test(lines[index - 1] ?? "")) continue;
    // Inside a poll callback: the poll retries it.
    if (ranges.some((poll) => poll.start < at && at < poll.end)) continue;
    // A keyboard copy (Ctrl/Cmd+C) writes the clipboard before press() resolves.
    if (lines.slice(Math.max(0, index - WINDOW), index).some((previous) => KEY_COPY.test(previous))) continue;
    // A clipboard poll that closed before the read, at most three lines up.
    if (ranges.some((poll) => poll.clipboard && poll.end <= at && index - poll.endLine <= WINDOW)) continue;
    unready.push(index + 1);
  }
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
