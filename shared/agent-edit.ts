import { AGENT_TEXT_LIMIT, isMediaUploadWrite, OUTSIDE_MEDIA_REFUSED, parseOutlineId, textBytes,
  type AgentCommandArgs, type AgentOperation } from "./agent";
import { applyReplacements } from "./agent-replacements";
import { HttpError } from "./http-error";
import { SiteFiles, writablePathProblem } from "./site-files";
import { isNativeComponentTag } from "./native-project";
import { findPageRef, noHomePage } from "./agent-read";
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
  const queue = (operation: AgentOperation, input: Extract<PreparedEdit, { operation: AgentOperation }>["input"]): PreparedEdit => ({ operation, input });
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
      return queue("write_file", { path, content: edited.text, expectedHash: file.hash });
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
        const parts = path.split("/");
        for (let index = 1; index < parts.length; index++) {
          const parent = parts.slice(0, index).join("/");
          if (await files.read(parent).catch(() => undefined))
            return refuse(`${parent} is a file, so nothing can go in it.`);
        }
      }
      return queue("write_file", { path, content, expectedHash: file?.hash ?? null });
    }
    case "move_file": {
      const { path, to, keepOldUrl } = request.args;
      const problem = writablePathProblem(path) ?? writablePathProblem(to);
      if (problem) return refuse(problem);
      if (path === to) return refuse("The new path is the same.");
      return queue("move_file", {
        path,
        args: { to, ...(keepOldUrl !== undefined ? { keepOldUrl } : {}) },
      });
    }
    case "delete_file": {
      const { path } = request.args;
      const problem = writablePathProblem(path);
      if (problem) return refuse(problem);
      return queue("delete_file", { path });
    }
    case "create_page": {
      const { title, parent, slug } = request.args;
      if (!context.pages) return refuse(noHomePage);
      const under = parent ? parent.replace(/^\/?/, "/").replace(/\/?$/, "/") : "/";
      if (under !== "/" && !context.pages.some((page) => page.route === under))
        return refuse(`No page at ${under}. get_site lists the pages; a page at an .html URL has no subpages.`);
      return queue("create_page", {
        // The parent's folder: one new page there waits at a time.
        path: under === "/" ? "." : under.slice(1, -1),
        args: { parent: under, title, ...(slug ? { slug } : {}) },
      });
    }
    case "set_page_details": {
      const { page: ref, title, description } = request.args;
      if (title === undefined && description === undefined) return refuse("Give a title, a description, or both.");
      const page = findPage(context, ref);
      return queue("set_page_details", {
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
      return queue("open_page", { path });
    }
    case "inspect_preview": {
      const { page: ref, element, selector, limit } = request.args;
      if (element !== undefined && selector !== undefined) return refuse("Give element or selector, not both.");
      if (element !== undefined && !parseOutlineId(element)) return refuse(`${element} is not an element id; get_page lists them.`);
      const route = ref ?? context.site?.openRoute;
      if (!route) return refuse("The editor shows no page now. Give page.");
      const page = findPage(context, route);
      return queue("inspect_preview", {
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
      if (!isNativeComponentTag(tag)) return refuse(`<${tag}> is not a valid custom-element name.`);
      const page = findPage(context, ref);
      const outline = outlineOf(context, page.file);
      checkHash(expectedHash, outline.hash, page.file);
      if (context.site?.components.some((item) => item.tag === tag)) return refuse(`There is a component <${tag}> already.`);
      const container = outline.containers.find((item) => item.id === element && (item.tag === "main" || item.tag === "body"));
      if (container) return refuse(`A <${container.tag}> cannot be a component.`);
      const section = outline.sections.find((item) => item.id === element);
      if (section?.tag.includes("-"))
        return refuse(/^site-(?:header|footer)$/.test(section.tag) ? `<${section.tag}> is the site's ${section.tag.slice(5)} component already.` : `<${section.tag}> is a component already.`);
      return queue("make_component", {
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
      return queue("add_section", {
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
      return queue("move_section", {
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
      return queue("remove_section", {
        path: page.file,
        expectedHash,
        args: { section, tag: removed.tag },
      });
    }
  }
}
