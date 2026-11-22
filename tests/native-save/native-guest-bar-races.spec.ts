import { expect, test, type Page } from "@playwright/test";
import type { createGuestEditBar } from "../../src/guest-edit-bar";
import type { GuestMessage } from "../../src/live-session";
import { GUEST_RENDERS_KEPT } from "../../src/live-session";

// Default fixture group. Exercise the real guest bar and Media picker with held host replies,
// without the relay's encryption or network timing obscuring which reply crosses a render.
declare global {
  interface Window {
    guestBarRace: {
      bar: ReturnType<typeof createGuestEditBar>;
      sent: GuestMessage[];
      select(tag: "img" | "p" | "h2", render?: boolean, node?: number[], typed?: number): void;
      answer(source: string, ask?: number): void;
      picture(path?: string): void;
      delaySources(source: string, ms: number): void;
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
    let delayed: { source: string; ms: number } | undefined;
    const bar = createGuestEditBar({ canvas, frame, frameLink, send: message => {
      sent.push(message);
      const delay = delayed;
      if (message.t === "sources" && delay) setTimeout(() => answer(delay.source, message.ask), delay.ms);
    }, me: "anna", picture: path => path === "images/current.png" ? url : undefined });
    bar.receive({ t: "context", context: { path: "index.html", links: [], pictures: ["images/slow.png", "images/missing.png"], sizes: { kind: "inline", sizes: [{ value: "1.25rem", label: "Large" }] } } });
    const answer = (source: string, ask?: number) => {
      const requests = sent.filter((message): message is Extract<GuestMessage, { t: "sources" }> => message.t === "sources");
      const asked = ask === undefined ? requests.at(-1) : requests.find(message => message.ask === ask);
      if (!asked) throw new Error("The guest has not asked for sources.");
      bar.receive({ t: "sources", to: "anna", ask: asked.ask, sources: { "index.html": source } });
    };
    window.guestBarRace = {
      bar, sent, answer,
      select(tag, changed = false, node, typed) {
        if (changed) {
          // Only the render number is consumed by the bar; the frame reports its selection below.
          bar.receive({ t: "render", n: ++render, typed: typed === undefined ? {} : { anna: typed }, colours: {}, payload: { html: "", css: "" } });
        }
        receive({ source: FRAME_SOURCE, type: "select", context: frameLink.context(), path: "index.html", tag,
          node: node ?? [0, tag === "img" ? 0 : 1], rect: { top: 100, left: 100, bottom: 130, right: 400, width: 300, height: 30 } });
      },
      picture(path = "images/slow.png") { bar.receive({ t: "pictures", to: "anna", pictures: { [path]: url } }); },
      delaySources(source, ms) { delayed = { source, ms }; },
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
  expect(await page.evaluate(() => window.guestBarRace.sent.filter(message => message.t === "want").length)).toBe(2);
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

test("a text read crossing a render remains usable with its original proof (SL-2)", async ({ page }) => {
  await mount(page);
  await page.evaluate(() => window.guestBarRace.select("p"));
  await page.evaluate(text => window.guestBarRace.answer(text), source("Plain"));
  const bold = bar(page).getByRole("button", { name: "Bold", exact: true });
  await expect(bold).toHaveAttribute("aria-pressed", "false");
  // A read starts, then Lex changes the same paragraph while its reply is held.
  await page.evaluate(() => window.guestBarRace.select("p", true));
  await page.clock.runFor(1_201);
  await expect.poll(() => page.evaluate(() => window.guestBarRace.sent.filter(message => message.t === "sources").length)).toBe(2);
  await page.evaluate(() => window.guestBarRace.select("p", true));
  await expect(bold).not.toHaveAttribute("aria-disabled", "true");
  expect(await page.evaluate(() => window.guestBarRace.sent.filter(message => message.t === "sources").length)).toBe(2);
  await page.evaluate(text => window.guestBarRace.answer(text, 2), source("<strong>Old bold</strong>"));
  // A read crossing a render stays usable, with its original render as the write's proof.
  await expect(bold).toHaveAttribute("aria-pressed", "true");
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

test("Bold and Text size stay usable during continuous renders without repeated source reads (R1-1)", async ({ page }) => {
  await mount(page);
  await page.evaluate(() => window.guestBarRace.select("p"));
  await page.evaluate(text => window.guestBarRace.answer(text), source("Plain"));
  const bold = bar(page).getByRole("button", { name: "Bold", exact: true });
  const size = bar(page).getByRole("combobox", { name: "Text size" });
  await expect(bold).toHaveAttribute("aria-pressed", "false");
  for (let render = 0; render < 15; render++) {
    await page.evaluate(text => {
      window.guestBarRace.select("p", true);
      window.guestBarRace.answer(text);
    }, source("Plain"));
    await page.clock.runFor(200);
    await expect(bold).not.toHaveAttribute("aria-disabled", "true");
    await expect(size).not.toHaveAttribute("aria-disabled", "true");
  }
  expect(await page.evaluate(() => window.guestBarRace.sent.filter(message => message.t === "sources").length)).toBeLessThanOrEqual(3);
  await bold.click();
  await expect.poll(() => page.evaluate(() => window.guestBarRace.sent.find(message => message.t === "change"))).toMatchObject({
    t: "change", seen: 0, change: { kind: "bold", on: true },
  });
  await page.evaluate(() => window.guestBarRace.bar.close());
});

test("a read crossing a render keeps its original render for Bold and Text size writes", async ({ page }) => {
  for (const control of ["Bold", "Text size"]) {
    await mount(page);
    await page.evaluate(() => {
      window.guestBarRace.select("p");
      window.guestBarRace.select("p", true);
    });
    await page.evaluate(text => window.guestBarRace.answer(text), source("<strong>Read bold</strong>"));
    const bold = bar(page).getByRole("button", { name: "Bold", exact: true });
    await expect(bold).toHaveAttribute("aria-pressed", "true");
    await expect(bold).not.toHaveAttribute("aria-disabled", "true");
    if (control === "Bold") await bold.click();
    else await bar(page).getByRole("combobox", { name: "Text size" }).selectOption("1.25rem");
    await expect.poll(() => page.evaluate(() => window.guestBarRace.sent.find(message => message.t === "change"))).toMatchObject({
      t: "change", seen: 0, change: { kind: control === "Bold" ? "bold" : "size" },
    });
    await page.evaluate(() => window.guestBarRace.bar.close());
  }
});

test("ongoing renders refresh a text proof before the host forgets it", async ({ page }) => {
  for (const control of ["Bold", "Text size"]) {
    await mount(page);
    await page.evaluate(() => window.guestBarRace.select("p", true));
    await page.evaluate(text => window.guestBarRace.answer(text), source("Plain"));
    await expect(bar(page).getByRole("button", { name: "Bold", exact: true })).toHaveAttribute("aria-pressed", "false");
    for (let render = 1; render <= GUEST_RENDERS_KEPT + 5; render++) {
      await page.evaluate(text => {
        window.guestBarRace.select("p", true);
        window.guestBarRace.answer(text);
      }, source("Plain"));
      await page.clock.runFor(200);
      if (render === Math.ceil(GUEST_RENDERS_KEPT / 2)) {
        expect(await page.evaluate(() => window.guestBarRace.sent.filter(message => message.t === "sources").length)).toBe(2);
      }
    }
    const requests = await page.evaluate(() => window.guestBarRace.sent.filter(message => message.t === "sources").length);
    expect(requests).toBe(3);
    if (control === "Bold") await bar(page).getByRole("button", { name: "Bold", exact: true }).click();
    else await bar(page).getByRole("combobox", { name: "Text size" }).selectOption("1.25rem");
    const change = await page.evaluate(() => window.guestBarRace.sent.find(message => message.t === "change"));
    expect(change?.t).toBe("change");
    if (change?.t !== "change") throw new Error("The text change was not sent.");
    expect(change.seen).toBeGreaterThan(GUEST_RENDERS_KEPT + 6 - GUEST_RENDERS_KEPT);
    expect(change.seen).toBeLessThanOrEqual(GUEST_RENDERS_KEPT + 6);
    await page.evaluate(() => window.guestBarRace.bar.close());
  }
});

test("heading level stays usable while a new render waits for its text read", async ({ page }) => {
  await mount(page);
  const heading = source("Heading").replace("<p>", "<h2>").replace("</p>", "</h2>");
  await page.evaluate(() => window.guestBarRace.select("h2"));
  await page.evaluate(text => window.guestBarRace.answer(text), heading);
  await expect(bar(page).getByRole("button", { name: "Bold", exact: true })).toHaveAttribute("aria-pressed", "false");
  for (let render = 0; render < 5; render++) {
    await page.evaluate(() => window.guestBarRace.select("h2", true));
    expect(await bar(page).getByRole("combobox", { name: "Heading level" }).getAttribute("aria-disabled")).not.toBe("true");
    expect(await page.evaluate(() => window.guestBarRace.sent.filter(message => message.t === "sources").length)).toBe(1);
    await page.clock.runFor(200);
  }
  await page.clock.runFor(1_201);
  await expect.poll(() => page.evaluate(() => window.guestBarRace.sent.filter(message => message.t === "sources").length)).toBe(2);
  await page.evaluate(text => window.guestBarRace.answer(text), heading);
  await expect(bar(page).getByRole("button", { name: "Bold", exact: true })).not.toHaveAttribute("aria-disabled", "true");
  await page.evaluate(() => window.guestBarRace.bar.close());
});

test("selecting another paragraph does not wait for an old selection's unanswered read", async ({ page }) => {
  await mount(page);
  await page.evaluate(() => window.guestBarRace.select("p"));
  await page.evaluate(() => window.guestBarRace.select("p", false, [0, 2]));
  expect(await page.evaluate(() => window.guestBarRace.sent.filter(message => message.t === "sources").length)).toBe(2);
  const second = source("First").replace("</main>", "<p><strong>Second</strong></p></main>");
  await page.evaluate(text => window.guestBarRace.answer(text, 2), second);
  const bold = bar(page).getByRole("button", { name: "Bold", exact: true });
  await expect(bold).toHaveAttribute("aria-pressed", "true");
  await page.evaluate(text => window.guestBarRace.answer(text, 1), source("First"));
  await expect(bold).toHaveAttribute("aria-pressed", "true");
  await page.evaluate(() => window.guestBarRace.bar.close());
});

test("a lost text reply does not hold up a newer render's read (R1-2)", async ({ page }) => {
  await mount(page);
  await page.evaluate(() => window.guestBarRace.select("p"));
  await page.evaluate(text => window.guestBarRace.answer(text), source("Plain"));
  const bold = bar(page).getByRole("button", { name: "Bold", exact: true });
  await expect(bold).toHaveAttribute("aria-pressed", "false");
  await page.evaluate(() => window.guestBarRace.select("p", true));
  await page.clock.runFor(1_201);
  expect(await page.evaluate(() => window.guestBarRace.sent.filter(message => message.t === "sources").length)).toBe(2);
  // Request 2 is lost. The next render must read without waiting for its 10 second timeout.
  await page.evaluate(() => window.guestBarRace.select("p", true));
  await page.clock.runFor(1_201);
  expect(await page.evaluate(() => window.guestBarRace.sent.filter(message => message.t === "sources").length)).toBe(3);
  await page.evaluate(text => window.guestBarRace.answer(text, 3), source("<strong>Current bold</strong>"));
  await expect(bold).toHaveAttribute("aria-pressed", "true");
  await expect(bold).not.toHaveAttribute("aria-disabled", "true");
  // A late older answer cannot overwrite the newer read.
  await page.evaluate(text => window.guestBarRace.answer(text, 2), source("Plain"));
  await expect(bold).toHaveAttribute("aria-pressed", "true");
  await page.evaluate(() => window.guestBarRace.bar.close());
});

test("a pending text change does not repeatedly refresh its old proof", async ({ page }) => {
  await mount(page);
  await page.evaluate(() => window.guestBarRace.select("p"));
  await page.evaluate(text => window.guestBarRace.answer(text), source("Plain"));
  const bold = bar(page).getByRole("button", { name: "Bold", exact: true });
  await expect(bold).toHaveAttribute("aria-pressed", "false");
  for (let render = 0; render < GUEST_RENDERS_KEPT / 2; render++) {
    await page.evaluate(() => window.guestBarRace.select("p", true));
    await page.clock.runFor(200);
  }
  await bold.click();
  // A read that finishes while the write is pending is discarded, leaving the previous text proof in place.
  await page.evaluate(text => window.guestBarRace.answer(text), source("Plain"));
  await expect(bold).toHaveAttribute("aria-disabled", "true");
  for (let render = 0; render < 5; render++) {
    await page.evaluate(text => {
      window.guestBarRace.select("p", true);
      window.guestBarRace.answer(text);
    }, source("Plain"));
    await page.clock.runFor(200);
  }
  expect(await page.evaluate(() => window.guestBarRace.sent.filter(message => message.t === "sources").length)).toBe(2);
  await page.evaluate(() => window.guestBarRace.bar.close());
});

test("six-second text replies still refresh proofs during ongoing renders", async ({ page }) => {
  for (const control of ["Bold", "Text size"]) {
    await mount(page);
    await page.evaluate(() => window.guestBarRace.select("p", true));
    await page.evaluate(text => window.guestBarRace.answer(text), source("Plain"));
    const bold = bar(page).getByRole("button", { name: "Bold", exact: true });
    await expect(bold).toHaveAttribute("aria-pressed", "false");
    await page.evaluate(text => window.guestBarRace.delaySources(text, 6_000), source("Plain"));
    for (let render = 0; render < 65; render++) {
      await page.evaluate(() => window.guestBarRace.select("p", true));
      await page.clock.runFor(200);
    }
    await expect(bold).not.toHaveAttribute("aria-disabled", "true");
    if (control === "Bold") await bold.click();
    else await bar(page).getByRole("combobox", { name: "Text size" }).selectOption("1.25rem");
    const change = await page.evaluate(() => window.guestBarRace.sent.find(message => message.t === "change"));
    if (change?.t !== "change") throw new Error("The text change was not sent.");
    expect(change.seen).toBeGreaterThan(66 - GUEST_RENDERS_KEPT);
    await page.evaluate(() => window.guestBarRace.bar.close());
  }
});

test("Bold waits for the read confirming the guest's preceding Text size change", async ({ page }) => {
  await mount(page);
  await page.evaluate(() => window.guestBarRace.select("p"));
  await page.evaluate(text => window.guestBarRace.answer(text), source("Plain"));
  const bold = bar(page).getByRole("button", { name: "Bold", exact: true });
  const size = bar(page).getByRole("combobox", { name: "Text size" });
  await expect(bold).toHaveAttribute("aria-pressed", "false");
  await size.selectOption("1.25rem");
  await page.evaluate(() => {
    const change = window.guestBarRace.sent.find(message => message.t === "change");
    if (change?.t !== "change") throw new Error("The size change was not sent.");
    window.guestBarRace.bar.receive({ t: "answer", to: "anna", ask: change.ask, done: true });
  });
  await page.clock.runFor(1);
  await page.evaluate(() => window.guestBarRace.select("p", true));
  await expect.poll(() => page.evaluate(() => window.guestBarRace.sent.filter(message => message.t === "sources").length)).toBe(2);
  await expect(bold).toHaveAttribute("aria-disabled", "true");
  await expect(size).toHaveAttribute("aria-disabled", "true");
  await page.evaluate(text => window.guestBarRace.answer(text), source("Plain").replace("<p>", '<p style="font-size: 1.25rem">'));
  await expect(bold).not.toHaveAttribute("aria-disabled", "true");
  await bold.click();
  await expect.poll(() => page.evaluate(() => window.guestBarRace.sent.filter(message => message.t === "change").at(-1))).toMatchObject({
    seen: 1, change: { kind: "bold", on: true },
  });
  await page.evaluate(() => window.guestBarRace.bar.close());
});

test("text controls wait for the read confirming the guest's typed letters", async ({ page }) => {
  for (const control of ["Bold", "Text size"]) {
    await mount(page);
    await page.evaluate(() => window.guestBarRace.select("p"));
    await page.evaluate(text => window.guestBarRace.answer(text), source("Plain"));
    const bold = bar(page).getByRole("button", { name: "Bold", exact: true });
    const size = bar(page).getByRole("combobox", { name: "Text size" });
    await expect(bold).toHaveAttribute("aria-pressed", "false");
    await page.evaluate(() => {
      window.guestBarRace.bar.typing(1);
      window.guestBarRace.select("p", true);
    });
    await page.clock.runFor(1_201);
    expect(await page.evaluate(() => window.guestBarRace.sent.filter(message => message.t === "sources").length)).toBe(1);
    await page.evaluate(() => window.guestBarRace.select("p", true, undefined, 1));
    await expect(bold).toHaveAttribute("aria-disabled", "true");
    await expect(size).toHaveAttribute("aria-disabled", "true");
    // Even a forced DOM event while the fresh read is held cannot send an unconfirmed proof.
    if (control === "Bold") await bold.evaluate((button: HTMLButtonElement) => button.click());
    else await size.evaluate((select: HTMLSelectElement) => {
      select.value = "1.25rem";
      select.dispatchEvent(new Event("change", { bubbles: true }));
    });
    expect(await page.evaluate(() => window.guestBarRace.sent.filter(message => message.t === "change").length)).toBe(0);
    await expect.poll(() => page.evaluate(() => window.guestBarRace.sent.filter(message => message.t === "sources").length)).toBe(2);
    await page.evaluate(text => window.guestBarRace.answer(text), source("Plain typed"));
    await expect(bold).not.toHaveAttribute("aria-disabled", "true");
    if (control === "Bold") await bold.click();
    else await size.selectOption("1.25rem");
    await expect.poll(() => page.evaluate(() => window.guestBarRace.sent.find(message => message.t === "change"))).toMatchObject({
      seen: 2, change: { kind: control === "Bold" ? "bold" : "size" },
    });
    await page.evaluate(() => window.guestBarRace.bar.close());
  }
});

test("a cancelled picker's late change answer cannot stop a newly opened picker's thumbnails", async ({ page }) => {
  await mount(page);
  await page.evaluate(() => window.guestBarRace.select("img"));
  const media = bar(page).getByRole("button", { name: "Media", exact: true });
  await media.click();
  await expect.poll(() => page.evaluate(() => window.guestBarRace.sent.filter(message => message.t === "sources").length)).toBe(1);
  await page.evaluate(text => window.guestBarRace.answer(text), source("Plain"));
  const popup = page.getByRole("dialog", { name: "Image", exact: true });
  await popup.getByRole("button", { name: "Replace", exact: true }).click();
  const picker = page.getByRole("dialog", { name: "Choose image", exact: true });
  await picker.getByRole("button", { name: "Choose images/slow.png", exact: true }).click();
  await page.evaluate(() => window.guestBarRace.picture());
  await picker.getByRole("button", { name: "Use image", exact: true }).click();
  await expect.poll(() => page.evaluate(() => window.guestBarRace.sent.filter(message => message.t === "sources").length)).toBe(2);
  await page.evaluate(text => window.guestBarRace.answer(text), source("Plain"));
  await expect.poll(() => page.evaluate(() => window.guestBarRace.sent.some(message => message.t === "change"))).toBe(true);
  await picker.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(picker).toHaveCount(0);
  await media.click();
  await expect.poll(() => page.evaluate(() => window.guestBarRace.sent.filter(message => message.t === "sources").length)).toBe(3);
  await page.evaluate(text => window.guestBarRace.answer(text), source("Plain"));
  await popup.getByRole("button", { name: "Replace", exact: true }).click();
  const missing = picker.getByRole("button", { name: "Choose images/missing.png", exact: true });
  await missing.click();
  await page.evaluate(() => {
    const change = window.guestBarRace.sent.find(message => message.t === "change");
    if (change?.t !== "change") throw new Error("The first picture was not sent.");
    window.guestBarRace.bar.receive({ t: "answer", to: "anna", ask: change.ask, done: true });
  });
  await page.clock.runFor(15_001);
  expect(await page.evaluate(() => window.guestBarRace.sent.filter(message => message.t === "want" && message.paths.includes("images/missing.png")).length)).toBe(2);
  await page.evaluate(() => window.guestBarRace.picture("images/missing.png"));
  await expect(missing.locator("img")).toHaveAttribute("src", /^blob:/);
  await picker.getByRole("button", { name: "Cancel", exact: true }).click();
  await page.evaluate(() => window.guestBarRace.bar.close());
});

test("text controls wait for a fresh read once their proof has expired", async ({ page }) => {
  await mount(page);
  await page.evaluate(() => window.guestBarRace.select("p", true));
  await page.evaluate(text => window.guestBarRace.answer(text), source("Plain"));
  const bold = bar(page).getByRole("button", { name: "Bold", exact: true });
  await expect(bold).toHaveAttribute("aria-pressed", "false");
  for (let render = 0; render < GUEST_RENDERS_KEPT; render++) {
    await page.evaluate(() => window.guestBarRace.select("p", true));
    await page.clock.runFor(200);
  }
  await expect(bold).toHaveAttribute("aria-disabled", "true");
  await expect(bar(page).getByRole("combobox", { name: "Text size" })).toHaveAttribute("aria-disabled", "true");
  await page.evaluate(text => window.guestBarRace.answer(text), source("Plain"));
  await expect(bold).not.toHaveAttribute("aria-disabled", "true");
  await bold.click();
  await expect.poll(() => page.evaluate(() => window.guestBarRace.sent.find(message => message.t === "change"))).toMatchObject({ seen: 51 });
  await page.evaluate(() => window.guestBarRace.bar.close());
});

