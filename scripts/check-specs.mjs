#!/usr/bin/env node
// Line-based checks on Playwright specs. See docs/agents/guardrails.md.
//
// Clipboard race: a copy button writes the clipboard asynchronously, so a test that reads
// navigator.clipboard.readText() right after clicking can read the previous contents.
// Every read must follow, within the previous three lines, an `expect.poll(...)` on the
// clipboard:
//
//   await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toContain("Server: `");
//   const prompt = await page.evaluate(() => navigator.clipboard.readText());
//
// Also allowed: reads inside expect.poll (on the line or in its block callback), helpers
// that `return` the read (poll them at the call site), and reads right after a keyboard
// copy (Ctrl/Cmd+C), which writes synchronously. Opt out with a
// `// clipboard-ready: <reason>` comment on the read or the line above it.
import { readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = new URL("..", import.meta.url).pathname;
const WINDOW = 3;
const READ = /clipboard\.readText\(/;
const POLL = /expect\.poll\(/;
const KEY_COPY = /keyboard\.press\(["'](ControlOrMeta|Control|Meta)\+C["']\)/;
const RETURNS = /^\s*return\b/;
const OPENS_BLOCK = /\{\s*$/;
const OPT_OUT = /\/\/\s*clipboard-ready:\s*\S/;

function specs(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return entry.name === "node_modules" ? [] : specs(path);
    return entry.name.endsWith(".spec.ts") ? [path] : [];
  });
}

const findings = [];
for (const file of specs(join(ROOT, "tests"))) {
  const lines = readFileSync(file, "utf8").split("\n");
  lines.forEach((line, index) => {
    if (!READ.test(line) || POLL.test(line) || RETURNS.test(line)) return;
    if (OPT_OUT.test(line) || OPT_OUT.test(lines[index - 1] ?? "")) return;
    const before = lines.slice(Math.max(0, index - WINDOW), index);
    // A keyboard copy (Ctrl/Cmd+C) writes the clipboard before press() resolves.
    if (before.some((previous) => KEY_COPY.test(previous))) return;
    // Polled just before, or read inside an `expect.poll(async () => {` callback.
    if (before.some((previous) => POLL.test(previous) && (READ.test(previous) || OPENS_BLOCK.test(previous)))) return;
    findings.push(`${relative(ROOT, file)}:${index + 1}: clipboard read without a preceding expect.poll on the clipboard`);
  });
}

if (findings.length) {
  console.error(findings.join("\n"));
  console.error(`check-specs: ${findings.length} finding(s). Poll the clipboard first or add "// clipboard-ready: <reason>".`);
  process.exit(1);
}
