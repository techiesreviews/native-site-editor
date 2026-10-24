import { AGENT_TEXT_LIMIT, isMediaUploadWrite, OUTSIDE_MEDIA_REFUSED, parseOutlineId, textBytes,
  type AgentCommandArgs, type AgentOperation } from "./agent";
import { applyReplacements } from "./agent-replacements";
import { HttpError } from "./http-error";
import { SiteFiles } from "./site-files";
import { fileInTheWay, foldersAbove, makeComponentProblem, pageAddressProblem, writablePathProblem } from "./site-rules";
import { findPageRef, noHomePage } from "./agent-read";
import { agentTools } from "./agent-tool-table";
import type { AgentPageOutline, EditorContext } from "./types";
type Page = NonNullable<EditorContext["pages"]>[number];

export interface AgentEditArgsMap {
  edit_file: { path: string; expectedHash: string; edits: { oldText: string; newText: string; all?: boolean }[] };
  write_file: { path: string; content: string; expectedHash?: string | null };
  move_file: { path: string; to: string; keepOldUrl?: boolean };
  delete_file: { path: string };
  create_page: { title: string; parent?: string; slug?: string };
  set_page_details: { page: string; title?: string; description?: string };
  open_page: { page: string };
  inspect_preview: { page?: string; element?: string; selector?: string; limit?: number };
  make_component: { page: string; element: string; tag: string; fixed?: string[]; expectedHash: string };
  add_section: { page: string; component: string; expectedHash: string; before?: string; after?: string };
  move_section: { page: string; section: string; expectedHash: string; before?: string; after?: string };
  remove_section: { page: string; section: string; expectedHash: string };
}
export type AgentEditTool = keyof AgentEditArgsMap;
export type AgentEdit = { [K in AgentEditTool]: {
  operation: "edit"; tool: K; args: AgentEditArgsMap[K]; id: string; grantId: string; generation?: number; createdAt: number;
} }[AgentEditTool];
export interface AgentStatus { operation: "status"; id: string; grantId: string; generation?: number }
export type PreparedEdit = { operation: AgentOperation; input: {
  path: string; content?: string; expectedHash?: string | null; args?: AgentCommandArgs;
} } | { unchanged: { state: "unchanged"; message: string } };

  function findPage(context: EditorContext, ref: string) {
    const pages = context.pages;
    if (!pages) throw new HttpError(400, noHomePage);
    const page = findPageRef(pages, ref);
    if (!page?.file) throw new HttpError(404, `No page ${ref}. get_site lists the pages.`);
    return page as Page & { file: string };
  }
  function outlineOf(context: EditorContext, file: string): AgentPageOutline {
    const outline = context.site?.outlines.find((item) => item.file === file);
    if (!outline)
      throw new HttpError(409, `The editor has no outline of ${file} yet. Try again in a moment.`);
    return outline;
  }
  function checkHash(expected: string | undefined, actual: string, what: string) {
    if (expected !== actual)
      throw new HttpError(
        409,
        `${what} changed since you read it (its hash is now ${actual}). Read it again.`,
      );
  }

  function placement(outline: AgentPageOutline, before?: string, after?: string) {
    if (before && after) throw new HttpError(400, "Give before or after, not both.");
    const anchor = before ?? after;
    if (anchor) {
      const node = parseOutlineId(anchor);
      const section = outline.sections.find((item) => item.id === anchor);
      if (!node || !section) throw new HttpError(404, `No section ${anchor} on this page. get_page lists them.`);
      const container = node.slice(0, -1).join(".");
      return { container, index: node[node.length - 1] + (after ? 1 : 0) };
    }
    if (outline.containers.length !== 1)
      throw new HttpError(
        400,
        outline.containers.length
          ? "This page has several places for sections. Say before or after which section."
          : "This page has no place for sections (no <main> or section container).",
      );
    const [only] = outline.containers;
    return { container: only.id, index: only.children };
  }

