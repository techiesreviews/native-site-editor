# fixtures/actual-starter provenance

Byte-identical snapshot of `native-site-editor-starter` at commit `675eeac`
on the starter's `dev` branch. This slice 70 commit carries the corrected
Components chapter and descends from slice 17's `11574fc`, which first copied
that chapter into `AGENTS.md`.

Test data only: do not edit the fixture. Refresh from a named starter commit
by deleting all contents first (including hidden files), then extracting its
archive from a starter checkout (`<starter>`):

```sh
find fixtures/actual-starter -mindepth 1 -maxdepth 1 -exec rm -rf -- {} +
git -C <starter> archive 675eeac | tar -x -C fixtures/actual-starter
```

When updating the snapshot, replace the commit in this provenance and command.
`fixtures/native-starter` is a separate, frozen fixture; leave it unchanged.

The fixture is used by:

- `tests/agents-md-drift.test.ts`, comparing its `AGENTS.md` Components chapter
  with the editor's conventions.
- `tests/component-model.test.ts`, testing Make component on its contact and
  Recent work sections.
- The `@actual`-tagged browser specs under `tests/native-save/`
  (`npm run test:browser:actual`; `grep -l @actual tests/native-save`).
- `tests/native-save/fixture-contract.ts`, identifying the actual fixture,
  and `scripts/native-browser-tests.mjs`, selecting it for the actual group
  (`npm run test:browser:actual`).
- `tests/native-browser-launcher.test.ts`, checking fixture identity and
  browser launcher selection without starting a server.
