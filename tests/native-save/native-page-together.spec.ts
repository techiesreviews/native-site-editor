import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";
import { expect, test, type Browser, type Locator, type Page } from "@playwright/test";
import { openEditor } from "../support/scenarios";
import { clickOnText } from "./click-text";
import { circleOnTop } from "./caret-flags";
import { editorMounted } from "./drafts";
import { openLiveRoom, type LiveRoomSocket } from "../../src/live-room";
import type { JsonValue } from "../../shared/agent-command";

// Typing together on the page (ticket am-23): Lex and Anna, two browsers on the same page with live sharing switched on
// (on by default since slice am-31). Typing on the page goes out letter by letter, and each sees the other's caret in the page's text,
// with the caret look of the code pane. Anna's tag ends with an undo that takes back only her words, in both tabs. An
// agent's change to the heading Lex types in waits until he clicks away; its caret then shows on the page in both tabs
// with its program's icon, and its tag's undo takes back only its words. Default fixture group: the real Worker route,
// relay and live rooms (src/live-text.ts).
const pageErrors: string[] = [];
const file = "index.html";

const source = (page: Page) => page.evaluate(async (path) => (await import("/src/components/source-editor.ts")).getMountedSource(path) ?? "", file);
const frame = (page: Page) => page.frameLocator(".native-preview-frame");
/** A caret's tag drawn on the page (not the code pane's), by the name it shows. */
const pageFlag = (page: Page, name: string) => page.locator(`.live-carets-page .live-caret__flag[aria-label="${name}"]`);

/** A browser signed in to the fixture's one GitHub account; with `name`, the session read names it so (Anna). Lex keeps the
 * account's own name: connecting an agent is for the account the session really names. */
async function person(browser: Browser, name?: string, phone = false) {
  const context = await browser.newContext(phone
    ? { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, reducedMotion: "reduce" }
    : { viewport: { width: 1440, height: 1000 } });
  await context.addInitScript(() => { if (window === window.top) localStorage.setItem("native-site-editor:live-sharing", "on"); });
  if (name) await context.route("**/api/session", async route => {
    const response = await route.fetch();
    const body = await response.json() as { user: { login: string } | null };
    if (body.user) body.user.login = name;
    await route.fulfill({ response, json: body });
  });
  const page = await context.newPage();
  page.on("pageerror", (error) => pageErrors.push(error.message));
  return { context, page };
}

/** Both open the page and share it: Anna's typing in the code pane reaches Lex. */
async function shared(lex: Page, anna: Page, baseURL: string | undefined) {
  await openEditor(lex, baseURL);
  await openEditor(anna, baseURL);
  await editorMounted(lex);
  await editorMounted(anna);
  await expect(frame(lex).locator(".hero h1")).toHaveText("A native browser preview");
  await expect(frame(anna).locator(".hero h1")).toHaveText("A native browser preview");
  const at = (await source(anna)).indexOf("<head>") + "<head>".length;
  await anna.evaluate(async (at) => {
    const { monaco } = await import("/src/components/monaco.ts");
    const editor = monaco.editor.getEditors().find(view => view.getModel()?.uri.path.endsWith("/index.html"))!;
    editor.focus();
    editor.setPosition(editor.getModel()!.getPositionAt(at));
  }, at);
  await anna.keyboard.type("<!-- Anna -->");
  await expect.poll(() => source(lex), { timeout: 20_000 }).toContain("<head><!-- Anna -->");
}

/** Starts typing in `target` on the page, the caret at its text's end (or start). */
async function typeIn(page: Page, target: Locator, at: "End" | "Home") {
  // (Control: the text's very end or start, not its first line's.)
  await clickOnText(target);
  await expect(target).toHaveAttribute("contenteditable", /.+/);
  await page.keyboard.press(`Control+${at}`);
}

/** Whether the caret drawn for `flag` stands inside `element`'s box on the page. */
async function caretInside(flag: Locator, element: Locator) {
  const caret = await flag.locator("xpath=..").locator(".live-caret__line").boundingBox();
  const box = await element.boundingBox();
  if (!caret || !box) return false;
  const middle = caret.y + caret.height / 2;
  return caret.x >= box.x - 2 && caret.x <= box.x + box.width + 2 && middle >= box.y && middle <= box.y + box.height;
}

