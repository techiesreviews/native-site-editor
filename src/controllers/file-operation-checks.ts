import { mediaFamilyOf, renamedFamily, familyMembers } from "../page-builder/media-families";
import { isRenamableMedia, mediaFileName, suggestMediaName } from "../page-builder/media-names";
import { pageLinkSources } from "./pages-controller";
import { filesLinkingTo, linkNote, protectedPathProblem, type FileOperation } from "../native-files";
import { nativePageRoute } from "../../shared/native-routes";
import { NATIVE_HOME_PAGE } from "../../shared/native-project";
import type { Reads } from "../guarded-edit";
import type { FileRowTarget } from "../components/file-row-actions";
import type { FileOperationsPorts, FileOperationsTreeState, FileOperationsController } from "./file-operations-controller";

/** Synchronous Files validation and Restore stay available before any action chunk loads. */
export function createFileOperationChecks(ports: FileOperationsPorts) {
  function restoreFileTarget(target: FileRowTarget) {
    const state = ports.treeState();
    const paths = target.folder
      ? [...state.deleted.keys()].filter((path) => path.startsWith(`${target.path}/`))
      : familyRestore(target.path, state);
    ports.undoFileChanges({ restore: paths });
    ports.requestAnimationFrame(() => ports.fileRow(target.path)?.focus());
  }

  // A deleted main image comes back with the copies and original deleted beside it;
  // members renamed away stay where they went.
  function familyRestore(path: string, state: FileOperationsTreeState) {
    const family = mediaFamilyOf(path, [path, ...ports.nativeFiles(), ...state.deleted.keys()]);
    const members = family ? familyMembers(family).slice(1) : [];
    return [path, ...members.filter(member => state.deleted.has(member) && !state.deleted.get(member)!.movedTo)];
  }

  // The protected file a target takes: the home page.
  function protectedProblem(target: FileRowTarget, operation: FileOperation) {
    const home = ports.engaged() ? NATIVE_HOME_PAGE : undefined;
    const inside = (path: string | undefined) => path !== undefined && (path === target.path || (target.folder && path.startsWith(`${target.path}/`)));
    return protectedPathProblem([home].filter(inside) as string[], operation, home, ports.engaged());
  }

  // Why `source` cannot be renamed or moved to `to`, as known without asking GitHub.
  function moveProblem(source: FileRowTarget, to: string, operation: FileOperation): string | undefined {
    if (to === source.path) return undefined;
    const guarded = protectedProblem(source, operation);
    if (guarded) return guarded;
    if (source.folder && to.startsWith(`${source.path}/`)) return `A folder cannot go inside itself.`;
    const state = ports.treeState();
    const now = ports.pathNow(to, state);
    if (now === "file" || now === "folder") return `${to} already exists.`;
    if (now === "deleted") {
      // Only what was renamed away from there may go back.
      const back = source.folder
        ? [...state.deleted.values()].filter((draft) => draft.path.startsWith(`${to}/`)).every((draft) => draft.movedTo?.startsWith(`${source.path}/`))
        : state.deleted.get(to)?.movedTo === source.path;
      if (!back) return `${to} is deleted in your changes. Restore it, or choose another name.`;
    }
    const parts = to.split("/");
    for (let index = 1; index < parts.length; index++) {
      const parent = parts.slice(0, index).join("/");
      if (ports.pathNow(parent, state) === "file") return `${parent} is a file, so nothing can go in it.`;
    }
    return undefined;
  }

  function targetFamily(target: FileRowTarget) {
    return target.folder ? undefined : mediaFamilyOf(target.path, ports.nativeFiles());
  }

  // For a confirmation: the pages, components and stylesheets that link to
  // the pages among `paths` whose URL goes away.
  function pageLinks(paths: string[], moves: Map<string, string | undefined>, action: "deleted" | "moved", r: Reads = ports.edits.peek) {
    const site = r.site();
    if (!site) return undefined;
    const routes = paths.flatMap((path) => {
      const route = Object.entries(site.routes).find(([, file]) => file === path)?.[0];
      if (!route) return [];
      const to = moves.get(path);
      return to && (Object.entries(site.routes).find(([, file]) => file === to)?.[0] ?? nativePageRoute(to)) === route ? [] : [route];
    });
    if (!routes.length) return undefined;
    return linkNote(filesLinkingTo(pageLinkSources(ports.nativeFiles(), path => r.source(path)), routes, new Set(paths)), routes, action);
  }

  function isMediaTarget(target: FileRowTarget) {
    return !target.folder && (isRenamableMedia(target.path) || Boolean(targetFamily(target)));
  }

  // Whether any member of the media file's family would land on a file or folder already there.
  function mediaTaken(source: FileRowTarget, to: string) {
    const family = targetFamily(source), state = ports.treeState();
    return (family ? renamedFamily(family, to) : [{ from: source.path, to }])
      .some(move => move.from !== move.to && ["file", "folder"].includes(ports.pathNow(move.to, state) ?? ""));
  }

  // A move's problem as the Files tab shows it while typing: a media file keeps its format, and a
  // name taken by any family member is refused with the next free numbered one.
  function fileMoveProblem(source: FileRowTarget, to: string, operation: FileOperation): string | undefined {
    if (!isMediaTarget(source) || to === source.path) return moveProblem(source, to, operation);
    if ((/\.[^./]+$/.exec(to)?.[0] ?? "").toLowerCase() !== (/\.[^./]+$/.exec(source.path)?.[0] ?? "").toLowerCase()) return "Keep the image's file format when renaming it.";
    if (mediaTaken(source, to)) return `${to} is taken. Try ${suggestMediaName(to, candidate => mediaTaken(source, candidate))}.`;
    return moveProblem(source, to, operation);
  }
  function targetDrafts(target: FileRowTarget) {
    const scope = ports.draftScope(), prefix = `${target.path}/`;
    const drafts = scope ? ports.draftStore().list(scope) : [];
    const family = targetFamily(target);
    const members = new Set(family ? familyMembers(family) : [target.path]);
    return JSON.stringify(drafts.filter(draft => members.has(draft.path) || (target.folder && draft.path.startsWith(prefix))).sort((a, b) => a.path.localeCompare(b.path)));
  }

  return { restoreFileTarget, protectedProblem, moveProblem, targetFamily, targetDrafts, pageLinks, isMediaTarget, mediaTaken, fileMoveProblem };
}

