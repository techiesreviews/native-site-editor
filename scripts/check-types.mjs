#!/usr/bin/env node
// Type-checks src, shared and worker, and fails on unused locals, imports, types and
// parameters there and in tests. The three tsc runs go in parallel.
// tests/ is only checked for unused declarations: it has other type errors not fixed yet.
// src/prototype/ is exempt from the unused checks (owned by another session).
// Prefix a parameter or loop variable with `_` when it must stay.
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const run = promisify(execFile);
const projects = [
  { config: "tsconfig.json", allErrors: true },
  { config: "worker/tsconfig.json", allErrors: true },
  { config: "tests/tsconfig.json", allErrors: false },
];
const ERROR = /^(.+?)\(\d+,\d+\): error TS(\d+):/;
const UNUSED = new Set(["6133", "6138", "6192", "6196", "6198", "6199", "6205"]);
const UNUSED_EXEMPT = ["src/prototype/"];

const outputs = await Promise.all(projects.map(async ({ config, allErrors }) => {
  let stdout;
  try {
    ({ stdout } = await run("npx", ["tsc", "-p", config, "--noEmit", "--noUnusedLocals", "--noUnusedParameters", "--pretty", "false"], { maxBuffer: 64 * 1024 * 1024 }));
  } catch (error) {
    if (typeof error?.stdout !== "string") throw error;
    stdout = error.stdout;
  }
  return { allErrors, lines: stdout.split("\n") };
}));

const findings = new Set();
for (const { allErrors, lines } of outputs) {
  lines.forEach((line, index) => {
    const match = ERROR.exec(line);
    if (!match) return;
    const [, file, code] = match;
    if (UNUSED.has(code)) {
      if (!UNUSED_EXEMPT.some((prefix) => file.startsWith(prefix))) findings.add(line);
    } else if (allErrors) {
      // Keep tsc's indented continuation lines with the error.
      let message = line;
      for (let next = index + 1; next < lines.length && /^\s/.test(lines[next]); next++) message += `\n${lines[next]}`;
      findings.add(message);
    }
  });
}
if (findings.size) {
  console.error([...findings].sort().join("\n"));
  console.error(`check-types: ${findings.size} error(s).`);
  process.exit(1);
}
