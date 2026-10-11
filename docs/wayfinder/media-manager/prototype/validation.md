# Media manager prototype validation

Validated locally on 11 October 2026 with Playwright Chromium 153.0.8010.12, opening `directions.html` through `file://`. No web server, production build, upload or deployment was used.

## Scope

This is a static, interactive design comparison. Gallery prioritises previews, Desk prioritises file comparisons, and Collections prioritises folder navigation. Each direction starts with the same eight sample files. All metadata, savings, upload progress, removal and Undo are demonstrations. No direction has been selected for implementation.

The prototype owns `directions.html` and the four images in `demo-media/`. Reference screenshots are supplied separately in `references/`.

## First-pass checks and results

These checks preceded the source review and the focused corrections below. The verification used inline Node runners through `node - <<'JS'`, loading `require('playwright')` and launching `chromium.launch({headless:true})`. All assertions passed:

- Each direction starts with the same eight sample files. The first pass showed all eight directly; the corrected Collections home opens with folders.
- Search, kind, folder, tag and usage filters return the expected sample files. The social sharing image is excluded from “No uses found”.
- Grid and list switching works. Selection, moving files, clearing selection and reset update the demo.
- File details save a name, description, tags and folder. Responsive copies expand within their image family. Decorative images disable the description field; PDFs have no image-description controls.
- Add files loads samples, compares original and smaller versions, shows demo savings, displays progress, fails one sample file, retries it and adds both files to the demo library. Cancelling progress returns to the comparison step.
- The page picker shows the target, filters to an applicable kind, selects one file and shows the chosen result. Changing the target to PDF excludes images. Focus-point controls are available on the chosen image’s edit bar, scoped to its page place.
- Clean up opens groups, lists candidates, reviews names and uses before removal, changes only sample data, and restores removed files through Undo. Missing descriptions lead to the image’s details.
- New folder, dismiss message, picker Add files and reset respond.
- All five screens in all three directions have no horizontal overflow at 360, 728 and 768 px: 45 screen/width checks.
- Visible application controls are at least 44 px in both dimensions in the phone Desk view. The prototype picker retains its specified 28 px harness controls.
- All six local reference images load when Inspiration is expanded.
- Number keys, URL selection persistence and direction switching work. Picker CSS and JavaScript exactly match the skill’s standalone reference. Names change to Gallery, Desk and Collections; it uses the allowed top position and omits replay because the directions are static.
- No browser page errors occurred.

A small repeatable structural check:

```bash
node - <<'JS'
const fs = require('fs');
const { chromium } = require('playwright');
(async () => {
  const htmlPath = 'docs/wayfinder/media-manager/prototype/directions.html';
  const html = fs.readFileSync(htmlPath, 'utf8');
  const spec = fs.readFileSync('/home/ubulex/.codex/skills/prototype/PICKER.md', 'utf8');
  for (const language of ['css', 'js']) {
    const reference = spec.split('```' + language + '\n')[1].split('\n```')[0];
    if (!html.includes(reference)) throw new Error('Picker ' + language + ' differs');
  }
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    page.on('pageerror', error => { throw error; });
    await page.goto('file://' + process.cwd() + '/' + htmlPath);
    for (let direction = 0; direction < 3; direction++) {
      await page.locator('.proto-picker-item').nth(direction).click();
      await page.waitForTimeout(80);
      for (const width of [360, 728, 768]) {
        await page.setViewportSize({ width, height: 900 });
        for (const screen of ['library', 'upload', 'choose', 'cleanup']) {
          await page.locator('[data-action="' + screen + '"]').last().click();
          if (await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)) {
            throw new Error('Overflow: ' + direction + '/' + screen + '/' + width);
          }
        }
      }
    }
    console.log('Picker and responsive checks passed');
  } finally {
    await browser.close();
  }
})();
JS
```

## Limits

The file chooser shows selected local file names with sample previews and estimated savings. It does not read or transform those files. The sample image copies come from the existing `techies-reviews` workspace and were resized into this prototype’s own directory; originals are unchanged.

Images are referenced by complete absolute local paths so the publication tool can inline them. A published preview still requires the lead to check image inlining and interactions on the receiving surface. No deletion policy, restoration period, supported file-size limit or scanner guarantee is decided by these mockups.

## Source review and focused corrections

The lead ran an independent source-only review through Claude CLI using `claude-opus-5-5 --effort medium`; the reported `modelUsage` confirmed Opus. The reviewer did not render the prototype. The immutable reviewed snapshot has SHA256 `216b9c3a1001fe955b6164c500533573cd77148917701e63b32ccc2d9c8682e4`.

Accepted corrections:

- On phones, search remains visible and a working “Filters (N)” control expands the kind, folder, tag and usage fields. All controls still work. The Gallery’s first card starts at 586.44 px at a 360 px viewport.
- Collections now starts with only folder cards. Opening a folder shows its files, with a 44 px breadcrumb Back control. Search and filters can still search across folders.
- Details, Add files, Choose for page and Clean up explicitly say they are shared across all three directions in the direction explanation.
- Adding from the page picker offers “Back to choosing” when complete and selects the new file that matches the target.
- Seed files carry a sample checked state. Added files show “Not checked yet” and are excluded from both the “No uses found” filter and that clean-up group. Details and Clean up identify the sample check scope; they retain the warning about missed uses.
- The optimise comparison says keeping originals is still undecided, and updates when Original is selected. The upload flow identifies the intentional sample failure.
- Pink Light remains without a saved description, so that review group has one file. Its thumbnail has a separate descriptive alt fallback. The focus demo keeps the effective vertical adjustment and removes the ineffective horizontal slider.

The focused Playwright follow-up passed collapsed/expanded filters, filter counts, folder-only home, folder open/back, cross-folder search, shared-screen text, usage scope, picker upload/retry/return/selection, unchecked details and exclusion, candidate notes, and the nonzero missing-description group. Library, Add files and Clean up had no horizontal overflow in all three directions at 360 px. No browser page errors occurred. Script syntax passed through Node’s `vm.Script`.

Grid/list toggles and the exact 28 px prototype picker remain as specified. The shared screens were clarified rather than redesigned as three separate products. The picker spec was not changed.

The lead also attempted the latest `html_preview` surface; its browser remained blocked by the host’s AppArmor configuration. Local Playwright was the rendered verification fallback. The host configuration was unchanged.