/** Mutation code loads on the action, holding the original edit proof across that load. */
export function createLazyFileOperationsController(ports: FileOperationsPorts, load: () => Promise<typeof import("./file-operations-controller")>) {
  let controller: FileOperationsController | undefined;
  const get = async () => {
    if (controller) return controller;
    const module = await load();
    return controller ??= module.createFileOperationsController(ports);
  };
  const changed = "The repository changed meanwhile. Try again.";
  const checks = createFileOperationChecks(ports);
  const capture = (target: FileRowTarget) => {
    const since = ports.edits.stamp(), key = ports.nativeFiles().sort().join("\n"), drafts = checks.targetDrafts(target);
    return { since, holds: () => since.holds() && ports.nativeFiles().sort().join("\n") === key && checks.targetDrafts(target) === drafts };
  };
  return {
    ...checks,
    async moveFileTarget(this: void, ...args: Parameters<FileOperationsController["moveFileTarget"]>) {
      // What is refused without asking GitHub is refused at once, as before, without the chunk.
      const [source, value, operation] = args;
      const to = checks.isMediaTarget(source) && operation === "rename" ? value.slice(0, value.lastIndexOf("/") + 1) + mediaFileName(source.path, value.split("/").at(-1)!) : value;
      const problem = checks.fileMoveProblem(source, to, operation);
      if (problem) return problem;
      if (to === source.path) return undefined;
      const proof = capture(source);
      const actions = await get();
      if (!proof.holds()) return changed;
      return actions.moveFileTarget(...args);
    },
    async deleteFileTarget(this: void, ...args: Parameters<FileOperationsController["deleteFileTarget"]>) {
      const target = args[0];
      if (target.gone) return `${target.path} is deleted already.`;
      const guarded = checks.protectedProblem(target, "delete");
      if (guarded) { ports.errorMessage(new Error(guarded)); ports.refuse(guarded); return guarded; }
      const proof = capture(target);
      // Keep the original index wait and refusal order even when the action chunk is still loading.
      const [actions, indexed] = await Promise.all([get(), ports.ensureNativeTextIndex()]);
      if (indexed && proof.since.holds()) { ports.errorMessage(new Error(indexed)); return indexed; }
      if (!proof.holds()) {
        const message = proof.since.changed() === "scope" ? changed : "The repository or source changed meanwhile. Try again.";
        ports.errorMessage(new Error(message)); ports.refuse(message); return message;
      }
      return actions.deleteFileTarget(...args);
    },
    async duplicateFileTarget(this: void, ...args: Parameters<FileOperationsController["duplicateFileTarget"]>) {
      if (!ports.draftScope() || args[0].folder || args[0].gone) return;
      const since = ports.edits.stamp();
      const actions = await get();
      if (!since.holds()) { ports.errorMessage(new Error(changed)); ports.refuse(changed); return; }
      return actions.duplicateFileTarget(...args);
    },
    async targetFiles(...args: Parameters<FileOperationsController["targetFiles"]>) {
      const since = ports.edits.stamp();
      const actions = await get();
      if (!since.holds()) return [];
      return actions.targetFiles(...args);
    },
  };
}
