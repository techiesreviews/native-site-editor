import { test } from "node:test";
import assert from "node:assert/strict";
import {
  WIZARD_KEY,
  WIZARD_LIFETIME_MS,
  clearWizard,
  openingStep,
  readWizard,
  stepAfter,
  stepBefore,
  stepNumber,
  writeWizard,
} from "../src/setup-wizard.ts";
import { GITHUB_INSTALL_MEDIA } from "../src/onboarding-media/names.ts";

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
  writeWizard(store, { step: "create", name: "my-site", point: "blank", visibility: "private", waiting: true }, now);
  const back = readWizard(store, now + 1000)!;
  assert.deepEqual({ step: back.step, name: back.name, point: back.point, visibility: back.visibility, waiting: back.waiting }, {
    step: "create",
    name: "my-site",
    point: "blank",
    visibility: "private",
    waiting: true,
  });
  assert.equal(readWizard(store, now + WIZARD_LIFETIME_MS + 1), undefined);
  writeWizard(store, { waiting: false }, now + 2000);
  assert.equal(readWizard(store, now + 3000)!.waiting, undefined);
  clearWizard(store);
  assert.equal(readWizard(store, now), undefined);
});

test("damaged or foreign stored state is ignored", () => {
  const store = memoryStore();
  store.setItem(WIZARD_KEY, "not json");
  assert.equal(readWizard(store), undefined);
  store.setItem(WIZARD_KEY, JSON.stringify({ step: "hack", at: Date.now() }));
  assert.equal(readWizard(store), undefined);
  store.setItem(WIZARD_KEY, JSON.stringify({ step: "online", at: Date.now(), repo: { id: "x" }, point: "evil" }));
  const read = readWizard(store)!;
  assert.equal(read.repo, undefined);
  assert.equal(read.point, undefined);
});

test("steps move one at a time within the four", () => {
  assert.equal(stepNumber("online"), 3);
  assert.equal(stepAfter("connect"), "create");
  assert.equal(stepAfter("open"), "open");
  assert.equal(stepBefore("connect"), "connect");
  assert.equal(stepBefore("open"), "online");
});

test("a returning user whose App is installed skips Connect GitHub; others start there", () => {
  assert.equal(openingStep(undefined, "installed"), "create");
  assert.equal(openingStep({ step: "connect", at: 1 }, "installed"), "create");
  assert.equal(openingStep({ step: "online", at: 1 }, "installed"), "online");
  assert.equal(openingStep(undefined, "signed-out"), "connect");
  assert.equal(openingStep({ step: "create", at: 1 }, "not-installed"), "connect");
});

test("the recording's file names are kept in one place", () => {
  assert.deepEqual(
    GITHUB_INSTALL_MEDIA.video.map((video) => video.file),
    ["github-install.mp4", "github-install.webm"],
  );
  assert.equal(GITHUB_INSTALL_MEDIA.poster, "poster.jpg");
  assert.equal(GITHUB_INSTALL_MEDIA.captions.file, "github-install.vtt");
});