/** An agent in the page's room as the relay lets agents in (a bearer token, from Node; connected from a third tab), saying
 * it works in Claude Code as `name`, with its caret where `follow`'s is. */
async function agentAt(browser: Browser, baseURL: string, follow: string, name: string) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await context.newPage();
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await openEditor(page, baseURL);
  await page.locator(".repository-menu__trigger").click();
  const made = page.waitForResponse(response => new URL(response.url()).pathname === "/api/agent/connect" && response.request().method() === "POST");
  await page.getByRole("button", { name: "Connect to MCP", exact: true }).click();
  const { token } = await (await made).json() as { token: string };
  const connect = (url: string) => new Promise<LiveRoomSocket>((resolve, reject) => {
    // Node's WebSocket takes headers (undici), which the DOM typing of its options does not list.
    const socket = new WebSocket(new URL(url, baseURL).href.replace(/^http/, "ws"), { headers: { Authorization: `Bearer ${token}` } } as never);
    socket.binaryType = "arraybuffer";
    socket.addEventListener("open", () => resolve(socket), { once: true });
    socket.addEventListener("error", () => reject(new Error("The agent could not join the room.")), { once: true });
  });
  let said = false;
  const room = openLiveRoom({
    repo: "native-demo-user/native-demo", branch: "main", file, connect, onMessage: () => undefined,
    onPeers(peers) {
      const theirs = [...peers.values()].map(peer => peer.state as { name?: string; caret?: JsonValue } | null).find(state => state?.name === follow && state.caret);
      if (!theirs || said) return;
      said = true;
      room.setPresence({ author: 7, name, agent: "claude-code", caret: theirs.caret! });
    },
  });
  return { room, context };
}

/** Whether `inner`'s box lies inside `outer`'s, across. */
async function inside(inner: Locator, outer: Locator) {
  const box = await inner.boundingBox(), room = await outer.boundingBox();
  return Boolean(box && room && box.x >= room.x - 0.5 && box.x + box.width <= room.x + room.width + 0.5);
}

/** Connects an agent from Lex's repository menu (his tab receives its commands); an MCP client named "Claude Code". */
async function connectAgent(page: Page, baseURL: string | undefined) {
  const messages: string[] = [];
  page.on("websocket", socket => {
    if (socket.url().includes("/api/agent/relay?")) socket.on("framereceived", ({ payload }) => messages.push(String(payload)));
  });
  await page.locator(".repository-menu__trigger").click();
  const made = page.waitForResponse(response => new URL(response.url()).pathname === "/api/agent/connect" && response.request().method() === "POST");
  await page.getByRole("button", { name: "Connect to MCP", exact: true }).click();
  const { token } = await (await made).json() as { token: string };
  await expect.poll(() => messages.some(message => message.includes('"type":"ready"'))).toBe(true);
  await page.keyboard.press("Escape");
  const client = new Client({ name: "Claude Code", version: "1" });
  await client.connect(new StreamableHTTPClientTransport(new URL(`${baseURL}/mcp`), { requestInit: { headers: { Authorization: `Bearer ${token}` } } }));
  const call = async (tool: string, args: Record<string, unknown> = {}) => {
    const response = await client.callTool({ name: tool, arguments: args });
    const value = JSON.parse((response.content as { text: string }[])[0].text);
    expect(Boolean(response.isError), JSON.stringify(value)).toBe(false);
    return value;
  };
  return { client, call };
}

test.beforeEach(() => { pageErrors.length = 0; });
test.afterEach(() => { expect(pageErrors).toEqual([]); });

