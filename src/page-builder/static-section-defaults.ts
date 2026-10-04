import { EDITOR_PAGE_BUILDER_PATH } from "./page-builder-document";
import { planStaticSectionInsert, previewStaticSection, planStaticSectionSave, readSectionCatalog, type SectionChoice, type SectionMasterContext, type StaticSectionEntry, type StaticSectionInsertInput, type StaticSectionInsertPlan, type StaticSectionLiveCss, type StaticSectionRecord } from "./static-sections";

/** Prefix that keeps default choices distinct when listed beside saved sections. */
export const DEFAULT_SECTION_CHOICE_PREFIX = "static-section:";
const STYLESHEET = "styles/sections.css";

const record = (id: string, label: string, html: string, css: string, rootClass = `section-${id}`): Readonly<StaticSectionRecord> =>
  Object.freeze({ id, label, rootClass, stylesheetPath: STYLESHEET, html, css });

/** Seed CSS sits in `@layer sections`: a site's own utilities layer (e.g. text-size classes) and unlayered rules win over it. */
const layered = (rules: string) => `@layer sections {\n${rules.replace(/^(?=.)/gm, "  ")}}\n`;

/** Curated plain HTML/CSS sections. Each is saved to editor JSON only when first chosen. */
export const DEFAULT_STATIC_SECTIONS: readonly Readonly<StaticSectionRecord>[] = Object.freeze([
  record("intro", "Intro",
    `<section class="section-intro"><h2>Section heading</h2><p>Write a short introduction for this part of the page.</p></section>`,
    layered(`.section-intro { padding: var(--section-space, 3rem) var(--section-gutter, 1.5rem); max-width: var(--section-width, 48rem); margin: 0 auto; text-align: center; }
.section-intro h2 { margin: 0 0 0.75rem; font-size: var(--text-3xl, 2.25rem); line-height: 1.15; }
.section-intro p { margin: 0; font-size: var(--text-l, 1.125rem); line-height: 1.6; }
`)),
  record("features", "Features",
    `<section class="section-features"><h2>Features</h2><ul><li><h3>First feature</h3><p>Describe what makes this useful.</p></li><li><h3>Second feature</h3><p>Describe what makes this useful.</p></li><li><h3>Third feature</h3><p>Describe what makes this useful.</p></li></ul></section>`,
    layered(`.section-features { padding: var(--section-space, 3rem) var(--section-gutter, 1.5rem); max-width: var(--section-wide, 64rem); margin: 0 auto; }
.section-features h2 { margin: 0 0 1.5rem; text-align: center; }
.section-features ul { display: grid; gap: 1.5rem; margin: 0; padding: 0; list-style: none; }
.section-features h3 { margin: 0 0 0.5rem; font-size: var(--text-l, 1.125rem); }
.section-features p { margin: 0; line-height: 1.6; }
@media (min-width: 40rem) { .section-features ul { grid-template-columns: repeat(3, minmax(0, 1fr)); } }
`)),
  record("split", "Split",
    `<section class="section-split"><div><h2>Tell your story</h2><p>Pair a short message with a visual. Replace the panel with an image when you have one.</p></div><div class="split-media"></div></section>`,
    layered(`.section-split { display: grid; gap: 2rem; align-items: center; padding: var(--section-space, 3rem) var(--section-gutter, 1.5rem); max-width: var(--section-wide, 64rem); margin: 0 auto; }
.section-split h2 { margin: 0 0 0.75rem; }
.section-split p { margin: 0; line-height: 1.6; }
.section-split .split-media, .section-split img { display: block; width: 100%; aspect-ratio: 4 / 3; border-radius: var(--radius, 0.5rem); background: color-mix(in srgb, currentColor 12%, transparent); object-fit: cover; }
@media (min-width: 40rem) { .section-split { grid-template-columns: 1fr 1fr; } }
`)),
  record("contact", "Contact",
    `<section class="contact-section"><h2>Get in touch</h2><p>Questions or ideas? Send a message.</p><p><a href="mailto:hello@example.com">hello@example.com</a></p></section>`,
    layered(`.contact-section { padding: var(--section-space, 3rem) var(--section-gutter, 1.5rem); max-width: var(--section-width, 40rem); margin: 0 auto; text-align: center; }
.contact-section h2 { margin: 0 0 0.75rem; }
.contact-section p { margin: 0 0 0.75rem; line-height: 1.6; }
.contact-section a { color: var(--accent, currentColor); }
`), "contact-section"),
]);

