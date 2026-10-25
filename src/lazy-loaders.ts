// The modules the editor loads on first use: the confirm dialog, History, the
// media picker and its workspace, setup's actions and panels, the spotlight,
// the agent menu, the Site, Page and Navigation settings and the agent's site.
// The host (src/main.ts) keeps what they are made with, and hands it in as
// live ports; each module stays lazy (CODING_STANDARDS "Lazy stays lazy").

import type { AppStore } from "./app-store";
import type { createMediaHost } from "./controllers/media-host";
import type { GuardedEdits } from "./guarded-edit";
import { lazyModule } from "./lazy-module";
import type { createNativeSiteRuntime } from "./native-site-runtime";
import type { createPagesAndFilesHost } from "./pages-and-files-host";
import type { SessionStamp } from "./workspace-session";

type Settings = Parameters<typeof import("./native-settings").createNativeSettings>[0];
type Media = ReturnType<typeof createMediaHost>;
type PagesAndFiles = ReturnType<typeof createPagesAndFilesHost>;

export interface LazyLoadersPorts {
  runtime: ReturnType<typeof createNativeSiteRuntime>;
  appStore: AppStore;
  currentLoad: () => number;
  stampOf: (epoch: number) => SessionStamp;
  loadNativeAssets: Settings["loadNativeAssets"];
  /** Host state, read at call time. */
  readonly guardedEdits: GuardedEdits;
  readonly mediaController: Media["mediaController"];
  readonly mediaPorts: Media["mediaPorts"];
  readonly pagesController: Pick<PagesAndFiles["pagesController"], "pageLabel">;
  readonly pagesAndFiles: Pick<PagesAndFiles, "pageActions">;
  setupScope: () => string;
  restoreFile: (path: string, at: SessionStamp) => Promise<void>;
  nativeSiteReadForCreate: Settings["nativeSiteReadForCreate"];
  readMediaText: Settings["readMediaText"];
  loadPagesActions: () => Promise<unknown>;
  /** Setup's actions' ports, read when they first load. */
  setupActions: () => Parameters<typeof import("./setup-actions").createSetupActions>[0];
}

export function createLazyLoaders(ports: LazyLoadersPorts) {
  // Consts and functions main.ts never reassigns, read once; its `let` state and later consts stay `ports.` reads.
  const { runtime, appStore, currentLoad, stampOf, loadNativeAssets, setupScope, nativeSiteReadForCreate, readMediaText, loadPagesActions } = ports;

  const loadConfirmDialog = lazyModule(() => import("./components/confirm-dialog"));
  const loadHistory = lazyModule(() => import("./components/commit-history"));
  // The media picker and the media workspace behind it (its batches are staged by applyMediaBatch).
  const loadMediaWorkspace = lazyModule(() => Promise.all([import("./page-builder/media-workspace"), import("./page-builder/media-draft-transaction"), import("../shared/media-records")]));
  const loadMedia = lazyModule(async () => {
    const [module, [{ createMediaWorkspace }]] = await Promise.all([import("./page-builder/media-picker"), loadMediaWorkspace()]);
    // Usage badges read the site's usage check, which runs on open.
    // Media lists every kind (pictures, video, audio, PDFs and other downloads); pickers narrow by `accept`.
    module.configureMediaPicker({ ...createMediaWorkspace(() => ports.mediaController.workspaceContext(module.isMediaLibraryPath),
      () => { const pin = ports.mediaPorts.pin?.(); return pin && (() => ports.mediaController.workspaceContext(module.isMediaLibraryPath, pin)); }),
      usage: { records: () => ports.mediaController.usageRecords(), onChange: listener => ports.mediaController.onUsageChange(listener), pageLabel: (file) => ports.pagesController.pageLabel(file) } });
    return module;
  });
  const loadSetupActions = lazyModule(async () => {
    const { createSetupActions } = await import("./setup-actions");
    return createSetupActions(ports.setupActions());
  });
  const loadChecklist = lazyModule(async () => (await Promise.all([import("./components/setup-checklist"), loadSetupActions()]))[0]);
  // The prompt for a coding agent that sets the site up (src/agent-prompts.ts),
  // loaded with the wizard and the start panel that offer it.
  let agentPrompts: typeof import("./agent-prompts") | undefined;
  const loadAgentPrompts = lazyModule(async () => agentPrompts = await import("./agent-prompts"));
  const loadWizard = lazyModule(async () => (await Promise.all([import("./components/setup-wizard"), loadAgentPrompts(), loadSetupActions()]))[0]);
  const loadGetStarted = lazyModule(async () => (await Promise.all([import("./components/get-started"), loadSetupActions()]))[0]);
  const loadStartSite = lazyModule(async () => (await Promise.all([import("./components/start-site"), loadSetupActions()]))[0]);
  // The agent copy is read only beside the spotlight that shows it.
  let onboardingCopy: typeof import("./onboarding-copy") | undefined;
  const loadSpotlight = lazyModule(async () => {
    const [copy, spotlight] = await Promise.all([import("./onboarding-copy"), import("./components/spotlight")]);
    onboardingCopy = copy;
    return spotlight;
  });
  const loadAgentMenu = lazyModule(async () => {
    const [menu, records] = await Promise.all([import("./components/agent-menu"), import("./agent-records")]);
    return { createAgentMenu: (options: Parameters<typeof menu.createAgentMenu>[0]) => menu.createAgentMenu({ ...options, records: records.indexedDbAgentRecords() }) };
  });
  // The Site, Page and Navigation settings dialogs, loaded when one first opens.
  const loadSiteSettings = lazyModule(async () => {
    const [{ createNativeSettings }] = await Promise.all([import("./native-settings"), loadPagesActions()]);
    return createNativeSettings({
      get nativeSite() { return runtime.site; }, get generation() { return currentLoad(); },
      appStore, guardedEdits: ports.guardedEdits, nativeAssets: runtime.state.assets, setupScope,
      nativePageLabelOf: (file) => ports.pagesController.pageLabel(file),
      nativeUrlPlan: (file, value) => ports.pagesAndFiles.pageActions!.urlPlan(file, value),
      changeNativeUrl: (file, value, keep, since, baseline) => ports.pagesAndFiles.pageActions!.changeUrl(file, value, keep, since, baseline),
      restoreFile: (path, epoch) => ports.restoreFile(path, stampOf(epoch)), nativeSiteReadForCreate,
      choosePath: (place, accept) => ports.mediaController.choosePath(place, undefined, accept), nativeEffectiveSource: path => runtime.source(path), loadNativeAssets,
      shareImage: request => ports.mediaController.shareImage(request),
      nativeFiles: () => runtime.files(), readMediaText,
    });
  });
  // What agents are shown and how their commands run (src/agent-site.ts), loaded when one asks.
  const loadAgentSite = lazyModule(() => import("./agent-site"));

  return {
    loadConfirmDialog, loadHistory, loadMediaWorkspace, loadMedia, loadSetupActions, loadChecklist, loadAgentPrompts, loadWizard, loadGetStarted,
    loadStartSite, loadSpotlight, loadAgentMenu, loadSiteSettings, loadAgentSite,
    get agentPrompts() { return agentPrompts; }, get onboardingCopy() { return onboardingCopy; },
  };
}