test("Lex and Anna type in one paragraph on the page and end identical; each sees the other's caret in its text; Anna's tag takes back only her words", async ({ browser, baseURL }) => {
  const lex = await person(browser), anna = await person(browser, "Anna");
  try {
    await shared(lex.page, anna.page, baseURL);
    const lead = (page: Page) => frame(page).locator(".hero .lead");
    const before = await lead(lex.page).textContent() ?? "";

    // Both type in the lead paragraph at once: Anna at its start, Lex at its end, a key every 40 ms. (Anna clicks first:
    // a caret's circle stands over the line above it, and a click there opens its tag rather than typing.)
    await typeIn(anna.page, lead(anna.page), "Home");
    await typeIn(lex.page, lead(lex.page), "End");
    const lexTyped = " Lex types at the end", annaTyped = "Anna starts here. ";
    await Promise.all([lex.page.keyboard.type(lexTyped, { delay: 40 }), anna.page.keyboard.type(annaTyped, { delay: 40 })]);

    // Letter by letter, while both still type in it: every copy and both pages end identical, with both people's words.
    const both = `${annaTyped}${before.trim()}${lexTyped}`;
    for (const tab of [lex, anna]) {
      await expect.poll(async () => (await lead(tab.page).textContent())?.replace(/\s+/g, " ").trim(), { timeout: 20_000 }).toBe(both.trim());
      await expect(lead(tab.page)).toHaveAttribute("contenteditable", /.+/);
    }
    await expect.poll(async () => await source(anna.page) === await source(lex.page), { timeout: 20_000 }).toBe(true);
    expect(await source(lex.page)).toContain(annaTyped.trim());
    expect(await source(lex.page)).toContain(lexTyped.trim());

    // Each sees the other's caret in the paragraph's text: a circle with the first letter, the name only when it opens.
    const annaAtLex = pageFlag(lex.page, "Anna"), lexAtAnna = pageFlag(anna.page, "native-demo-user");
    await expect(annaAtLex).toBeVisible({ timeout: 20_000 });
    await expect(annaAtLex.locator(".live-caret__mark b")).toHaveText("A");
    await expect(lexAtAnna).toBeVisible({ timeout: 20_000 });
    // (Lex keeps the fixture account's own name, native-demo-user, so Anna sees its initial.)
    await expect(lexAtAnna.locator(".live-caret__mark b")).toHaveText("N");
    await expect.poll(() => circleOnTop(annaAtLex), { timeout: 10_000 }).toBe(true);
    await expect.poll(() => circleOnTop(lexAtAnna), { timeout: 10_000 }).toBe(true);
    await expect.poll(() => caretInside(annaAtLex, lead(lex.page)), { timeout: 10_000 }).toBe(true);
    await expect.poll(() => caretInside(lexAtAnna, lead(anna.page)), { timeout: 10_000 }).toBe(true);
    // Anna's caret stands after her words, Lex's at the paragraph's end: no element is outlined for them.
    const annaLine = await annaAtLex.locator("xpath=..").locator(".live-caret__line").boundingBox();
    const leadBox = await lead(lex.page).boundingBox();
    expect(annaLine!.x).toBeGreaterThan(leadBox!.x + 20);

    // A stylesheet error at Lex's (an import of a sheet the branch lacks) puts its banner above the page, moving the frame down in its pane: Anna's caret stays on
    // her words (the carets' layer follows the frame), and again once the error is fixed.
    const styles = (text: string | null) => lex.page.evaluate(async (text) => {
      const { monaco } = await import("/src/components/monaco.ts");
      const model = monaco.editor.getModels().find(found => found.uri.path.endsWith("/styles/site.css"))!;
      if (text) model.pushEditOperations([], [{ range: new monaco.Range(1, 1, 1, 1), text }], () => null);
      else model.undo();
    }, text);
    await styles('@import "missing-sheet.css";\n');
    await expect(lex.page.locator(".native-preview-error")).toBeVisible({ timeout: 10_000 });
    await expect.poll(() => caretInside(annaAtLex, lead(lex.page)), { timeout: 10_000 }).toBe(true);
    await styles(null);
    await expect(lex.page.locator(".native-preview-error")).toBeHidden({ timeout: 10_000 });
    await expect.poll(() => caretInside(annaAtLex, lead(lex.page)), { timeout: 10_000 }).toBe(true);

    // Lex takes Anna's change back from her tag: her words go in both tabs, his stay.
    await annaAtLex.locator(".live-caret__mark").hover();
    const undo = annaAtLex.getByRole("button", { name: "Undo Anna's change" });
    await expect(undo).toBeVisible();
    await undo.click();
    for (const tab of [lex, anna]) {
      await expect.poll(async () => (await lead(tab.page).textContent())?.replace(/\s+/g, " ").trim(), { timeout: 20_000 }).toBe(`${before.trim()}${lexTyped}`);
      await expect.poll(() => source(tab.page), { timeout: 20_000 }).not.toContain(annaTyped.trim());
      expect(await source(tab.page)).toContain(lexTyped.trim());
    }
    // Her earlier change (the comment typed in the code pane) is next; once that goes too, the undo goes.
    await expect(undo).toBeVisible();
    await undo.click();
    for (const tab of [lex, anna]) await expect.poll(() => source(tab.page), { timeout: 20_000 }).not.toContain("<!-- Anna -->");
    await expect(undo).toBeHidden();
    expect(await source(anna.page)).toBe(await source(lex.page));
    expect(await source(lex.page)).toContain(lexTyped.trim());
  } finally {
    await lex.context.close();
    await anna.context.close();
  }
});