/** Only prefixed ids name defaults, so a stale saved id never silently falls back to a default. */
const byChoiceId = (id: string) => id.startsWith(DEFAULT_SECTION_CHOICE_PREFIX) ? DEFAULT_STATIC_SECTIONS.find((section) => section.id === id.slice(DEFAULT_SECTION_CHOICE_PREFIX.length)) : undefined;
const message = (error: unknown) => error instanceof Error ? error.message : String(error);

/**
 * Default choices not already saved under the same id, for the existing Add list beside `listSectionChoices`.
 * `documentText` undefined means the editor JSON is proven absent; hosts must use the file graph to tell that from unloaded.
 * Invalid JSON refuses rather than falling back to defaults.
 */
export function listDefaultSectionChoices(documentText: string | undefined): SectionChoice[] | { error: string } {
  // Which ids are saved needs no HTML: a saved section with a master file is listed without reading it.
  let saved: Record<string, StaticSectionEntry>;
  try { saved = readSectionCatalog(documentText); } catch (error) { return { error: message(error) }; }
  return DEFAULT_STATIC_SECTIONS.filter(({ id }) => !Object.hasOwn(saved, id)).map(({ id, label, rootClass }) => ({ id: DEFAULT_SECTION_CHOICE_PREFIX + id, label, rootClass }));
}
/**
 * Preview of exactly what `planDefaultStaticSectionInsert` would insert: the saved record when one exists, else the default seed.
 * Hosts should pass `live` so a saved section previews the current public stylesheet (`reuse-current`).
 */
export function previewDefaultStaticSection(documentText: string | undefined, choiceId: string, live?: StaticSectionLiveCss, masters?: SectionMasterContext): { html: string; css: string; rootClass: string } | { error: string } {
  const section = byChoiceId(choiceId);
  if (!section) return { error: "Choose a default static section." };
  let saved: Record<string, StaticSectionEntry>;
  try { saved = readSectionCatalog(documentText); } catch (error) { return { error: message(error) }; }
  if (Object.hasOwn(saved, section.id)) return previewStaticSection(documentText, section.id, live, masters);
  return { html: section.html, css: section.css, rootClass: section.rootClass };
}

/**
 * One operation that inserts a default section. A saved record with the same id wins (user edits are kept) and,
 * unless the caller passes `ensure-record`, reuses the loaded public stylesheet as is;
 * otherwise the default is saved to editor JSON in the same operation. Expected sources are the original bytes.
 */
export function planDefaultStaticSectionInsert(input: StaticSectionInsertInput): StaticSectionInsertPlan | { error: string } {
  const section = byChoiceId(input.sectionId);
  if (!section) return { error: "Choose a default static section." };
  let records: Record<string, StaticSectionEntry>;
  try { records = readSectionCatalog(input.documentText); } catch (error) { return { error: message(error) }; }
  if (Object.hasOwn(records, section.id)) return planStaticSectionInsert({ ...input, sectionId: section.id, cssPolicy: input.cssPolicy ?? "reuse-current" });
  const save = planStaticSectionSave({ documentText: input.documentText, files: input.files, record: structuredClone(section) as StaticSectionRecord });
  if ("error" in save) return save;
  const created = save.operation.creates?.[0];
  const documentText = created ? created.content : save.operation.edits.get(EDITOR_PAGE_BUILDER_PATH)!;
  const files = input.files && (created ? [...input.files, EDITOR_PAGE_BUILDER_PATH] : input.files);
  const insert = planStaticSectionInsert({ ...input, documentText, files, sectionId: section.id, cssPolicy: "ensure-record" });
  if ("error" in insert) return insert;
  const { operation } = insert;
  const expectedSources = new Map(operation.expectedSources);
  expectedSources.set(EDITOR_PAGE_BUILDER_PATH, input.documentText);
  const edits = new Map(operation.edits);
  for (const [path, text] of save.operation.edits) edits.set(path, text);
  const creates = [...(operation.creates ?? []), ...(save.operation.creates ?? [])];
  return {
    operation: { ...operation, expectedSources, edits, ...(creates.length ? { creates } : {}) },
    selection: insert.selection,
    ...(input.files ? { expectedFiles: [...new Set(input.files)].sort() } : {}),
  };
}
