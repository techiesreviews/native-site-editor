// The checks of what the editor tab sends agents (its context, requests and
// answers), with zod. Loaded on first use (worker/app.ts, worker/agent-store.ts):
// zod is most of what an isolate would otherwise parse at startup, and only
// agent routes need it.
import { z } from "zod";
import { REQUEST_HTML_LIMIT, REQUEST_TEXT_LIMIT, type AgentRequest } from "../shared/agent";
import type { EditorContext } from "../shared/types";
import { requestIdPattern } from "./agent-requests";
import { HttpError } from "./github";

const sha = z.string().regex(/^[a-f0-9]{40}$/);
const hash = z.string().regex(/^[a-f0-9]{64}$/);
const position = z.number().int().min(1).max(10_000_000);
const path = z
  .string()
  .min(1)
  .max(1024)
  .refine(
    (value) =>
      value.split("/").every((part) => part && part !== "." && part !== "..") &&
      !/[\\\u0000-\u001f]/.test(value),
  );
// `/`, `/about/`, and a single-file page's `/notes.html` or `/404.html`.
const route = z.string().max(1024).regex(/^\/(?:[\w.-]+\/)*(?:[\w.-]+\.html)?$/);
const outlineId = z.string().max(320).regex(/^\d{1,4}(?:\.\d{1,4}){0,63}$/);
const short = (max: number) => z.string().max(max);
/** An element as the tab describes it (shared/agent.ts `AgentElement`). */
export const elementSchema = z.object({
  file: path,
  route: route.optional(),
  id: outlineId,
  tag: short(100),
  text: short(1000),
  selector: short(2000).optional(),
  host: z.object({ tag: short(100), selector: short(2000) }).optional(),
  html: short(REQUEST_HTML_LIMIT + 16).optional(),
  htmlClipped: z.boolean().optional(),
  lines: z.object({ start: position, end: position }).optional(),
  component: z
    .object({ tag: short(100), in: z.enum(["instance", "slot", "template"]), slot: short(100).optional() })
    .optional(),
});
const schema = z.object({
  repository: z.object({
    id: z.number().int().positive(),
    fullName: z.string().regex(/^[\w.-]+\/[\w.-]+$/),
  }),
  branch: z.string().min(1).max(255),
  commit: sha,
  file: z
    .object({
      path,
      baseSha: sha.nullable(),
      language: z.string().max(64),
      readOnly: z.boolean(),
      original: z.string().max(131072),
      content: z.string().max(131072),
      selection: z
        .object({
          startLine: position,
          startColumn: position,
          endLine: position,
          endColumn: position,
        })
        .nullable(),
      diagnostics: z
        .array(
          z.object({
            severity: z.string().max(20),
            message: z.string().max(2000),
            line: position,
            column: position,
          }),
        )
        .max(50),
    })
    .nullable(),
  drafts: z
    .array(
      z.object({
        path,
        baseSha: sha.nullable(),
        updatedAt: z.number().finite(),
        hash: hash.optional(),
        content: z.string().max(131072).optional(),
        size: z.number().int().min(0).optional(),
        binary: z.boolean().optional(),
        deleted: z.boolean().optional(),
        movedFrom: path.optional(),
      }),
    )
    .max(5000),
  pages: z
    .array(
      z.object({
        route,
        file: path.optional(),
        title: short(1000).optional(),
        description: short(1000).optional(),
        parent: route.optional(),
        isNew: z.boolean().optional(),
      }),
    )
    .max(500)
    .optional(),
  site: z
    .object({
      openFile: path.nullable(),
      openRoute: route.nullable(),
      selection: elementSchema.nullable(),
      components: z
        .array(
          z.object({
            tag: short(100),
            file: path,
            css: path.optional(),
            section: z.boolean(),
            slots: z.array(short(100)).max(50),
          }),
        )
        .max(300),
      stylesheets: z.array(z.object({ file: path, imports: z.array(path).max(100) })).max(50),
      settings: z.object({ file: path, name: short(200).optional(), url: short(1000).optional() }).nullable(),
      outlines: z
        .array(
          z.object({
            file: path,
            hash,
            containers: z
              .array(z.object({ id: z.string().max(320).regex(/^(?:\d{1,4}(?:\.\d{1,4}){0,63})?$/), tag: short(100), children: z.number().int().min(0).max(100_000) }))
              .max(50),
            sections: z
              .array(
                z.object({
                  id: outlineId,
                  tag: short(100),
                  component: z.boolean().optional(),
                  key: short(200).optional(),
                  heading: short(200).optional(),
                  text: short(200).optional(),
                  slots: z.record(short(100), short(200)).optional(),
                }),
              )
              .max(200),
          }),
        )
        .max(500),
      changes: z
        .array(
          z.object({
            kind: z.enum(["A", "M", "R", "D"]),
            path,
            from: path.optional(),
          }),
        )
        .max(5000),
    })
    .optional(),
});
export function validateContext(value: unknown): EditorContext {
  const result = schema.safeParse(value);
  if (!result.success)
    throw new HttpError(400, "Editor context is invalid or too large.");
  return result.data;
}

const askSchema = z.object({
  repository: z.object({ id: z.number().int().positive(), fullName: z.string().regex(/^[\w.-]+\/[\w.-]+$/) }),
  text: z.string().trim().min(1).max(REQUEST_TEXT_LIMIT),
  element: elementSchema,
});

/** A request the tab sends, checked; the hub gives it its id and time. */
export function validateAsk(value: unknown): AgentRequest {
  const result = askSchema.safeParse(value);
  if (!result.success)
    throw new HttpError(400, `A request needs text (up to ${REQUEST_TEXT_LIMIT} characters) and the element it is about.`);
  const { repository, text, element } = result.data;
  const html = element.html && element.html.length > REQUEST_HTML_LIMIT ? element.html.slice(0, REQUEST_HTML_LIMIT) : element.html;
  const createdAt = Date.now();
  return {
    id: `req-${crypto.randomUUID()}`,
    text,
    createdAt,
    repoId: repository.id,
    repository: repository.fullName,
    state: "open",
    element: { ...element, ...(html !== undefined ? { html } : {}), ...(html !== element.html ? { htmlClipped: true } : {}) },
    thread: [{ from: "user", text, at: createdAt }],
  };
}

const answerSchema = z.object({
  id: z.string().regex(requestIdPattern),
  text: z.string().trim().min(1).max(REQUEST_TEXT_LIMIT),
});

/** The user's answer to an agent, from a request's card, checked. */
export function validateAnswer(value: unknown) {
  const result = answerSchema.safeParse(value);
  if (!result.success) throw new HttpError(400, `An answer needs the request and text (up to ${REQUEST_TEXT_LIMIT} characters).`);
  return result.data;
}
