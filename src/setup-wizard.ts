// The Setup wizard's state: which step a new user is on and what they chose,
// kept in localStorage so it survives a reload. Pure and
// storage-agnostic, so it is tested without a browser (tests/setup-wizard.test.ts).
import type { StartingPoint } from "../shared/starting-point";

export type WizardStepId = "connect" | "create" | "agent" | "online" | "open";

export const WIZARD_STEPS: { id: WizardStepId; title: string; optional?: boolean }[] = [
  { id: "connect", title: "Connect GitHub" },
  { id: "create", title: "Create your site" },
  { id: "agent", title: "Connect an agent", optional: true },
  { id: "online", title: "Put it online" },
  { id: "open", title: "Open the editor" },
];

/** The repository the wizard made, as far as the later steps need it. */
export interface WizardRepo {
  id: number;
  name: string;
  fullName: string;
  private: boolean;
  defaultBranch: string;
  owner: string;
  /** The starting point is its first commit. False: it is empty and Start your site (drafts) takes over. */
  committed: boolean;
  /** Only part of the starting point was committed: the editor offers to finish adding it. */
  partial?: boolean;
}

export interface WizardMemory {
  step: WizardStepId;
  name?: string;
  owner?: string;
  point?: StartingPoint;
  visibility?: "public" | "private";
  repo?: WizardRepo;
  /** When it was last changed (ms); old state is forgotten. */
  at: number;
}

type Store = Pick<Storage, "getItem" | "setItem" | "removeItem">;

export const WIZARD_KEY = "native-site-editor:setup-wizard";
/** A wizard left alone this long starts again from the first step. */
export const WIZARD_LIFETIME_MS = 24 * 60 * 60 * 1000;

const stepIds = new Set<string>(WIZARD_STEPS.map((step) => step.id));

export function readWizard(store: Store, now = Date.now()): WizardMemory | undefined {
  try {
    const value = JSON.parse(store.getItem(WIZARD_KEY) ?? "null");
    if (!value || typeof value !== "object" || !stepIds.has(value.step) || typeof value.at !== "number") return undefined;
    if (now - value.at > WIZARD_LIFETIME_MS || value.at > now + 60_000) return undefined;
    const out: WizardMemory = { step: value.step, at: value.at };
    if (typeof value.name === "string") out.name = value.name.slice(0, 100);
    if (typeof value.owner === "string") out.owner = value.owner.slice(0, 100);
    if (value.point === "starter" || value.point === "blank") out.point = value.point;
    if (value.visibility === "public" || value.visibility === "private") out.visibility = value.visibility;
    const repo = value.repo;
    if (repo && typeof repo === "object" && Number.isSafeInteger(repo.id) && typeof repo.name === "string" && typeof repo.fullName === "string")
      out.repo = {
        id: repo.id,
        name: repo.name,
        fullName: repo.fullName,
        private: repo.private === true,
        defaultBranch: typeof repo.defaultBranch === "string" && repo.defaultBranch ? repo.defaultBranch : "main",
        owner: typeof repo.owner === "string" ? repo.owner : "",
        committed: repo.committed === true,
        ...(repo.partial === true ? { partial: true } : {}),
      };
    return out;
  } catch {
    return undefined;
  }
}

export function writeWizard(store: Store, change: Partial<WizardMemory>, now = Date.now()): WizardMemory {
  const next: WizardMemory = { ...(readWizard(store, now) ?? { step: "create" }), ...change, at: now };
  delete (next as { waiting?: boolean }).waiting; // kept by an older version: the wizard no longer waits in another tab
  try {
    store.setItem(WIZARD_KEY, JSON.stringify(next));
  } catch {
    // Storage unavailable: the wizard works for this page load only.
  }
  return next;
}

export function clearWizard(store: Store) {
  try {
    store.removeItem(WIZARD_KEY);
  } catch {
    // Nothing kept.
  }
}

export const stepNumber = (id: WizardStepId) => WIZARD_STEPS.findIndex((step) => step.id === id) + 1;
export const stepAfter = (id: WizardStepId): WizardStepId => WIZARD_STEPS[Math.min(WIZARD_STEPS.length - 1, stepNumber(id))].id;
export const stepBefore = (id: WizardStepId): WizardStepId => WIZARD_STEPS[Math.max(0, stepNumber(id) - 2)].id;

/** What the account's connection to GitHub is: signed in without the App, or with it installed (a signed-out visitor sees the sign-in screen, not the wizard). */
export type Connection = "signed-out" | "not-installed" | "installed";

/**
 * The step a wizard opens on: an account whose App is installed skips Connect
 * GitHub (it shows done); one without it opens there, with the retry, unless
 * its site already exists.
 */
export function openingStep(memory: WizardMemory | undefined, connection: Connection): WizardStepId {
  const remembered = memory?.step ?? "create";
  if (connection === "installed") return remembered === "connect" ? "create" : remembered;
  // Not connected: nothing after the first step can work, unless the site already exists.
  return memory?.repo ? remembered : "connect";
}

/** What /api/session's `onboarding` means for the wizard. */
export function connectionFromOnboarding(onboarding: "install" | "create" | null | undefined): Connection | undefined {
  return onboarding === "install" ? "not-installed" : onboarding === "create" ? "installed" : undefined;
}
