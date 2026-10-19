import { stripVTControlCharacters } from "node:util";
import { knownFailure } from "./suite-summary.mjs";

const clean = value => stripVTControlCharacters(String(value ?? ""));
const oneLine = value => clean(value).replace(/[\r\n\u2028\u2029]/g, " ").trim();
const short = value => value.length > 160 ? `${value.slice(0, 159)}…` : value;

function unifiedDiff(lines) {
  const header = lines.findIndex((line, index) => /^-\s+Expected(?:\s+[a-z]+)*(?:\s+-\s+\d+)?\s*$/i.test(line) &&
    /^\+\s+Received(?:\s+[a-z]+)*(?:\s+\+\s+\d+)?\s*$/i.test(lines[index + 1] ?? ""));
  if (header < 0) return { lines, values: {} };
  const changes = { expected: [], received: [] };
  let active = true;
  const bounded = lines.map((line, index) => {
    if (index <= header + 1 || !active) return line;
    if (/^Call log:/.test(line)) { active = false; return line; }
    // Preserve leading spaces until here: unchanged context can itself start with - or +.
    const change = /^([-+])(?: (.*))?$/.exec(line);
    if (!change) return line;
    const value = oneLine(change[2]) || "(blank line)";
    changes[change[1] === "-" ? "expected" : "received"].push(value);
    return `${change[1]} ${short(value)}`;
  });
  return { lines: bounded, values: {
    expected: short(changes.expected.join(" ")) || "(no removed lines)",
    received: short(changes.received.join(" ")) || "(no added lines)",
  } };
}

function appFrame(stack) {
  return clean(stack).split(/\r?\n/).find(line => {
    const path = line.replaceAll("\\", "/");
    return /^\s*at\s/.test(line) && /(?:^|[/( ])(?:src|tests|shared|worker|scripts)\/.*:\d+:\d+\)?$/.test(path) &&
      !/(?:node_modules\/|playwright(?:-core)?\/(?:lib|src)\/|node:)/.test(path);
  })?.trim();
}

function digest(spec, test, titles, { logPath, entries }) {
  const attempt = test.results?.findLast(result => result.status !== test.expectedStatus && result.status !== "skipped") ?? test.results?.at(-1);
  const error = attempt?.errors?.[0] ?? attempt?.error;
  const message = clean(error?.message ?? error?.value ?? error?.stack ?? "No error recorded").trim();
  const diff = unifiedDiff(message.split(/\r?\n/));
  // Bound assertion values before either the excerpt or extracted fields render them.
  const messageLines = diff.lines.map(line => {
    const text = oneLine(line);
    // Playwright labels include value, array, length and other matcher-specific suffixes.
    const assertion = /^((expected|received)(?:\s+[^:]+)?):\s*(.*)$/i.exec(text);
    const value = assertion ? short(assertion[3]) : undefined;
    return { text: assertion ? `${assertion[1]}: ${value}` : text, name: assertion?.[2].toLowerCase(), value };
  });
  const known = knownFailure(spec, entries);
  const label = known ? ` [${known.status === "flaky" ? "known flaky" : "known failing on dev"}]` : "";
  const project = test.projectName && test.projectName !== "native-save" ? ` [${oneLine(test.projectName)}]` : "";
  const lines = [`${oneLine(spec.file)}:${spec.line ?? 0}${project} ${oneLine([...titles, spec.title].filter(Boolean).join(" > "))}${label}`];
  lines.push(...messageLines.slice(0, 3).map(line => `  ${line.text}`));
  for (const name of ["expected", "received"]) {
    const value = messageLines.find(line => line.name === name)?.value ?? diff.values[name];
    if (value !== undefined) lines.push(`  ${name}: ${value}`);
  }
  const frame = appFrame(error?.stack ?? message);
  if (frame) lines.push(`  ${oneLine(frame)}`);
  lines.push(`  log: ${oneLine(logPath)}`);
  const attachments = attempt?.attachments ?? [];
  // One context and one trace leave room for all required fields within ten lines.
  for (const [name, matches] of [
    ["context", attachment => /(?:^|[/\\])error-context\.md$/.test(attachment.path ?? "")],
    ["trace", attachment => attachment.name === "trace" || /(?:^|[/\\])trace\.zip$/.test(attachment.path ?? "")],
  ]) {
    const attachment = attachments.find(attachment => attachment.path && matches(attachment));
    if (attachment) lines.push(`  ${name}: ${oneLine(attachment.path)}`);
  }
  return lines.join("\n");
}

/** Pure, bounded failure output from { report, logPath } runs; never reads artifacts. */
export function specsDigest(runs, { entries = [], directory = "" } = {}) {
  const digests = [];
  let failed = 0;
  const visit = (suite, run, parents = [], inheritedFile) => {
    const file = suite.file ?? inheritedFile;
    const titles = [...parents, suite.title].filter(Boolean);
    for (const spec of suite.specs ?? []) for (const test of spec.tests ?? []) {
      if (test.status !== "unexpected") continue;
      failed++;
      if (digests.length < 10) digests.push(digest({ ...spec, file: spec.file ?? file }, test, titles, { logPath: run.logPath, entries }));
    }
    for (const child of suite.suites ?? []) visit(child, run, titles, file);
  };
  for (const run of runs) if (Array.isArray(run.report?.suites)) for (const suite of run.report.suites) visit(suite, run);
  if (failed > 10) digests.push(`… and ${failed - 10} more failing tests (${oneLine(directory)})`);
  return digests.join("\n\n");
}
