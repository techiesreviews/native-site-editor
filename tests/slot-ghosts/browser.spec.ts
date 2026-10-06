import { expect, test } from "@playwright/test";

test("native slot reports preserve authored content without an Empty slots canvas rail", async ({ page, baseURL }) => {
  const origin = baseURL ?? `http://127.0.0.1:${process.env.ASE_TEST_PORT ?? 5616}/`;
  await page.goto(new URL("/tests/slot-ghosts/fixture.html", origin).href);
  await page.evaluate(async () => {
    document.body.replaceChildren();
    const host = document.createElement("main"); host.style.cssText = "height:800px;width:1000px"; document.body.append(host);
    const modulePath = "/src/components/native-preview.ts";
    const { createNativePreview } = await import(modulePath);
    const state = window as any;
    state.fills = []; state.reports = [];
    window.addEventListener("message", e => { if (e.data?.type === "slot-ghosts") state.reports.push(e.data.report); });
    state.preview = createNativePreview(host, { onSlotGhostFill: (target: unknown) => state.fills.push(target) });
    state.sources = {
      "index.html": '<html><body><test-card><span slot="title">Assigned</span></test-card><test-card></test-card></body></html>',
      "components/test-card.html": '<style>:host{display:block;width:400px;height:150px}.hidden{display:none}</style><h2><slot name="title">Fallback title</slot></h2><div class="hidden"><slot name="image"></slot><slot name="image"></slot></div><slot name="empty"></slot><slot name="measured" style="display:block;width:60px;height:12px">Measure</slot>',
    };
    state.preview.activate({ routes: { "/": "index.html" }, components: { "test-card": "components/test-card.html" } });
    state.preview.update({ sources: state.sources });
  });
  const frame = page.frameLocator(".native-preview-frame");
  await expect(frame.locator("test-card")).toHaveCount(2);
  const before = await frame.locator("#page").innerHTML();
  await page.evaluate(() => (window as any).preview.selectNode({ path: "index.html", node: [0] }));
  await expect.poll(() => page.evaluate(() => (window as any).reports.filter(Boolean).at(-1)?.hostNode)).toEqual([0]);
  const report = await page.evaluate(() => (window as any).reports.filter(Boolean).at(-1));
  expect(report.entries.find((entry: any) => entry.name === "title").assigned).toBe(true);
  expect(report.entries.filter((entry: any) => entry.name === "image").map((entry: any) => entry.occurrence)).toEqual([0, 1]);
  expect(report.entries.find((entry: any) => entry.name === "empty").assigned).toBe(false);
  expect(report.entries.find((entry: any) => entry.name === "empty").rect).toBeUndefined();
  expect(report.entries.filter((entry: any) => entry.name === "image").map((entry: any) => entry.hidden)).toEqual([true,true]);
  expect(report.entries.find((entry: any) => entry.name === "measured").rect).toMatchObject({width:60,height:12});
  const reads = await frame.locator("test-card").first().evaluate(async el => {
    const root=el.shadowRoot!,original=root.querySelectorAll.bind(root);let count=0;
    root.querySelectorAll=((selector:string)=>{if(selector==='slot')count++;return original(selector);}) as typeof root.querySelectorAll;
    await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));count=0;
    for(let i=0;i<80;i++)window.dispatchEvent(new Event('scroll'));
    const synchronous=count;await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));const burst=count;count=0;
    for(let i=0;i<80;i++)document.dispatchEvent(new MouseEvent('mousemove',{clientX:5,clientY:5,bubbles:true}));
    await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));const mouse=count;count=0;
    for(let i=0;i<80;i++)el.setAttribute('data-burst',String(i));
    await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(()=>requestAnimationFrame(r))));const mutation=count;
    root.querySelectorAll=original;return {synchronous,burst,mouse,mutation};
  });
  expect(reads).toEqual({synchronous:0,burst:1,mouse:0,mutation:1});
  const oldReads=await frame.locator('test-card').first().evaluate(async el=>{
    const root=el.shadowRoot!,original=root.querySelectorAll.bind(root);let count=0;
    root.querySelectorAll=((selector:string)=>{if(selector==='slot')count++;return original(selector);}) as typeof root.querySelectorAll;
    window.dispatchEvent(new Event('scroll'));
    window.dispatchEvent(new MessageEvent('message',{source:parent,data:{source:'astro-native-preview-host',type:'select-node',request:{path:'index.html',node:[1]}}}));
    count=0;await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));root.querySelectorAll=original;return count;
  });
  expect(oldReads).toBe(0);
  await expect.poll(()=>page.evaluate(()=>(window as any).reports.filter(Boolean).at(-1)?.hostNode)).toEqual([1]);
  await expect(page.getByRole("group", { name: "Empty slots" })).toHaveCount(0);
  await expect(page.locator(".slot-ghosts")).toHaveCount(0);
  // Burst instrumentation only adds its intentional test attribute.
  await frame.locator("test-card").first().evaluate(el=>el.removeAttribute("data-burst"));
  expect(await frame.locator("#page").innerHTML()).toBe(before);
  expect(await frame.locator("test-card").first().evaluate(el => el.shadowRoot!.querySelectorAll('slot').length)).toBe(5);
  expect(await page.evaluate(() => (window as any).fills)).toEqual([]);
  await page.evaluate(() => (window as any).preview.destroy());
  await expect(page.locator(".slot-ghosts")).toHaveCount(0);
});
