import { EDITOR_PAGE_BUILDER_PATH } from "./page-builder-document";
import { planStaticSectionInsert, planStaticSectionSave, readStaticSectionRecords, type SectionChoice, type StaticSectionInsertInput, type StaticSectionInsertPlan, type StaticSectionRecord } from "./static-sections";

/** Prefix that keeps default choices distinct when listed beside saved sections. */
export const DEFAULT_SECTION_CHOICE_PREFIX = "static-section:";
const STYLESHEET = "styles/sections.css";

const record = (id: string, label: string, html: string, css: string): Readonly<StaticSectionRecord> =>
  Object.freeze({ id, label, rootClass: `section-${id}`, stylesheetPath: STYLESHEET, html, css });

/** Curated plain HTML/CSS sections. Each is saved to editor JSON only when first chosen. */
export const DEFAULT_STATIC_SECTIONS: readonly Readonly<StaticSectionRecord>[] = Object.freeze([
  record("intro", "Intro",
    `<section class="section-intro"><h2>Section heading</h2><p>Write a short introduction for this part of the page.</p></section>`,
    `.section-intro { padding: var(--section-space, 3rem) var(--section-gutter, 1.5rem); max-width: var(--section-width, 48rem); margin: 0 auto; text-align: center; }
.section-intro h2 { margin: 0 0 0.75rem; font-size: clamp(1.75rem, 4vw, 2.5rem); line-height: 1.15; }
.section-intro p { margin: 0; font-size: 1.125rem; line-height: 1.6; }
`),
  record("features", "Features",
    `<section class="section-features"><h2>Features</h2><ul><li><h3>First feature</h3><p>Describe what makes this useful.</p></li><li><h3>Second feature</h3><p>Describe what makes this useful.</p></li><li><h3>Third feature</h3><p>Describe what makes this useful.</p></li></ul></section>`,
    `.section-features { padding: var(--section-space, 3rem) var(--section-gutter, 1.5rem); max-width: var(--section-wide, 64rem); margin: 0 auto; }
.section-features h2 { margin: 0 0 1.5rem; text-align: center; }
.section-features ul { display: grid; gap: 1.5rem; margin: 0; padding: 0; list-style: none; }
.section-features h3 { margin: 0 0 0.5rem; font-size: 1.125rem; }
.section-features p { margin: 0; line-height: 1.6; }
@media (min-width: 40rem) { .section-features ul { grid-template-columns: repeat(3, minmax(0, 1fr)); } }
`),
  record("split", "Split",
    `<section class="section-split"><div><h2>Tell your story</h2><p>Pair a short message with a visual. Replace the panel with an image when you have one.</p></div><div class="split-media"></div></section>`,
    `.section-split { display: grid; gap: 2rem; align-items: center; padding: var(--section-space, 3rem) var(--section-gutter, 1.5rem); max-width: var(--section-wide, 64rem); margin: 0 auto; }
.section-split h2 { margin: 0 0 0.75rem; }
.section-split p { margin: 0; line-height: 1.6; }
.section-split .split-media, .section-split img { display: block; width: 100%; aspect-ratio: 4 / 3; border-radius: var(--radius, 0.5rem); background: var(--surface, #e8e8e8); object-fit: cover; }
@media (min-width: 40rem) { .section-split { grid-template-columns: 1fr 1fr; } }
`),
  record("contact", "Contact",
    `<section class="section-contact"><h2>Get in touch</h2><p>Questions or ideas? Send a message.</p><p><a href="mailto:hello@example.com">hello@example.com</a></p></section>`,
    `.section-contact { padding: var(--section-space, 3rem) var(--section-gutter, 1.5rem); max-width: var(--section-width, 40rem); margin: 0 auto; text-align: center; }
.section-contact h2 { margin: 0 0 0.75rem; }
.section-contact p { margin: 0 0 0.75rem; line-height: 1.6; }
.section-contact a { color: var(--accent, currentColor); }
`),
]);

const byId = (id: string) => DEFAULT_STATIC_SECTIONS.find((section) => section.id === (id.startsWith(DEFAULT_SECTION_CHOICE_PREFIX) ? id.slice(DEFAULT_SECTION_CHOICE_PREFIX.length) : id));

/** Default choices with prefixed ids, suitable for the existing Add list. */
export function listDefaultSectionChoices(): SectionChoice[] {
  return DEFAULT_STATIC_SECTIONS.map(({ id, label, rootClass }) => ({ id: DEFAULT_SECTION_CHOICE_PREFIX + id, label, rootClass }));
}
/** Literal preview of a default by plain or prefixed id. */
export function previewDefaultStaticSection(id: string): { html: string; css: string; rootClass: string } | { error: string } {
  const section = byId(id);
  return section ? { html: section.html, css: section.css, rootClass: section.rootClass } : { error: "Choose a default static section." };
}

/**
 * One operation that inserts a default section. A saved record with the same id wins (user edits are kept);
 * otherwise the default is saved to editor JSON in the same operation. Expected sources are the original bytes.
 */
export function planDefaultStaticSectionInsert(input: StaticSectionInsertInput): StaticSectionInsertPlan | { error: string } {
  const section = byId(input.sectionId);
  if (!section) return { error: "Choose a default static section." };
  let records: Record<string, StaticSectionRecord>;
  try { records = readStaticSectionRecords(input.documentText); } catch (error) { return { error: error instanceof Error ? error.message : String(error) }; }
  if (Object.hasOwn(records, section.id)) return planStaticSectionInsert({ ...input, sectionId: section.id });
  const save = planStaticSectionSave({ documentText: input.documentText, files: input.files, record: structuredClone(section) as StaticSectionRecord });
  if ("error" in save) return save;
  const created = save.operation.creates?.[0];
  const documentText = created ? created.content : save.operation.edits.get(EDITOR_PAGE_BUILDER_PATH)!;
  const files = input.files && (created ? [...input.files, EDITOR_PAGE_BUILDER_PATH] : input.files);
  const insert = planStaticSectionInsert({ ...input, documentText, files, sectionId: section.id });
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
