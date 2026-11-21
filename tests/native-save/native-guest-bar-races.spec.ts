import { expect, test, type Page } from "@playwright/test";
import type { createGuestEditBar } from "../../src/guest-edit-bar";
import type { GuestMessage } from "../../src/live-session";

// Default fixture group. Exercise the real guest bar and Media picker with held host replies,
// without the relay's encryption or network timing obscuring which reply crosses a render.
declare global {
  interface Window {
    guestBarRace: {
      bar: ReturnType<typeof createGuestEditBar>;
      sent: GuestMessage[];
      select(tag: "img" | "p", render?: boolean): void;
      answer(source: string): void;
      picture(): void;
    };
  }
}

async function mount(page: Page) {
  await page.route("**/__guest_bar_race", route => route.fulfill({
    contentType: "text/html",
    body: '<!doctype html><html><head><script type="module">import "/src/style.css"; import "/src/live-guest.css";</script></head><body></body></html>',
  }));
  await page.goto("/__guest_bar_race");
  await page.clock.install();
  await page.evaluate(async () => {
    const [{ createGuestEditBar }, { createPreviewLink }, { FRAME_SOURCE }] = await Promise.all([
      import("/src/guest-edit-bar.ts"), import("/src/components/preview-link.ts"), import("/src/components/preview-wire.ts"),
    ]);
    const canvas = document.createElement("div"), frame = document.createElement("iframe");
    canvas.className = "live-guest__canvas";
    canvas.style.height = "700px";
    frame.style.cssText = "width:100%;height:600px";
    canvas.append(frame); document.body.append(canvas);
    const sent: GuestMessage[] = [];
    let receive: (data: unknown) => void = () => undefined, render = 0;
    const frameLink = createPreviewLink({ post: () => undefined, listen: handler => { receive = handler; return () => undefined; } });
    const photo = document.createElement("canvas"); photo.width = 20; photo.height = 10;
    const url = photo.toDataURL("image/png");
    const bar = createGuestEditBar({ canvas, frame, frameLink, send: message => { sent.push(message); }, me: "anna", picture: path => path === "images/current.png" ? url : undefined });
    bar.receive({ t: "context", context: { path: "index.html", links: [], pictures: ["images/slow.png", "images/missing.png"] } });
    const answer = (source: string) => {
      const asked = sent.filter((message): message is Extract<GuestMessage, { t: "sources" }> => message.t === "sources").at(-1);
      if (!asked) throw new Error("The guest has not asked for sources.");
      bar.receive({ t: "sources", to: "anna", ask: asked.ask, sources: { "index.html": source } });
    };
    window.guestBarRace = {
      bar, sent, answer,
      select(tag, changed = false) {
        if (changed) {
          // Only the render number is consumed by the bar; the frame reports its selection below.
          bar.receive({ t: "render", n: ++render, typed: {}, colours: {}, payload: { html: "", css: "" } });
        }
        receive({ source: FRAME_SOURCE, type: "select", context: frameLink.context(), path: "index.html", tag,
          node: [0, tag === "img" ? 0 : 1], rect: { top: 100, left: 100, bottom: 130, right: 400, width: 300, height: 30 } });
      },
      picture() { bar.receive({ t: "pictures", to: "anna", pictures: { "images/slow.png": url } }); },
    };
  });
}

const source = (inner: string) => `<!doctype html><html><head></head><body><main><img src="/images/current.png"><p>${inner}</p></main></body></html>`;
const bar = (page: Page) => page.getByRole("toolbar", { name: "Edit bar" });

