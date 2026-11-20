# Validation evidence

## Red checks

`kit unit docs/wayfinder/ux-audit-2026-11/prototypes.test.ts` first returned `pass 0, fail 12`: each standalone page and the index were absent. All twelve assertions existed before the HTML was generated.

## Scope

Eleven self-contained HTML pages and an index. Each task has one commit. No editor source, dependencies, configuration, old checkout or chat workspace files were changed. Tests and reports live under this task folder. The temporary page-generation helper is removed before handover; opening the HTML needs no generator.

## Kit commands

- `RESULT: ok doctor 11/11 checks passed`
- `RESULT: ok rulebook shared and docs/agents/kitchen-extras.md`
- `RESULT: fail unit 0/12 (1 files)` — expected red run before implementation.
- `RESULT: ok ux nothing visible touched` — prototype docs have no editor feature mapping; no UX verdict is claimed.
- `RESULT: fail shots 0 files, 1 failed, 0 layout findings, contact none` — `Scenario file must live under .scratch/`; the task restricts authored files to this folder. No scenario was placed outside it.
- `RESULT: ok unit none affected` — no application unit file is affected by prototype docs.

Focused browser check, lint, independent review and PR results are appended after completion. Resource-gated browser checks use the normal port launcher without changing its thresholds.

## Current evidence and limits

`npm run lint` passed twice (837 tickets checked, six feedback lines, zero export failures). All eleven inline scripts pass JavaScript parsing. A local HTML parser confirms that the index links all eleven comparisons, every comparison has Today and After, and no page declares an external script, stylesheet, image or frame resource. These are static checks, not a claim that the browser interactions passed.

The focused interaction suite has **not run past the normal resource gate**. The machine's load remained above its limit (16), reaching more than 40. Three waiting runs were stopped while fixing independent review findings; none launched a browser. No load or memory threshold was changed. The final bounded attempt is reported separately below. No screenshot contact sheet or browser UX verdict is claimed.

Proof lines for the handover and PR:

- Element row actions: not met — built; live click, focus and touch-target checks remain blocked by the resource gate.
- Link popup placement: not met — built; geometry and keyboard checks remain blocked by the resource gate.
- Canvas page identity: not met — built; route/source comparison remains blocked by the resource gate.
- Media details: not met — built; Back, Discard and save/reopen checks remain blocked by the resource gate.
- Paste with structure: not met — built; sample and real ClipboardEvent checks remain blocked by the resource gate.
- Unique anchors: not met — built; repeat-duplicate and rewritten-link checks remain blocked by the resource gate.
- Multi-selection: not met — built; linked selection, valid wrap, unwrap and clipboard checks remain blocked by the resource gate.
- Command search: not met — built; insertion, finding and selection-action checks remain blocked by the resource gate.
- Shared-change preview: not met — built; affected-page opening and shared-save Undo checks remain blocked by the resource gate.
- Client edit bar: not met — built; approved-field and designer-preview checks remain blocked by the resource gate.
- Style source: not met — built; override removal, inheritance and Undo checks remain blocked by the resource gate.
- Standalone index and scope: met — HTML parsing found eleven local links and both comparison controls; all tracked changes remain inside this folder.
- README proposal table: met — eleven rows identify evidence, size and safe assumptions; existing v3 behaviour is distinguished from the new value-source chain.

## Independent review

Two completed Claude Opus 5.5 high reviews found real prototype issues. Fixes preserve collection state, synchronize selection, restore focus, paste at the caret, reject non-adjacent wrapping, restore shared-save state, and keep keyboard actions in their control context. The final review checks those fixes. The initial interrupted review is not counted as a completed round.

The optional suggestion to split the shared inline shell is declined: each requested standalone page remains independently portable without sibling resources. This follows the brief's standalone/no-outside-requests constraint. No skill text was copied into the repository.

Additional RESULT lines so far:

```text
RESULT: ok bg stop ux-prototypes-review pgid 2315838
RESULT: fail review interrupted
RESULT: ok bg stop ux-prototypes-focused pgid 2302615
RESULT: fail go ux-prototypes-focused exit 143 without a RESULT line
RESULT: skip second look (gpt-6.1-sol not used: docs-only change)
RESULT: ok review git diff f2dfe9d27bce876a04a91fe647fdc592c0f720e6...HEAD evidence <review R1>
RESULT: ok bg stop ux-prototypes-browser pgid 2356566
RESULT: fail go ux-prototypes-browser exit 143 without a RESULT line
RESULT: ok review git diff f2dfe9d27bce876a04a91fe647fdc592c0f720e6...HEAD evidence <review R2>
RESULT: ok bg stop ux-prototypes-checked pgid 2669953
RESULT: fail go ux-prototypes-checked exit 143 without a RESULT line
```