export function checkContent(content: string) {
  if (textBytes(content) > AGENT_TEXT_LIMIT || content.includes("\0"))
    throw new HttpError(400, `Drafts hold text files up to ${AGENT_TEXT_LIMIT / 1024 / 1024} MB.`);
}


/** One preparation implementation for live browser execution and the temporary legacy queue. */
export async function prepareAgentEdit(request: AgentEdit, context: EditorContext, files: SiteFiles): Promise<PreparedEdit> {
  const refuse = (message: string): never => { throw new HttpError(400, message); };
  const unchanged = (value: { state: "unchanged"; message: string }): PreparedEdit => ({ unchanged: value });
  // The command an edit becomes is its table row's (edit_file: write_file).
  const queue = (input: Extract<PreparedEdit, { operation: AgentOperation }>["input"]): PreparedEdit => ({ operation: agentTools[request.tool].operation, input });
  switch (request.tool) {
    case "edit_file": {
      const { path, expectedHash, edits } = request.args;
      const problem = writablePathProblem(path);
      if (problem) return refuse(problem);
      const file = await files.read(path);
      if (!file) return refuse(`${path} does not exist. Use write_file to create it.`);
      checkHash(expectedHash, file.hash, path);
      const edited = applyReplacements(file.content, edits);
      if (!edited.ok) return refuse(edited.error);
      if (edited.text === file.content) return unchanged({ state: "unchanged", message: "The edits change nothing." });
      checkContent(edited.text);
      return queue({ path, content: edited.text, expectedHash: file.hash });
    }
    case "write_file": {
      const { path, content, expectedHash } = request.args;
      const problem = writablePathProblem(path);
      if (problem) return refuse(problem);
      if (isMediaUploadWrite(path)) return refuse(OUTSIDE_MEDIA_REFUSED);
      checkContent(content);
      const file = await files.read(path);
      if (file) {
        if (!expectedHash)
          return refuse(`${path} exists (hash ${file.hash}). Pass that as expectedHash to replace it, or use edit_file.`);
        checkHash(expectedHash, file.hash, path);
        if (file.content === content) return unchanged({ state: "unchanged", message: "The file already has this text." });
      } else {
        if (expectedHash) return refuse(`${path} does not exist; omit expectedHash to create it.`);
        if (await files.isFolder(path)) return refuse(`${path} is a folder.`);
        for (const parent of foldersAbove(path))
          if (await files.read(parent).catch(() => undefined)) return refuse(fileInTheWay(parent));
      }
      return queue({ path, content, expectedHash: file?.hash ?? null });
    }
    case "move_file": {
      const { path, to, keepOldUrl } = request.args;
      const problem = writablePathProblem(path) ?? writablePathProblem(to);
      if (problem) return refuse(problem);
      if (path === to) return refuse("The new path is the same.");
      return queue({
        path,
        args: { to, ...(keepOldUrl !== undefined ? { keepOldUrl } : {}) },
      });
    }
    case "delete_file": {
      const { path } = request.args;
      const problem = writablePathProblem(path);
      if (problem) return refuse(problem);
      return queue({ path });
    }
    case "create_page": {
      const { title, parent, slug } = request.args;
      if (!context.pages) return refuse(noHomePage);
      const under = parent ? parent.replace(/^\/?/, "/").replace(/\/?$/, "/") : "/";
      if (under !== "/" && !context.pages.some((page) => page.route === under))
        return refuse(`No page at ${under}. get_site lists the pages; a page at an .html URL has no subpages.`);
      const address = slug === undefined ? undefined : pageAddressProblem(slug);
      if (address) return refuse(address);
      return queue({
        // The parent's folder: one new page there waits at a time.
        path: under === "/" ? "." : under.slice(1, -1),
        args: { parent: under, title, ...(slug ? { slug } : {}) },
      });
    }
    case "set_page_details": {
      const { page: ref, title, description } = request.args;
      if (title === undefined && description === undefined) return refuse("Give a title, a description, or both.");
      const page = findPage(context, ref);
      return queue({
        path: page.file,
        args: {
          ...(title !== undefined ? { title } : {}),
          ...(description !== undefined ? { description } : {}),
        },
      });
    }
    case "open_page": {
      const { page: ref } = request.args;
      const page = context.pages && findPageRef(context.pages, ref);
      const path = page?.file ?? ref;
      const problem = writablePathProblem(path, { readOnly: true });
      if (problem) return refuse(problem);
      return queue({ path });
    }
    case "inspect_preview": {
      const { page: ref, element, selector, limit } = request.args;
      if (element !== undefined && selector !== undefined) return refuse("Give element or selector, not both.");
      if (element !== undefined && !parseOutlineId(element)) return refuse(`${element} is not an element id; get_page lists them.`);
      const route = ref ?? context.site?.openRoute;
      if (!route) return refuse("The editor shows no page now. Give page.");
      const page = findPage(context, route);
      return queue({
        path: page.file!,
        args: {
          ...(element !== undefined ? { element } : {}),
          ...(selector !== undefined ? { selector } : {}),
          ...(limit !== undefined ? { limit } : {}),
        },
      });
    }
    case "make_component": {
      const { page: ref, element, tag, fixed, expectedHash } = request.args;
      if (!parseOutlineId(element)) return refuse(`${element} is not an element id; get_page lists them.`);
      const named = makeComponentProblem(undefined, tag, []);
      if (named) return refuse(named);
      const page = findPage(context, ref);
      const outline = outlineOf(context, page.file);
      checkHash(expectedHash, outline.hash, page.file);
      // The outline knows the tags of the containers and sections; the editor checks any other element.
      const source = outline.containers.find((item) => item.id === element) ?? outline.sections.find((item) => item.id === element);
      const problem = makeComponentProblem(source, tag, context.site?.components.map((item) => item.tag) ?? []);
      if (problem) return refuse(problem);
      return queue({
        path: page.file,
        expectedHash,
        args: { element, tag, ...(fixed !== undefined ? { fixed } : {}) },
      });
    }
    case "add_section": {
      const { page: ref, component, expectedHash, before, after } = request.args;
      const page = findPage(context, ref);
      const outline = outlineOf(context, page.file);
      checkHash(expectedHash, outline.hash, page.file);
      const known = context.site?.components.find((item) => item.tag === component);
      if (!known) return refuse(`No component <${component}>. get_site lists the components.`);
      if (!known.section) return refuse(`<${component}> is not a section component (its template is not one <section>), so it cannot go between sections.`);
      const at = placement(outline, before, after);
      return queue({
        path: page.file,
        expectedHash,
        args: { component, container: at.container, index: at.index },
      });
    }
    case "move_section": {
      const { page: ref, section, expectedHash, before, after } = request.args;
      if (!before && !after) return refuse("Say before or after which section it goes.");
      const page = findPage(context, ref);
      const outline = outlineOf(context, page.file);
      checkHash(expectedHash, outline.hash, page.file);
      const moving = outline.sections.find((item) => item.id === section);
      if (!moving) return refuse(`No section ${section} on this page. get_page lists them.`);
      const at = placement(outline, before, after);
      if (section.split(".").slice(0, -1).join(".") !== at.container)
        return refuse("A section moves among its own siblings only.");
      return queue({
        path: page.file,
        expectedHash,
        args: { section, tag: moving.tag, container: at.container, index: at.index },
      });
    }
    case "remove_section": {
      const { page: ref, section, expectedHash } = request.args;
      const page = findPage(context, ref);
      const outline = outlineOf(context, page.file);
      checkHash(expectedHash, outline.hash, page.file);
      const removed = outline.sections.find((item) => item.id === section);
      if (!removed) return refuse(`No section ${section} on this page. get_page lists them.`);
      return queue({
        path: page.file,
        expectedHash,
        args: { section, tag: removed.tag },
      });
    }
  }
}
