import { expect, test } from "@playwright/test";
import { storedDrafts } from "./drafts";

for (const reducedMotion of ["no-preference", "reduce"] as const) {
  for (const nested of [false, true]) {
    test(`stationary pointer tracks ${nested ? "nested" : "page"} wheel (${reducedMotion})`, async ({ page, baseURL }) => {
      await page.emulateMedia({ reducedMotion });
      await page.goto(`${baseURL}/#repo=501&branch=main&file=index.html`);
      const frame = page.frameLocator(".native-preview-frame");
      await expect(frame.locator(".hero h1")).toBeVisible();
      if (nested) {
        const response = await page.request.get(`${baseURL}/__demo/file?path=index.html`);
        const content = (await response.text()).replace(/(<main[^>]*>)/, '$1<div class="probe-scroll" style="height:450px;overflow:auto">').replace('</main>', '</div></main>');
        await page.request.post(`${baseURL}/__demo/external-edit`, { data: { path: "index.html", content } });
        await page.reload();
        await expect(frame.locator(".hero h1")).toBeVisible();
      }
      const source = () => page.evaluate(async () => (await import("/src/components/code-editor.ts")).getMountedSource("index.html"));
      const beforeSource = await source(), beforeDrafts = await storedDrafts(page);
      const local = await frame.locator("section.hero").evaluate((element, nested) => {
        const rect = element.getBoundingClientRect();
        return { x: rect.left + rect.width * .75, y: rect.top + (nested ? 150 : rect.height * .5) };
      }, nested);
      const frameBox = (await page.locator(".native-preview-frame").boundingBox())!;
      await page.mouse.move(frameBox.x + local.x, frameBox.y + local.y);
      const pair = () => page.locator(".insert-point.is-near .insert-point__plus").evaluateAll(elements => elements.map(element => element.getAttribute("aria-label")));
      await expect.poll(pair).not.toHaveLength(0);
      const delta = nested ? await frame.locator("section.cards").evaluate((element, y) => element.getBoundingClientRect().top - y + 60, local.y) : 300;
      await page.mouse.wheel(0, delta);
      await frame.locator("html").evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
      const target = await frame.locator("html").evaluate((_, point) => {
        const section = document.elementFromPoint(point.x, point.y)?.closest("section")!;
        const siblings = Array.from(section.parentElement!.children);
        const index = siblings.indexOf(section);
        const label = (element: Element | undefined) => {
          if (!element) return "";
          const heading = element.querySelector("h1,h2,h3,h4,h5,h6");
          return ((heading || element).textContent || "").replace(/\s+/g, " ").trim().slice(0, 60);
        };
        return { className: section.className, scrollTop: Math.max(document.scrollingElement!.scrollTop, (section.closest(".probe-scroll") || section.closest("main"))!.scrollTop),
          expected: [section, siblings[index + 1]].map(element => `Add a section ${element ? `before “${label(element)}”` : "at the end"}`) };
      }, local);
      await expect.poll(pair).toEqual(target.expected);
      const afterWheel = await pair();
      await page.mouse.move(frameBox.x + local.x + 1, frameBox.y + local.y);
      await expect.poll(pair).toEqual(target.expected);

      expect(target.scrollTop).toBeGreaterThan(0);
      expect(target.className).not.toBe("hero");
      expect(afterWheel).toEqual(target.expected);
      expect(await source()).toBe(beforeSource);
      expect(await storedDrafts(page)).toEqual(beforeDrafts);
    });
  }
}
