// The agent menu's wiring: the context agents are shown (it waits for the
// whole site's text index), the files and sources they read, and the menu's
// controller with its connection, requests and questions. The host
// (src/main.ts) keeps the session, the runtime, the preview and the agent's
// commands, and hands them in as live ports.

import type { SharedContext } from "./agent-site";
import { createAgentSiteHost, type AgentSiteHostPorts, type createAgentCommands } from "./agent-site-host";
import type { AgentReadFiles } from "./agent-tools-read";
import type { AppStore } from "./app-store";
import type { CleanSourceCache } from "./clean-source-cache";
import type { createNativePreview } from "./components/native-preview";
import { createAgentController } from "./controllers/agent-controller";
import type { createPageStructureController } from "./controllers/page-structure-controller";
import type { MediaPin } from "./controllers/media-controller";
import { draftStore, type DraftScope } from "./drafts";
import type { GuardedEdits } from "./guarded-edit";
import { withSiteIndexed, type SiteIndexGate } from "./native-boot";
import type { createNativeSiteRuntime } from "./native-site-runtime";
import type { createSetupHost } from "./setup-host";
import { workingPart } from "./working-part";
import type { createWorkspaceMount } from "./workspace-mount";
import type { SessionInfo } from "../shared/types";
import type { createAgentPresence } from "./agent-presence";

export interface AgentMenuHostPorts {
  appStore: AppStore;
  runtime: ReturnType<typeof createNativeSiteRuntime>;
  guardedEdits: Pick<GuardedEdits, "stamp">;
  cleanSources: Pick<CleanSourceCache, "get">;
  agentCommands: Pick<ReturnType<typeof createAgentCommands>, "apply" | "reload">;
  setupController: Pick<ReturnType<typeof createSetupHost>["setupController"], "noteAgent">;
  pageStructureController: Pick<ReturnType<typeof createPageStructureController>, "renderEditBar">;
  mediaPorts: { pin?(): MediaPin | undefined };
  workspace: Pick<ReturnType<typeof createWorkspaceMount>, "activeFileContext" | "repositoryMenu">;
  nativeTextIndexGate: SiteIndexGate;
  /** An agent's question shows on its request's element; get_site tells who works on what; the menu lists and stops them. */
  agentPresence: Pick<ReturnType<typeof createAgentPresence>, "questions" | "onPin" | "colour" | "atWork" | "agents" | "stop" | "stopped" | "heard" | "listen">;
  /** Host state, read at call time. */
  readonly info: SessionInfo | undefined;
  readonly nativePreview: Pick<ReturnType<typeof createNativePreview>, "route" | "setRequests" | "showRequest"> | undefined;
  api: AgentReadFiles["api"];
  readFile: AgentReadFiles["read"];
  readFiles: AgentReadFiles["batch"];
  loadAgentSite: AgentSiteHostPorts["load"];
  loadAgentMenu: Parameters<typeof createAgentController<HTMLElement>>[0]["load"];
  draftScope: () => DraftScope | undefined;
  nativeRouteInfo: (route: string, site: NonNullable<ReturnType<typeof createNativeSiteRuntime>["site"]>) => { title?: string; description?: string };
  pathNow: (path: string) => string | undefined;
  errorMessage: (error: unknown) => void;
}

export function createAgentMenuHost(ports: AgentMenuHostPorts) {
  // Consts and functions main.ts never reassigns, read once; its `let` state and later consts stay `ports.` reads.
  const { appStore, runtime, guardedEdits, cleanSources, agentCommands, setupController, pageStructureController, mediaPorts, workspace,
    nativeTextIndexGate, agentPresence, api, readFile, readFiles, loadAgentSite, loadAgentMenu, draftScope, nativeRouteInfo, pathNow, errorMessage } = ports;

  // Agents see the whole site (its pages are read after the first paint):
  // the context waits for the complete index of the repository open then.
  function agentContext(): Promise<SharedContext | undefined> {
    return withSiteIndexed(nativeTextIndexGate, () => agentSiteHost.context());
  }
  const agentSiteHost = createAgentSiteHost({
    files: () => appStore.repository.value && appStore.snapshot.value ? { repo: appStore.repository.value, snapshot: appStore.snapshot.value,
      api, read: readFile, batch: readFiles, has: (repo, sha) => Boolean(cleanSources.get(repo, sha)) } : undefined,
    stamp: () => guardedEdits.stamp("repository"),
    source: path => runtime.textSource(path),
    atWork: () => agentPresence.atWork(),
    load: loadAgentSite,
    input: () => {
      const scope = draftScope();
      if (!appStore.repository.value || !appStore.snapshot.value || !scope) return undefined;
      const site = runtime.site;
      return {
        repository: { id: appStore.repository.value.id, fullName: appStore.repository.value.full_name },
        branch: appStore.snapshot.value.branch,
        commit: appStore.snapshot.value.commit,
        file: workspace.activeFileContext,
        drafts: draftStore().list(scope),
        mountedSource: (path) => runtime.source(path, scope),
        native: site && {
          site,
          routeInfo: (route) => nativeRouteInfo(route, site),
          source: (path) => runtime.source(path, scope),
          exists: (path) => pathNow(path) === "file",
          openFile: appStore.openFile.value,
          selection: appStore.selection.value && { ...appStore.selection.value, route: ports.nativePreview?.route() },
          working: workingPart.now(),
        },
      };
    },
    mediaPin: () => mediaPorts.pin?.(),
  });

  const agentController = createAgentController<HTMLElement>({
    account: () => ports.info?.user?.login,
    host: () => document.getElementById("agent-menu") ?? undefined,
    appStore,
    load: loadAgentMenu,
    onError: errorMessage,
    createOptions: () => ({
      context: agentContext,
      tools: agentSiteHost.tools(agentContext),
      onCommand: command => agentCommands.apply(command),
      agents: agentPresence,
      reload: snapshot => agentCommands.reload(snapshot),
      // Ask agent shows in the edit bar while an agent is connected.
      onConnection: (connected) => { setupController.noteAgent(connected); if (appStore.selection.value) pageStructureController.renderEditBar(appStore.selection.value); },
      // A pin an agent works on wears its colour, the one its outline and dots have (ticket am-13), and a pin a wait
      // took the agent presence names for it (ticket am-45: its connection's agent, the taker only when it works or
      // is alone there). Only those: asking for a colour gives an agent its place in the order of arrival, which those
      // of earlier sessions (on finished requests) and a watchdog that only took one for its connection's agent must not take.
      onRequests: (requests) => {
        agentPresence.questions(requests);
        ports.nativePreview?.setRequests(requests.map(({ agentTook, ...request }) => {
          const who = agentPresence.onPin(request.id);
          return who ? { ...request, agent: who, colour: agentPresence.colour(who) } : { ...request, ...(agentTook ? { agentTook } : {}) };
        }));
      },
      onQuestions: (count) => workspace.repositoryMenu?.setQuestions(count),
      // A question in the selector's list: its pin, card open, answer box focused.
      onShowRequest: (id) => {
        workspace.repositoryMenu?.close();
        ports.nativePreview?.showRequest(id);
      },
    }),
  });

  return { agentController };
}