test("Anna's circle with her first letter stays on top of Lex's edit bar while both type in the same section", async ({ browser, baseURL }) => {
  const lex = await person(browser), anna = await person(browser, "Anna");
  try {
    await shared(lex.page, anna.page, baseURL);
    // Lex types in the heading: his edit bar opens under it (the heading is the page's first block), over the paragraph.
    // Anna types at the start of that paragraph: her caret's circle stands in the line above her words, where his bar is.
    await typeIn(lex.page, frame(lex.page).locator(".hero h1"), "End");
    await lex.page.keyboard.type(" and more", { delay: 30 });
    await typeIn(anna.page, frame(anna.page).locator(".hero .lead"), "Home");
    await anna.page.keyboard.type("Anna: ", { delay: 30 });
    const bar = lex.page.locator(".edit-bar");
    await expect(bar).toBeVisible();

    const annaAtLex = pageFlag(lex.page, "Anna");
    await expect(annaAtLex).toBeVisible({ timeout: 20_000 });
    await expect(annaAtLex.locator(".live-caret__mark b")).toHaveText("A");
    // The bar really is over her words (the carets may still be moving as their rectangles arrive: polled): the circle's
    // centre is inside the bar's box, and the circle is shown on top of it, not under.
    await expect.poll(async () => {
      const [barBox, markBox] = await Promise.all([bar.boundingBox(), annaAtLex.locator(".live-caret__mark").boundingBox()]);
      if (!barBox || !markBox) return false;
      const x = markBox.x + markBox.width / 2, y = markBox.y + markBox.height / 2;
      return x > barBox.x && x < barBox.x + barBox.width && y > barBox.y && y < barBox.y + barBox.height;
    }, { timeout: 10_000 }).toBe(true);
    await expect.poll(() => circleOnTop(annaAtLex), { timeout: 10_000 }).toBe(true);
    // Every control of the bar answers a press at its middle, wherever her circle stands (a circle whose press area reaches a
    // control gives way to it: the bar's blank parts under the circle leave its press).
    // (Polled: a circle gives way on the frame after the bar moved.)
    await expect.poll(() => lex.page.evaluate(() => {
      const reached = [...document.querySelectorAll<HTMLElement>(".edit-bar button")].filter(button => button.getBoundingClientRect().width > 0).map(button => {
        const box = button.getBoundingClientRect();
        return button.contains(document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2));
      });
      return reached.length > 3 && reached.every(Boolean);
    }), { timeout: 10_000 }).toBe(true);
    // Over the bar by order in the pane (the same level), under the bar's menus and fields, which open over the page.
    const level = (selector: string) => lex.page.locator(selector).first().evaluate(element => Number(getComputedStyle(element).zIndex));
    expect(await level(".live-carets-page")).toBe(await level(".edit-bar"));
    expect(await level(".edit-bar__popover")).toBeGreaterThan(await level(".live-carets-page"));
    expect(await lex.page.evaluate(() => Boolean(document.querySelector(".edit-bar")!.compareDocumentPosition(document.querySelector(".live-carets-page")!) & Node.DOCUMENT_POSITION_FOLLOWING))).toBe(true);
  } finally {
    await lex.context.close();
    await anna.context.close();
  }
});

