import { test } from "node:test";
import assert from "node:assert/strict";
import {
  WIZARD_KEY,
  WIZARD_LIFETIME_MS,
  WIZARD_STEPS,
  clearWizard,
  connectionFromOnboarding,
  openingStep,
  readWizard,
  stepAfter,
  stepBefore,
  stepNumber,
  writeWizard,
} from "../src/setup-wizard.ts";
import { GITHUB_INSTALL_MEDIA, GITHUB_SCREENSHOTS, VIDEO_REPLACES_SCREENSHOT } from "../src/onboarding-media/names.ts";

function memoryStore() {
  const data = new Map<string, string>();
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => void data.set(key, value),
    removeItem: (key: string) => void data.delete(key),
  };
}

test("the wizard's state survives a round trip and is forgotten after a day", () => {
  const store = memoryStore();
  const now = 1_000_000;
  writeWizard(store, { step: "create", name: "my-site", point: "blank", visibility: "private" }, now);
  const back = readWizard(store, now + 1000)!;
  assert.deepEqual({ step: back.step, name: back.name, point: back.point, visibility: back.visibility }, {
    step: "create",
    name: "my-site",
    point: "blank",
    visibility: "private",
  });
  assert.equal(readWizard(store, now + WIZARD_LIFETIME_MS + 1), undefined);
  // State kept by an older version that waited in another tab is read without it.
  store.setItem(WIZARD_KEY, JSON.stringify({ step: "connect", waiting: true, at: now }));
  assert.equal("waiting" in readWizard(store, now)!, false);
  clearWizard(store);
  assert.equal(readWizard(store, now), undefined);
});

test("damaged or foreign stored state is ignored", () => {
  const store = memoryStore();
  store.setItem(WIZARD_KEY, "not json");
  assert.equal(readWizard(store), undefined);
  store.setItem(WIZARD_KEY, JSON.stringify({ step: "hack", at: Date.now() }));
  assert.equal(readWizard(store), undefined);
  store.setItem(WIZARD_KEY, JSON.stringify({ step: "open", at: Date.now(), repo: { id: "x" }, point: "evil" }));
  const read = readWizard(store)!;
  assert.equal(read.repo, undefined);
  assert.equal(read.point, undefined);
});

test("the steps run Connect GitHub, Create your site, Your site is ready", () => {
  assert.deepEqual(
    WIZARD_STEPS.map((step) => step.title),
    ["Connect GitHub", "Create your site", "Your site is ready"],
  );
  assert.equal(stepNumber("open"), 3);
  assert.equal(stepAfter("create"), "open");
  assert.equal(stepAfter("open"), "open");
  assert.equal(stepBefore("connect"), "connect");
  assert.equal(stepBefore("open"), "create");
});

test("a wizard kept by an older version at its agent or online step opens on the last page", () => {
  for (const step of ["agent", "online"]) {
    const store = memoryStore();
    store.setItem(WIZARD_KEY, JSON.stringify({ step, at: Date.now() }));
    assert.equal(readWizard(store)!.step, "open");
  }
});

test("an account whose App is installed skips Connect GitHub; one without it opens there, with the retry", () => {
  assert.equal(openingStep(undefined, "installed"), "create");
  assert.equal(openingStep({ step: "connect", at: 1 }, "installed"), "create");
  assert.equal(openingStep({ step: "open", at: 1 }, "installed"), "open");
  assert.equal(openingStep(undefined, "not-installed"), "connect");
  assert.equal(openingStep({ step: "create", at: 1 }, "not-installed"), "connect");
});

test("the session's onboarding says which connection the wizard starts from", () => {
  assert.equal(connectionFromOnboarding("install"), "not-installed");
  assert.equal(connectionFromOnboarding("create"), "installed");
  assert.equal(connectionFromOnboarding(null), undefined);
  assert.equal(connectionFromOnboarding(undefined), undefined);
});

test("the recording's file names are kept in one place", () => {
  assert.deepEqual(
    GITHUB_INSTALL_MEDIA.video.map((video) => video.file),
    ["github-install.mp4", "github-install.webm"],
  );
  assert.equal(GITHUB_INSTALL_MEDIA.poster, "poster.jpg");
  assert.equal(GITHUB_INSTALL_MEDIA.captions.file, "github-install.vtt");
});

test("the screenshots are named in one place, with alt text, and the recording replaces the install one", () => {
  assert.deepEqual(GITHUB_SCREENSHOTS.map((shot) => shot.png), ["github-signin.png", "github-install.png"]);
  assert.deepEqual(GITHUB_SCREENSHOTS.map((shot) => shot.webp), ["github-signin.webp", "github-install.webp"]);
  for (const shot of GITHUB_SCREENSHOTS) assert.ok(shot.alt.length > 20 && shot.caption);
  assert.equal(VIDEO_REPLACES_SCREENSHOT, "install");
  assert.ok(GITHUB_SCREENSHOTS.some((shot) => shot.id === VIDEO_REPLACES_SCREENSHOT));
});
