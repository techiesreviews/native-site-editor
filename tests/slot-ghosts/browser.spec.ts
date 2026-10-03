import { expect, test } from "@playwright/test";

test("real native preview reports optional slots and guards canvas callbacks", async ({ page }) => {
  await page.goto("http://127.0.0.1:5446/");
  await page.evaluate(async () => {
    document.body.replaceChildren();
    document.body.style.margin = "0";
    const host = document.createElement("main"); host.style.cssText = "height:800px;width:1000px"; document.body.append(host);
    const { createNativePreview } = await import("/src/components/native-preview.ts");
    const state = window as any;
    state.fills = []; state.reports = [];
    window.addEventListener("message", e => { if (e.data?.type === "slot-ghosts") state.reports.push(e.data.report); });
    state.preview = createNativePreview(host, { onSlotGhostFill: (target: unknown) => state.fills.push(target) });
    state.sources = {
      "index.html": '<html><body><test-card><span slot="title">Assigned</span>  </test-card><test-card></test-card><div style="height:2000px">Tail</div></body></html>',
      "components/test-card.html": '<style>:host{display:block;width:400px;height:150px;margin:40px} .hidden{display:none}</style><h2><slot name="title">Fallback title</slot></h2><div class="hidden">Image area<slot name="image"></slot><slot name="image"></slot></div><slot name="zero"></slot><slot name="fallback">Fallback</slot><slot name="measured" style="display:block;width:60px;height:12px">Measure</slot>',
    };
    state.preview.activate({ routes: { "/": "index.html" }, components: { "test-card": "components/test-card.html" } });
    state.preview.update({ sources: state.sources });
  });
  const frame = page.frameLocator(".native-preview-frame");
  await expect(frame.locator("test-card").first()).toBeVisible();
  const before = await frame.locator("#page").innerHTML();
  await page.evaluate(() => (window as any).preview.selectNode({ path: "index.html", node: [0] }));
  const image = page.getByRole("button", { name: "Add Image · 2 outlets · first outlet hidden", exact: true });
  await expect(image).toBeVisible();
  await expect(page.getByRole("button", { name: "Add Title", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Add Zero", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Add Fallback", exact: true })).toBeVisible();
  await image.click();
  const report = await page.evaluate(() => (window as any).reports.filter(Boolean).at(-1));
  expect(report.hostNode).toEqual([0]);
  expect(report.entries.find((e: any) => e.name === "zero")).toMatchObject({ hidden: false, assigned: false });
  expect(report.entries.find((e: any) => e.name === "zero").rect).toBeUndefined();
  expect(report.entries.find((e: any) => e.name === "measured").rect).toMatchObject({ width: 60, height: 12 });
  expect(report.entries.filter((e: any) => e.name === "image").map((e: any) => [e.occurrence, e.hidden, e.rect])).toEqual([[0, true, undefined], [1, true, undefined]]);
  expect(await page.evaluate(() => (window as any).fills.at(-1))).toEqual({ context: report.context, pagePath: "index.html", tag: "test-card", templatePath: "components/test-card.html", hostNode: [0], name: "image" });
  expect(await frame.locator("#page").innerHTML()).toBe(before);
  await frame.locator("test-card").first().evaluate(el => { (el.shadowRoot!.querySelector(".hidden") as HTMLElement).style.display = "block"; });
  await expect(page.getByRole("button", { name: "Add Image · 2 outlets · first outlet", exact: true })).toBeVisible();
  await frame.locator("test-card").first().evaluate(el => { (el.shadowRoot!.querySelector(".hidden") as HTMLElement).style.removeProperty("display"); });
  await expect(image).toBeVisible();
  await frame.locator("test-card").first().locator("h2").click();
  await image.click();
  expect(await page.evaluate(() => (window as any).fills.at(-1).hostNode)).toEqual([0]);
  // Frame scaling and resizing keep hit targets inside both clipping viewports.
  await page.locator(".native-preview-frame").evaluate(el => { (el as HTMLElement).style.transform = "scale(.75)"; (el as HTMLElement).style.transformOrigin = "top left"; });
  await page.setViewportSize({ width: 1100, height: 850 });
  await image.click();
  const buttonBox = await image.boundingBox(), frameBox = await page.locator(".native-preview-frame").boundingBox();
  expect(buttonBox!.x).toBeGreaterThanOrEqual(frameBox!.x); expect(buttonBox!.x + buttonBox!.width).toBeLessThanOrEqual(frameBox!.x + frameBox!.width);
  // Pane scaling, scrolling, and host visibility never leave stale targets.
  await page.locator(".native-preview-pane").evaluate(el => { (el as HTMLElement).style.transform = "scale(.9)"; (el as HTMLElement).style.transformOrigin = "top left"; });
  await page.setViewportSize({ width: 1090, height: 845 });
  await image.click();
  await frame.locator("test-card").first().evaluate(el => { el.setAttribute("style", "opacity:0"); });
  await expect(image).toHaveCount(0);
  await frame.locator("test-card").first().evaluate(el => { el.removeAttribute("style"); });
  await expect(image).toBeVisible();
  await frame.locator("test-card").first().evaluate(() => window.scrollTo(0, 600));
  await expect(image).toHaveCount(0);
  await frame.locator("test-card").first().evaluate(() => window.scrollTo(0, 0));
  await expect(image).toBeVisible();
  const fillsBeforeStale = await page.evaluate(() => {
    const state = window as any;
    state.oldButton = document.querySelector(".slot-ghosts button");
    const count = state.fills.length;
    state.preview.refresh();
    state.oldButton.click();
    return count;
  });
  expect(await page.evaluate(() => (window as any).fills.length)).toBe(fillsBeforeStale);
  await expect(image).toBeVisible();
  const currentReport = await page.evaluate(() => (window as any).reports.filter(Boolean).at(-1));
  // A malformed report clears controls and never produces an action.
  await frame.locator("test-card").first().evaluate((_, bad) => parent.postMessage({ source: "astro-native-preview", type: "slot-ghosts", context: bad.context, report: { ...bad, templatePath: "wrong.html" } }, "*"), currentReport);
  await expect(image).toHaveCount(0);
  await page.evaluate(() => (window as any).preview.selectNode({ path: "index.html", node: [1] }));
  await expect(page.getByRole("button", { name: "Add Title", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Add Title", exact: true }).click();
  expect(await page.evaluate(() => (window as any).fills.at(-1).hostNode)).toEqual([1]);
  const beforeWrongHost = await page.evaluate(() => (window as any).fills.length);
  await frame.locator("test-card").nth(1).evaluate((_, old) => parent.postMessage({ source: "astro-native-preview", type: "slot-ghosts", context: old.context, report: old }, "*"), currentReport);
  await image.click();
  expect(await page.evaluate(() => (window as any).fills.length)).toBe(beforeWrongHost);
  await page.evaluate(() => (window as any).preview.refresh());
  await expect(page.getByRole("button", { name: "Add Title", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Add Title", exact: true }).focus(); await page.keyboard.press("Escape");
  await expect(image).toHaveCount(0);
  await frame.locator("test-card").nth(1).evaluate(el => { el.setAttribute("data-test", "mutation"); window.dispatchEvent(new Event("resize")); window.scrollTo(0, 600); });
  await frame.locator("test-card").nth(1).evaluate(() => window.scrollTo(0, 0));
  await page.setViewportSize({ width: 1085, height: 842 });
  await expect(image).toHaveCount(0);
  await page.evaluate(() => (window as any).preview.selectNode({ path: "index.html", node: [0] }));
  await expect(image).toBeVisible();
  await page.evaluate(() => (window as any).preview.selectNode({ path: "index.html", node: [1] }));
  await frame.locator("test-card").nth(1).evaluate(el => el.remove());
  await page.setViewportSize({ width: 1080, height: 840 });
  await expect(image).toHaveCount(0);
  await page.evaluate(() => (window as any).preview.destroy());
  await expect(page.locator(".slot-ghosts")).toHaveCount(0);
});

test("wrapped rail avoids real controls; reports coalesce and reject stale context", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 760 });
  await page.goto("http://127.0.0.1:5446/");
  await page.evaluate(async () => {
    document.body.replaceChildren(); document.body.style.margin = "0";
    const host = document.createElement("main"); host.className = "code-collapsed"; host.style.cssText = "width:390px;height:720px"; document.body.append(host);
    const { createNativePreview } = await import("/src/components/native-preview.ts");
    const s = window as any; s.fills = []; s.reports = [];
    window.addEventListener("message", e => { if (e.data?.type === "slot-ghosts") s.reports.push(e.data.report); });
    s.preview = createNativePreview(host, {
      onSlotGhostFill: (target: unknown) => s.fills.push(target),
      onSelect: (selection: any) => { if (selection.rect) s.preview.showEditBar({ kind: "Component", controls: [{ kind: "button", label: "Edit", onPress: () => {} }] }, selection.rect); },
      cards: { describe: () => ({ noun: "card", label: "Cards", collection: "/cards/" }),
        plan: () => ({ ok: true, value: { route: "/cards/new/" } }), addCard: () => {}, addPage: async () => undefined },
    });
    s.sources = {
      "index.html": '<html><body><section style="display:grid;grid-template-columns:1fr;gap:10px"><test-card></test-card><test-card></test-card></section><div style="height:1800px">Tail</div></body></html>',
      "other.html": '<html><body><test-card></test-card></body></html>',
      "components/test-card.html": '<style>:host{display:block;height:240px} .hidden{display:none}</style><p>Card</p>' +
        Array.from({ length: 20 }, (_, i) => `<slot name="slot-${i}"></slot>`).join("") +
        '<slot name="cta-label"></slot><slot name="Image"></slot><div class="hidden">Image area<slot name="image"></slot></div><slot name="image"></slot><nested-card></nested-card>',
      "components/nested-card.html": '<style>:host{display:block;height:30px}</style>Nested<slot name="nested"></slot>',
      "components/alone-card.html": '<style>:host{display:block;height:100px}</style>Alone<slot name="alone"></slot>',
    };
    s.preview.activate({ routes: { "/": "index.html", "/other/": "other.html" }, components: {
      "test-card": "components/test-card.html", "nested-card": "components/nested-card.html", "alone-card": "components/alone-card.html" } });
    s.preview.update({ sources: s.sources });
  });
  const frame = page.frameLocator(".native-preview-frame");
  await expect(frame.locator("test-card").first()).toBeVisible();
  await page.evaluate(() => (window as any).preview.selectNode({ path: "index.html", node: [0, 0] }));
  const rail = page.locator(".slot-ghosts__rail");
  await expect(rail).toBeVisible();
  await expect(page.getByRole("button", { name: "Add Cta label", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Add Image (Image)", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Add Image (image) · 2 outlets · first outlet hidden", exact: true })).toBeVisible();
  await expect(page.locator(".edit-bar")).toBeVisible();
  await expect(page.locator(".insert-point__plus").first()).toBeVisible();
  await expect(page.locator(".card-ghost__add")).toBeVisible();
  const assertPhysical = async () => {
    await expect.poll(() => page.evaluate(() => {
      const rail = document.querySelector(".slot-ghosts__rail") as HTMLElement;
      const r = rail.getBoundingClientRect(), f = document.querySelector("iframe")!.getBoundingClientRect();
      const controls = [...document.querySelectorAll(".edit-bar, .insert-point__plus, .card-ghost__add, .card-add")].map(e => e.getBoundingClientRect()).filter(b => b.width && b.height);
      const button = [...rail.querySelectorAll("button")].find(b => { const x = b.getBoundingClientRect(); return x.top >= r.top && x.bottom <= r.bottom; })!;
      const b = button.getBoundingClientRect();
      return { overlap: controls.some(c => r.left < c.right && r.right > c.left && r.top < c.bottom && r.bottom > c.top),
        hit: document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2) === button,
        clipped: r.left >= f.left && r.right <= Math.min(f.right, innerWidth) && r.top >= f.top && r.bottom <= Math.min(f.bottom, innerHeight),
        overflow: document.documentElement.scrollWidth > innerWidth, scrollable: rail.scrollHeight > rail.clientHeight };
    })).toEqual({ overlap: false, hit: true, clipped: true, overflow: false, scrollable: true });
  };
  await assertPhysical();
  // Scroll normally with the wheel, then physically click the final button.
  await rail.hover(); await page.mouse.wheel(0, 800);
  const last = rail.locator("button").last(); await last.click();
  expect(await page.evaluate(() => (window as any).fills.at(-1).name)).toBe("image");
  // Tab follows DOM order and scrolls each focused control into view.
  const buttons = rail.locator("button"); await buttons.first().focus();
  for (let i = 1; i < await buttons.count(); i++) { await page.keyboard.press("Tab"); await expect(buttons.nth(i)).toBeFocused(); }
  await expect(last).toBeFocused();
  await assertPhysical();
  // Instrument actual selected-host slot-tree reads, not deduplicated emissions.
  const reads = await frame.locator("test-card").first().evaluate(async el => {
    const root = el.shadowRoot!, original = root.querySelectorAll.bind(root); let count = 0;
    root.querySelectorAll = ((selector: string) => { if (selector === "slot") count++; return original(selector); }) as typeof root.querySelectorAll;
    await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
    count = 0;
    for (let i = 0; i < 80; i++) window.dispatchEvent(new Event("scroll"));
    const synchronous = count;
    await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
    const burst = count; count = 0;
    for (let i = 0; i < 80; i++) document.dispatchEvent(new MouseEvent("mousemove", { clientX: 5, clientY: 5, bubbles: true }));
    await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
    const mouse = count; count = 0;
    for (let i = 0; i < 80; i++) el.setAttribute("data-burst", String(i));
    await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(r))));
    const mutation = count; root.querySelectorAll = original;
    return { synchronous, burst, mouse, mutation };
  });
  expect(reads.synchronous).toBe(0); expect(reads.burst).toBe(1); expect(reads.mouse).toBe(0); expect(reads.mutation).toBe(1);
  // A queued frame reads the latest host, never the host at scheduling time.
  const oldReads = await frame.locator("test-card").first().evaluate(async el => {
    const root = el.shadowRoot!, original = root.querySelectorAll.bind(root); let count = 0;
    root.querySelectorAll = ((selector: string) => { if (selector === "slot") count++; return original(selector); }) as typeof root.querySelectorAll;
    window.dispatchEvent(new Event("scroll"));
    window.dispatchEvent(new MessageEvent("message", { source: parent, data: { source: "astro-native-preview-host", type: "select-node", request: { path: "index.html", node: [0, 1] } } }));
    // Selection itself has unrelated synchronous editor reads; measure the queued report.
    count = 0;
    await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
    root.querySelectorAll = original; return count;
  });
  expect(oldReads).toBe(0);
  await expect.poll(() => page.evaluate(() => (window as any).reports.filter(Boolean).at(-1).hostNode)).toEqual([0, 1]);
  await page.evaluate(() => (window as any).preview.selectNode({ path: "index.html", node: [0, 0] }));
  await expect.poll(() => page.evaluate(() => (window as any).reports.filter(Boolean).at(-1).hostNode)).toEqual([0, 0]);
  // First duplicate receives assignment; the hidden first outlet is disclosed.
  await frame.locator("test-card").first().evaluate(el => { const span = document.createElement("span"); span.slot = "image"; span.textContent = "Assigned"; el.append(span); });
  await expect(rail.getByRole("button", { name: /Add Image \(image\)/ })).toHaveCount(0);
  expect(await frame.locator("test-card").first().evaluate(el => [...el.shadowRoot!.querySelectorAll('slot[name="image"]')].map(s => (s as HTMLSlotElement).assignedNodes().length))).toEqual([1, 0]);
  await frame.locator("test-card").first().evaluate(el => el.querySelector('[slot="image"]')!.remove());
  await expect(rail.getByRole("button", { name: /Add Image \(image\)/ })).toBeVisible();
  // Position near the bottom of the frame, with the real card dialog open.
  await page.locator(".card-ghost__add").click();
  await expect(page.locator(".card-add")).toBeVisible();
  await frame.locator("test-card").first().evaluate(el => { (el as HTMLElement).style.marginTop = `${innerHeight - (el as HTMLElement).offsetHeight - 8}px`; });
  await expect(rail).toBeVisible(); await assertPhysical();
  // Route change invalidates the detached callback synchronously.
  const stale = await page.evaluate(() => { const s = window as any, b = document.querySelector(".slot-ghosts button") as HTMLButtonElement;
    const count = s.fills.length; s.preview.update({ route: "/other/" }); b.click(); return count; });
  expect(await page.evaluate(() => (window as any).fills.length)).toBe(stale);
  await expect(frame.locator("test-card")).toHaveCount(1);
  await page.evaluate(() => (window as any).preview.selectNode({ path: "other.html", node: [0] }));
  await expect(rail).toBeVisible();
  await frame.locator("nested-card").click();
  await expect(rail).toHaveCount(0);
  await page.evaluate(() => (window as any).preview.update({ component: "alone-card" }));
  await expect(frame.locator("alone-card")).toBeVisible();
  await frame.locator("alone-card").click();
  await expect(rail).toHaveCount(0);
  await page.evaluate(() => (window as any).preview.destroy());
  await page.setViewportSize({ width: 400, height: 750 });
  await expect(page.locator(".slot-ghosts")).toHaveCount(0);
});