test("an agent's heading change waits while Lex types in the heading and lands after he clicks away; its caret shows on the page with its icon, and its undo takes back only its words", async ({ browser, baseURL }) => {
  const lex = await person(browser), anna = await person(browser, "Anna");
  let agent: Awaited<ReturnType<typeof connectAgent>> | undefined;
  try {
    await shared(lex.page, anna.page, baseURL);
    agent = await connectAgent(lex.page, baseURL);
    const heading = (page: Page) => frame(page).locator(".hero h1");

    // Lex types in the heading; his letters reach Anna as he types, before he leaves it.
    await typeIn(lex.page, heading(lex.page), "End");
    await lex.page.keyboard.type(" today", { delay: 30 });
    await expect(heading(anna.page)).toHaveText("A native browser preview today", { timeout: 20_000 });
    await expect(pageFlag(anna.page, "native-demo-user")).toBeVisible({ timeout: 20_000 });

    // The agent's change to the heading waits while he types there.
    const read = await agent.call("read_file", { path: file });
    const args = { path: file, expectedHash: read.hash, edits: [{ oldText: "A native", newText: "One agent's" }], requestId: "page-heading", waitSeconds: 0 };
    expect(await agent.call("edit_file", args)).toMatchObject({ state: "waiting", message: expect.stringMatching(/lands once they leave it/) });
    await expect(heading(lex.page)).toHaveText("A native browser preview today");
    await expect(heading(anna.page)).toHaveText("A native browser preview today");

    // He clicks away: the change lands on his typing, in both tabs.
    await clickOnText(frame(lex.page).locator(".filler h2"));
    await expect.poll(async () => (await agent!.call("get_command_status", { requestId: "page-heading" })).state, { timeout: 15_000 }).toBe("applied");
    for (const tab of [lex, anna]) await expect(heading(tab.page)).toHaveText("One agent's browser preview today", { timeout: 20_000 });
    await expect.poll(async () => await source(anna.page) === await source(lex.page), { timeout: 20_000 }).toBe(true);

    // The agent's caret shows in the heading's text in both tabs, with its program's icon.
    for (const tab of [lex, anna]) {
      const flag = pageFlag(tab.page, "Claude Code");
      await expect(flag).toBeVisible({ timeout: 20_000 });
      await expect(flag.locator("svg.live-caret__program")).toBeVisible();
      await expect.poll(() => caretInside(flag, heading(tab.page)), { timeout: 10_000 }).toBe(true);
    }

    // Anna takes the agent's change back from its tag on her page: only its words go, in both tabs; Lex's stay.
    const flag = pageFlag(anna.page, "Claude Code");
    await flag.locator(".live-caret__mark").hover();
    const undo = flag.getByRole("button", { name: "Undo Claude Code's change" });
    await expect(undo).toBeVisible();
    await undo.click();
    for (const tab of [lex, anna]) await expect(heading(tab.page)).toHaveText("A native browser preview today", { timeout: 20_000 });
    await expect.poll(async () => await source(anna.page) === await source(lex.page), { timeout: 20_000 }).toBe(true);
    await expect(undo).toBeHidden();
  } finally {
    await agent?.client.close();
    await lex.context.close();
    await anna.context.close();
  }
});

