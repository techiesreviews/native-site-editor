import { test, expect } from "@playwright/test";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { expandMatrix, failShot, makeIndex, type Options, type Scenario, type Shot } from "./core";
import { runScenario } from "./scenarios";
import { frameStrip, runStep } from "./steps";
import { checkLayout } from "./layout-check";
import { smallWebp, writeContacts, writeIndex } from "./output";

test("named screens on the real starter", { tag: "@actual" }, async ({ browser, baseURL }) => {
  const request = JSON.parse(process.env.ASE_KIT_SHOTS_REQUEST!) as { options: Options; scenarios: Scenario[]; out: string; previous: Shot[] };
  const { options, scenarios, out } = request;
  const shots: Shot[] = request.previous.filter(shot => !scenarios.some(scenario => scenario.screen === shot.screen && scenario.name === shot.name && options.widths.includes(shot.width) && options.themes.includes(shot.theme)));
  const indexPath = join(out, "index.json");
  await writeIndex(indexPath, makeIndex(shots));
  const encoder = await browser.newPage();
  try {
    for (const scenario of scenarios) for (const { width, theme } of expandMatrix(options.widths, options.themes)) {
      const shot: Shot = { screen: scenario.screen, name: scenario.name, width, theme, files: [], attempts: 0, failures: [], layout: [], ok: false };
      shots.push(shot);
      for (let attempt = 1; attempt <= 2 && !shot.ok; attempt++) {
        shot.attempts = attempt;
        const context = await browser.newContext({ baseURL, viewport: { width, height: 900 }, colorScheme: theme, reducedMotion: "reduce" });
        const page = await context.newPage();
        page.setDefaultTimeout(15_000);
        page.setDefaultNavigationTimeout(30_000);
        let failingStep = "openEditor";
        const step = async <T>(name: string, action: () => Promise<T>) => {
          failingStep = name;
          return test.step(name, action);
        };
        const stem = `${scenario.screen}${scenario.name ? `-${scenario.name}` : ""}-${width}-${theme}`;
        const strips: Shot["files"] = [];
        const record = async (name: string, frames: Buffer[]) => {
          const webp = await frameStrip(encoder, frames);
          const path = `${stem}-${name}-strip.webp`;
          await writeFile(join(out, path), webp);
          strips.push({ path, bytes: webp.length });
        };
        try {
          await runScenario(page, scenario.screen, step);
          for (const source of scenario.steps) await step(source, () => runStep(page, source, record));
          await step("fonts ready", () => page.evaluate(() => document.fonts.ready.then(() => {})));
          shot.layout = await step("checkLayout", () => checkLayout(page));
          const png = await step("screenshot", () => page.screenshot({ fullPage: true, animations: "disabled" }));
          shot.height = png.readUInt32BE(20);
          await writeFile(join(out, `${stem}.png`), png);
          shot.files = [{ path: `${stem}.png`, bytes: png.length }];
          const webp = await step("encode WebP", () => smallWebp(encoder, png, 40_000));
          await writeFile(join(out, `${stem}.webp`), webp);
          shot.files.push({ path: `${stem}.webp`, bytes: webp.length }, ...strips);
          shot.ok = true;
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          failShot(shot, { attempt, step: failingStep, error: message }, strips);
          console.error(`${scenario.screen} ${width} ${theme}: step ${failingStep} failed (attempt ${attempt}/2)`);
        } finally {
          await context.close();
          await writeIndex(indexPath, makeIndex(shots));
        }
      }
    }
    const index = makeIndex(shots);
    try {
      index.files.push(...await writeContacts(encoder, shots, out));
      await writeIndex(indexPath, index);
    } catch (error) {
      index.outputFailures.push({ step: "contact sheet", error: error instanceof Error ? error.message : String(error) });
      await writeIndex(indexPath, index);
      throw error;
    }
    // Verify persisted output too, so an interrupted or incomplete write cannot appear successful.
    expect(JSON.parse(await readFile(indexPath, "utf8")).screens.length).toBe(shots.length);
    expect(shots.filter(shot => !shot.ok), "Failed named screens; see index.json for steps").toHaveLength(0);
  } finally { await encoder.close(); }
});
