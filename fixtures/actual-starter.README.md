Byte-identical snapshot of `native-site-editor-starter` at commit `7a35988`
on the starter's `dev` branch: media manager slice 93's Media chapter rule
(the focus point after agents' trims), on top of `f58795b`, slice 92's rules
(frame_image and component shapes), `93045bd`, slice 55's rules
(removing, keeping, restoring, renaming and Replace everywhere),
`0da3e59`, slice 45's rules (shape, focus and trims), `238b4d6`, slice 37's rules (folders and
names, the editor's markup, adding settings) and the layout notes naming
`media/<kind>/`, `a4b2f44`, slice 22's Media chapter in
`AGENTS.md` (copied from the editor's conventions), and the shared
media player and online video layer (`e51c83a`…`293a454`, media manager
slices 60 and 61) and `3c3cce5`, the chapter's items-slot rule (an items slot
holds card components, `card-…` with a heading slot), which follows slice
77's chapter line (`6a20035`, a band with no tone follows the page), slice
75's visitor colour scheme (`bbc0742`), slice 74's base resets that skip
slotted parts (`b66fc67`, and the chapter line saying so), slice 60's tones
(`e3459d1`) and slice 71's `5f00f1f`, which descend from slice 70's `675eeac`
(the corrected Components chapter) and slice 17's `11574fc`, which first
copied that chapter into `AGENTS.md`.

Test data only: do not edit the fixture. Refresh from a named starter commit
by deleting all contents first (including hidden files), then extracting its
archive from a starter checkout (`<starter>`):

```sh
find fixtures/actual-starter -mindepth 1 -maxdepth 1 -exec rm -rf -- {} +
git -C <starter> archive 7a35988 | tar -x -C fixtures/actual-starter
```

When updating the snapshot, replace the commit in this provenance and command.
`fixtures/native-starter` is a separate, frozen fixture; leave it unchanged.

The fixture is used by:

- `tests/agents-md-drift.test.ts`, comparing its `AGENTS.md` Components and
  Media chapters with the editor's conventions.
- `tests/component-model.test.ts`, testing Make component on its contact and
  Recent work sections.
- The `@actual`-tagged browser specs under `tests/native-save/`
  (`npm run test:browser:actual`; `grep -rl @actual tests/native-save`).
- `tests/native-save/fixture-contract.ts`, identifying the actual fixture,
  and `scripts/native-browser-tests.mjs`, selecting it for the actual group
  (`npm run test:browser:actual`).
- `tests/native-browser-launcher.test.ts`, checking fixture identity and
  browser launcher selection without starting a server.