test("on a phone a page tag opens on a tap inside the frame with 44 px targets, for a long name by the edge too; its undo takes back her words with focus kept", async ({ browser, baseURL }) => {
  const longName = `Annabel ${"Featherstonehaugh-".repeat(5)}`.slice(0, 80);
  const lex = await person(browser, undefined, true), anna = await person(browser, longName);
  let agent: Awaited<ReturnType<typeof agentAt>> | undefined;
  try {
    await shared(lex.page, anna.page, baseURL);
    // Anna types at the end of the heading on her page; at Lex's (390 px, touch, reduced motion) her caret shows there.
    const heading = (page: Page) => frame(page).locator(".hero h1");
    await typeIn(anna.page, heading(anna.page), "End");
    await anna.page.keyboard.type(" and more words by Anna", { delay: 20 });
    await expect(heading(lex.page)).toHaveText("A native browser preview and more words by Anna", { timeout: 20_000 });
    const layer = lex.page.locator(".live-carets-page");
    const annaAtLex = lex.page.locator(".live-carets-page .live-caret__flag", { has: lex.page.locator("b", { hasText: "A" }) });
    await expect(annaAtLex).toBeVisible({ timeout: 20_000 });
    await expect.poll(() => caretInside(annaAtLex, heading(lex.page)), { timeout: 10_000 }).toBe(true);
    // Reduced motion: the tag's reveal does not move.
    expect(await annaAtLex.evaluate(flag => getComputedStyle(flag, "::before").transitionProperty)).not.toContain("clip-path");

    // First, an agent with a long name at her place (its tag has no undo) opens to the side with room, inside the frame;
    // when it leaves, its caret goes.
    agent = await agentAt(browser, baseURL!, longName, `Claude ${"Code-agent-".repeat(8)}`.slice(0, 80));
    const agentAtLex = lex.page.locator(".live-carets-page .live-caret__flag[data-agent]");
    await expect(agentAtLex).toBeVisible({ timeout: 20_000 });
    const agentMark = (await agentAtLex.locator(".live-caret__mark").boundingBox())!;
    await lex.page.touchscreen.tap(agentMark.x + agentMark.width / 2, agentMark.y + agentMark.height / 2);
    await expect(agentAtLex).toBeFocused();
    await expect.poll(() => inside(agentAtLex, layer)).toBe(true);
    expect(await agentAtLex.locator(".live-caret__name").evaluate(name => name.clientWidth)).toBeGreaterThan(10);
    agent.room.close();
    await expect(agentAtLex).toHaveCount(0, { timeout: 45_000 });

    // A tap on her circle opens the tag and keeps focus there; its name is cut to the room and the undo stays in the frame.
    const mark = (await annaAtLex.locator(".live-caret__mark").boundingBox())!;
    await lex.page.touchscreen.tap(mark.x + mark.width / 2, mark.y + mark.height / 2);
    await expect(annaAtLex).toBeFocused();
    await expect(annaAtLex.locator(".live-caret__name")).toHaveCSS("opacity", "1");
    const undo = annaAtLex.getByRole("button", { name: `Undo ${longName}'s change` });
    await expect(undo).toBeVisible();
    await expect.poll(() => inside(annaAtLex, layer)).toBe(true);
    await expect.poll(() => inside(undo, layer)).toBe(true);
    expect(await annaAtLex.locator(".live-caret__name").evaluate(name => name.clientWidth)).toBeGreaterThan(10);
    // Presses 21 px around the undo's centre reach it (44 px on touch).
    const reached = await undo.evaluate(button => {
      const rect = button.getBoundingClientRect(), x = rect.x + rect.width / 2, y = rect.y + rect.height / 2;
      return [[-21, 0], [21, 0], [0, -21], [0, 21]].map(([dx, dy]) => document.elementFromPoint(x + dx, y + dy)?.closest(".live-caret__undo") === button);
    });
    expect(reached).toEqual([true, true, true, true]);

    // A real tap on its undo takes back her words in both tabs; focus stays in her tag (her earlier change, the comment
    // typed in the code pane, can still be taken back).
    const box = (await undo.boundingBox())!;
    await lex.page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
    for (const tab of [lex, anna]) await expect(heading(tab.page)).toHaveText("A native browser preview", { timeout: 20_000 });
    await expect.poll(() => annaAtLex.evaluate(flag => flag.contains(document.activeElement))).toBe(true);
  } finally {
    await agent?.context.close();
    await lex.context.close();
    await anna.context.close();
  }
});

