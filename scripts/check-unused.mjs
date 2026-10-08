#!/usr/bin/env node
// Fails on unused locals, imports, types and parameters in src, shared, worker and tests.
// tsc runs with --noUnusedLocals --noUnusedParameters and only the "unused" diagnostics
// count: tests are not otherwise type-clean, and src/prototype/ is owned elsewhere.
// Prefix a parameter or loop variable with `_` when it must stay.
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const run = promisify(execFile);
const projects = ["tsconfig.json", "worker/tsconfig.json", "tests/tsconfig.json"];
const UNUSED = /^(.+?)\(\d+,\d+\): error TS(6133|6138|6192|6196|6198|6199|6205):/;
const SKIP = ["src/prototype/"];

const outputs = await Promise.all(projects.map(async (project) => {
  try {
    const { stdout } = await run("npx", ["tsc", "-p", project, "--noEmit", "--noUnusedLocals", "--noUnusedParameters", "--pretty", "false"], { maxBuffer: 64 * 1024 * 1024 });
    return stdout;
  } catch (error) {
    if (typeof error?.stdout !== "string") throw error;
    return error.stdout;
  }
}));

const findings = new Set();
for (const line of outputs.join("\n").split("\n")) {
  const match = UNUSED.exec(line);
  if (match && !SKIP.some((prefix) => match[1].startsWith(prefix))) findings.add(line);
}
if (findings.size) {
  console.error([...findings].sort().join("\n"));
  console.error(`check-unused: ${findings.size} unused declaration(s).`);
  process.exit(1);
}
