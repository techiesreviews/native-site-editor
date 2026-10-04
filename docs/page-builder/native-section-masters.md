# Native section masters (model)

Saved sections can keep their HTML in a master file. The website stays plain HTML and CSS: every
page holds its own full copy of each section, and deleting `.editor/` leaves a complete site.
Nothing here is a runtime, a framework or a marker in the published HTML.

Status: pure model and unit tests only. The editor does not offer Make master, Edit master,
Save to master or Update copies yet.

## Files

- `.editor/sections/<id>.html`: the master, the only authority for that saved section's HTML.
  It holds one `<section>`, with only whitespace and comments around it.
- `.editor/page-builder.json`, `reusableSections`:
  - version 1: every record holds `html` (unchanged behaviour, unchanged bytes);
  - version 2: written only once a record has a master. Such a record holds `htmlPath` (always
    `.editor/sections/<id>.html`) and no `html`. Other records may stay inline.
  - A record holding both keys is refused on read and on write.
- `pages[path].sections[key]` entries of `kind: "native-section"`: optional links from a copy
  on a page to its record, with the copy's locator and its `basis`, the literal section bytes it
  was made from. Unknown entries and keys are kept.

## API (`src/page-builder/`)

`static-sections.ts`
- `readSectionCatalog(json)`: the records exactly as stored (`html` xor `htmlPath`).
- `resolveStaticSection(entry, { sources, files })`: an ephemeral record with the master's
  current loaded text (a draft included). Refuses with no file graph, a missing master or an
  unloaded one. It keeps `htmlPath`, so writing it back is refused.
- `readStaticSectionRecords(json, masters?)`, `previewStaticSection(…, masters?)`,
  `planStaticSectionInsert({ …, masters? })`: unchanged for version 1; a master record needs
  `masters` and is never guessed. Insert writes the master's literal bytes (comments and padding
  included) and pins the master.
- `planMakeSectionMaster({ documentText, files, id })`: one operation creates the master from
  the record's HTML and replaces `html` with `htmlPath`. The file graph must prove the path free.

`native-section-links.ts`
- `sectionCore(html)`: the section inside record or master HTML; a link's basis is always this.
- Link, register and resolve as before. `planNativeSectionCopiesUpdate({ …, master? })` writes
  only the core into each copy still equal to its own basis (copies from older versions included),
  reports customised copies, and refuses when the master has a comment outside its section.
- `moveLinkedCopyBasis(…, recordId)`: moves the basis of the copy just saved into its master,
  only for a link to that record; another record's link on the same copy is left as it is.
- Updating copies of a record with a master requires `master` pinned at the record's `htmlPath`.

`native-section-save.ts`
- `planSelectedStaticSectionSave({ …, master? })`: for a record with a master, replaces only
  the master's `<section>` (its padding and comments stay) and, if the selected copy is linked,
  moves its basis in the same operation. It needs the master loaded and in the complete file
  graph. Version 1 saves are unchanged.

## Guarantees

- Every plan pins the exact bytes it read (pages, JSON, master) and the complete file graph
  where it creates or relies on files. The host applies it atomically as one Undo.
- Customised copies are never rewritten. Missing, ambiguous or overlapping links refuse the
  whole update; collections on changed pages must stay exactly where they were.
- CSS is not written by Update or Save; the public stylesheet stays the authority.

## Known limits

- A copy whose opening tag was edited (and has no id) can no longer be found; Update refuses
  until it is relinked. Copies on one page with the same opening tag can't be told apart.
- A version 2 catalogue stays valid with no master left (all inline, or empty); only an unknown
  future version refuses.
- `readStaticSectionRecords` with masters resolves every record, so one broken master refuses the
  whole list. A host that should keep other sections usable resolves per entry with
  `readSectionCatalog` + `resolveStaticSection` instead.
- The host (`main.ts`) still reads saved sections without masters; it must pass `masters`
  before any master exists in a site.