test("a guest can use a thumbnail arriving after 15 seconds without reopening the picker (SL-1)", async ({ page }) => {
  await mount(page);
  await page.evaluate(() => window.guestBarRace.select("img"));
  await bar(page).getByRole("button", { name: "Media", exact: true }).click();
  await expect.poll(() => page.evaluate(() => window.guestBarRace.sent.filter(message => message.t === "sources").length)).toBe(1);
  await page.evaluate(text => window.guestBarRace.answer(text), source("Plain"));
  const popup = page.getByRole("dialog", { name: "Image", exact: true });
  await popup.getByRole("button", { name: "Replace", exact: true }).click();
  const picker = page.getByRole("dialog", { name: "Choose image", exact: true });
  const tile = picker.getByRole("button", { name: "Choose images/slow.png", exact: true });
  await tile.click();
  await expect.poll(() => page.evaluate(() => window.guestBarRace.sent.some(message => message.t === "want"))).toBe(true);
  await page.clock.runFor(15_001);
  expect(await page.evaluate(() => window.guestBarRace.sent.filter(message => message.t === "want" && message.paths.includes("images/slow.png")).length)).toBe(2);
  expect(await page.evaluate(() => window.guestBarRace.sent.filter(message => message.t === "want" && message.paths.includes("images/missing.png")).length)).toBe(2);
  await page.evaluate(() => window.guestBarRace.picture());
  await expect(tile.locator("img")).toHaveAttribute("src", /^blob:/);
  await picker.getByRole("button", { name: "Use image", exact: true }).click();
  await expect.poll(() => page.evaluate(() => window.guestBarRace.sent.filter(message => message.t === "sources").length)).toBe(2);
  await page.evaluate(text => window.guestBarRace.answer(text), source("Plain"));
  await expect.poll(() => page.evaluate(() => window.guestBarRace.sent.find(message => message.t === "change"))).toMatchObject({
    t: "change", change: { kind: "picture", file: "images/slow.png" },
  });
  await page.evaluate(() => {
    const change = window.guestBarRace.sent.find(message => message.t === "change");
    if (change?.t !== "change") throw new Error("The picture was not sent.");
    window.guestBarRace.bar.receive({ t: "answer", to: "anna", ask: change.ask, done: true });
  });
  await expect(picker).toHaveCount(0);
  // The other tile never answers. Use must release its pending read and retry timer too.
  const requests = await page.evaluate(() => window.guestBarRace.sent.filter(message => message.t === "want").length);
  await page.clock.runFor(30_001);
  expect(await page.evaluate(() => window.guestBarRace.sent.filter(message => message.t === "want").length)).toBe(requests);
  // Cancel releases a missing tile too, without sending another picture change.
  await bar(page).getByRole("button", { name: "Media", exact: true }).click();
  await expect.poll(() => page.evaluate(() => window.guestBarRace.sent.filter(message => message.t === "sources").length)).toBe(3);
  await page.evaluate(text => window.guestBarRace.answer(text), source("Plain"));
  await popup.getByRole("button", { name: "Replace", exact: true }).click();
  await picker.getByRole("button", { name: "Choose images/missing.png", exact: true }).click();
  await picker.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(picker).toHaveCount(0);
  const cancelled = await page.evaluate(() => window.guestBarRace.sent.length);
  await page.clock.runFor(30_001);
  expect(await page.evaluate(() => window.guestBarRace.sent.length)).toBe(cancelled);
  await page.evaluate(() => window.guestBarRace.bar.close());
});

test("an old text read cannot repaint Bold after Lex renders the same paragraph (SL-2)", async ({ page }) => {
  await mount(page);
  await page.evaluate(() => window.guestBarRace.select("p"));
  await page.evaluate(text => window.guestBarRace.answer(text), source("Plain"));
  const bold = bar(page).getByRole("button", { name: "Bold", exact: true });
  await expect(bold).toHaveAttribute("aria-pressed", "false");
  // A debounced read starts, then Lex changes the same paragraph while its reply is held.
  await page.evaluate(() => window.guestBarRace.select("p", true));
  await page.clock.runFor(1_201);
  await expect.poll(() => page.evaluate(() => window.guestBarRace.sent.filter(message => message.t === "sources").length)).toBe(2);
  await page.evaluate(() => window.guestBarRace.select("p", true));
  await expect(bold).toHaveAttribute("aria-disabled", "true");
  await page.evaluate(text => window.guestBarRace.answer(text), source("<strong>Old bold</strong>"));
  // The old answer must not flash Bold on during the next read's debounce.
  await expect(bold).toHaveAttribute("aria-pressed", "false");
  await page.clock.runFor(1_201);
  await expect.poll(() => page.evaluate(() => window.guestBarRace.sent.filter(message => message.t === "sources").length)).toBe(3);
  await page.evaluate(text => window.guestBarRace.answer(text), source("<strong>Current bold</strong>"));
  await expect(bold).toHaveAttribute("aria-pressed", "true");
  await expect(bold).not.toHaveAttribute("aria-disabled", "true");
  await bold.click();
  await expect.poll(() => page.evaluate(() => window.guestBarRace.sent.find(message => message.t === "change"))).toMatchObject({
    t: "change", seen: 2, change: { kind: "bold", on: false },
  });
  await page.evaluate(() => window.guestBarRace.bar.close());
});
