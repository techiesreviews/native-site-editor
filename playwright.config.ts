import { defineConfig, type PlaywrightTestConfig } from "@playwright/test";

type Use = PlaywrightTestConfig["use"];
type WebServer = Extract<PlaywrightTestConfig["webServer"], unknown[]>[number];

// Every browser suite, one project each. Pick one with --project, a slice with
// --grep (tags: @smoke, @actual, @native-static), e.g.
//   npx playwright test --project=native-save
//   npx playwright test --grep @smoke
// The fixture groups (default / actual / native-static) run through
// scripts/native-browser-tests.mjs, which sets the fixture and the grep.
//
// Ports: native-save serves on ASE_TEST_PORT (default 5206), native-preview on
// the next port (default 5207), each its own tests/native-save/server.ts over
// a fake GitHub, so the two suites never share repository state.
// ASE_NATIVE_BASE_URL points both at a server that is already running (e.g.
// the demo on 5208) and starts none: a quick targeted run, as in
//   ASE_NATIVE_BASE_URL=http://127.0.0.1:5208 npx playwright test --project=native-preview -g "route links"
const savePort = Number(process.env.ASE_TEST_PORT ?? 5206);
const previewPort = process.env.ASE_TEST_PORT ? savePort + 1 : 5207;
const external = process.env.ASE_NATIVE_BASE_URL;

// Servers start only for the projects this run selects (all when no --project).
function selectedProjects() {
  const names: string[] = [];
  const argv = process.argv;
  for (let i = 0; i < argv.length; i++) {
    // --project takes several names, up to the next option.
    if (argv[i] === "--project") while (argv[i + 1] && !argv[i + 1].startsWith("-")) names.push(argv[++i]);
    else if (argv[i].startsWith("--project=")) names.push(argv[i].slice("--project=".length));
  }
  return names;
}
function runs(project: string) {
  const names = selectedProjects();
  if (!names.length) return true;
  return names.some((name) => new RegExp(`^${name.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*")}$`, "i").test(project));
}
function server(project: string, port: number): WebServer {
  return {
    command: `bash -o pipefail -c 'mkdir -p .scratch/${project}; { echo "server ${project}:${port} started $(date -Is)"; ASE_NATIVE_SAVE_PORT=${port} ./node_modules/.bin/tsx tests/native-save/server.ts; status=$?; echo "server ${project}:${port} exited $status $(date -Is)"; exit $status; } 2>&1 | tee -a .scratch/${project}/server-${port}.log'`,
    stdout: "pipe",
    stderr: "pipe",
    url: `http://127.0.0.1:${port}/api/session`,
    reuseExistingServer: false,
    timeout: 120_000,
    name: project,
  };
}

const app: Use = {
  viewport: { width: 1440, height: 1000 },
  colorScheme: "light",
  reducedMotion: "reduce",
  screenshot: "only-on-failure",
  trace: "retain-on-failure",
  permissions: ["clipboard-read", "clipboard-write"],
};

// Component harnesses (no app server): small viewport, short timeouts.
const harness: Use = { viewport: { width: 800, height: 700 }, reducedMotion: "reduce", screenshot: "only-on-failure" };

export default defineConfig({
  testDir: "./tests",
  workers: 1,
  retries: 0,
  reporter: [
    ["list"],
    ["json", { outputFile: `.scratch/${selectedProjects()[0] ?? "native-save"}/results-${selectedProjects()[0] === "native-preview" ? previewPort : savePort}.json` }],
  ],
  projects: [
    {
      // Native Explicit Save to GitHub: the REAL worker handler over a fake GitHub boundary.
      name: "native-save",
      testDir: "./tests/native-save",
      timeout: 120_000,
      expect: { timeout: 15_000 },
      outputDir: ".scratch/native-save/results",
      use: { ...app, baseURL: external ?? `http://127.0.0.1:${savePort}` },
    },
    {
      name: "native-preview",
      testDir: "./tests/native-preview",
      timeout: 180_000,
      expect: { timeout: 15_000 },
      outputDir: ".scratch/native-preview/results",
      use: { ...app, baseURL: external ?? `http://127.0.0.1:${previewPort}` },
    },
    {
      name: "native-shared-authoring",
      testDir: "./tests/native-shared-authoring",
      timeout: 30_000,
      expect: { timeout: 5_000 },
      outputDir: ".scratch/native-shared-authoring/results",
      use: harness,
    },
    {
      name: "native-shared-structure",
      testDir: "./tests/native-shared-structure",
      timeout: 30_000,
      expect: { timeout: 5_000 },
      outputDir: ".scratch/native-shared-structure/results",
      use: harness,
    },
    {
      // Standalone real-preview bridge and the section bridge regressions.
      name: "native-page-part-preview",
      testMatch: ["native-page-part-preview/*.spec.ts", "native-master-preview/*.spec.ts"],
      timeout: 60_000,
      expect: { timeout: 10_000 },
      outputDir: ".scratch/native-page-part-preview/results",
      use: { viewport: { width: 1440, height: 1000 }, reducedMotion: "reduce", screenshot: "only-on-failure", trace: "retain-on-failure" },
    },
  ],
  webServer: external ? [] : [
    ...(runs("native-save") ? [server("native-save", savePort)] : []),
    ...(runs("native-preview") ? [server("native-preview", previewPort)] : []),
  ],
});
