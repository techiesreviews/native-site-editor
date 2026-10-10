#!/usr/bin/env node
// Type-checks src, shared and worker, and fails on unused locals, imports, types and
// parameters there and in tests. The three tsc runs go in parallel.
//
// Every diagnostic fails, except these, which are filtered:
// - tests/tsconfig.json: errors other than unused declarations, located in tests/ (not fixed
//   yet) or in worker/ (that program uses the DOM lib, not the Workers types; the worker
//   project checks those files fully). Such errors in src/ or shared/ fail.
//   preview-wire.test.ts is checked fully so its exhaustive protocol maps cannot drift;
// - unused-declaration errors in src/prototype/ (owned by another session).
// A tsc run that fails without a filterable diagnostic (a missing project, no inputs, a crash
// or output on stderr) fails the check.
// Prefix a parameter or loop variable with `_` when it must stay.
import { execFile } from "node:child_process";
import { fileURLToPath } from "node:url";

// TypeScript 7 by path: never a tsc that another package links into node_modules/.bin.
const TSC = fileURLToPath(new URL("../node_modules/typescript/bin/tsc", import.meta.url));
const projects = [
  { config: "tsconfig.json", onlyUnusedIn: [] },
  { config: "worker/tsconfig.json", onlyUnusedIn: [] },
  { config: "tests/tsconfig.json", onlyUnusedIn: ["tests/", "worker/"] },
  ...process.argv.slice(2).map((config) => ({ config, onlyUnusedIn: [] })),
];
const LOCATED = /^(.+?)\(\d+,\d+\): error TS(\d+):/;
const UNUSED = new Set(["6133", "6138", "6192", "6196", "6198", "6199", "6205"]);
const UNUSED_EXEMPT = ["src/prototype/"];

function tsc(config) {
  return new Promise((resolve) => {
    execFile(process.execPath, [TSC, "-p", config, "--noEmit", "--noUnusedLocals", "--noUnusedParameters", "--pretty", "false"],
      { maxBuffer: 64 * 1024 * 1024 },
      (error, stdout, stderr) => resolve({ code: error ? (typeof error.code === "number" ? error.code : 1) : 0, stdout, stderr }));
  });
}

const failures = [];
await Promise.all(projects.map(async ({ config, onlyUnusedIn }) => {
  const { code, stdout, stderr } = await tsc(config);
  const lines = stdout.split("\n");
  let kept = 0, filtered = 0;
  lines.forEach((line, index) => {
    if (!line.trim() || /^\s/.test(line)) return;
    const match = LOCATED.exec(line);
    let keep = true;
    if (match) {
      const [, file, number] = match;
      if (UNUSED.has(number)) keep = !UNUSED_EXEMPT.some((prefix) => file.startsWith(prefix));
      else keep = file === "tests/preview-wire.test.ts" || !onlyUnusedIn.some((prefix) => file.startsWith(prefix));
    }
    if (!keep) { filtered++; return; }
    kept++;
    // Keep tsc's indented continuation lines with the diagnostic.
    let message = line;
    for (let next = index + 1; next < lines.length && /^\s/.test(lines[next]); next++) message += `\n${lines[next]}`;
    failures.push(`${config}: ${message}`);
  });
  if (stderr.trim()) failures.push(`${config}: tsc wrote to stderr:\n${stderr.trim()}`);
  else if (code !== 0 && kept === 0 && filtered === 0) failures.push(`${config}: tsc exited with ${code} and no diagnostics.`);
}));

if (failures.length) {
  console.error(failures.join("\n"));
  console.error(`check-types: ${failures.length} problem(s).`);
  process.exit(1);
}
