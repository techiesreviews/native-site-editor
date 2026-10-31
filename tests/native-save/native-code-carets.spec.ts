import { expect, test, type Browser, type Page } from "@playwright/test";
import { openEditor } from "../support/scenarios";
import { editorMounted } from "./drafts";
import { openLiveRoom, type LiveRoomSocket } from "../../src/live-room";
import type { JsonValue } from "../../shared/agent-command";

// Others' carets in the code pane (ticket am-22): Lex and Anna, two browsers on the same page with live
// sharing switched on (it is off by default), type in the code pane and each sees the other's caret, a circle
// with a letter that opens into the name on hover; an agent in the room shows the icon of its program. Anna's
// tag at Lex's ends with an undo while her change can be taken back, and it takes back only hers, in both
// tabs. Default fixture group: the real Worker route and relay rooms (src/live-text.ts, src/live-room.ts).
const pageErrors: string[] = [];
const file = "index.html";

/** Where a closed tag is: its circle (the rest is clipped until it opens). */
const circle = { x: 9, y: 9 };
const source = (page: Page) => page.evaluate(async (path) => (await import("/src/components/source-editor.ts")).getMountedSource(path) ?? "", file);

/** A browser signed in under `name` (the fixture has one GitHub account: the session read names it differently). */
async function person(browser: Browser, name: string) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  await context.addInitScript(() => { if (window === window.top) localStorage.setItem("native-site-editor:live-sharing", "on"); });
  await context.route("**/api/session", async route => {
    const response = await route.fetch();
    const body = await response.json() as { user: { login: string } | null };
    if (body.user) body.user.login = name;
    await route.fulfill({ response, json: body });
  });
  const page = await context.newPage();
  page.on("pageerror", (error) => pageErrors.push(error.message));
  return { context, page };
}

/** Types `text` in the code pane after the first `after`, with the keyboard. */
async function typeInCode(page: Page, after: string, text: string) {
  const at = (await source(page)).indexOf(after) + after.length;
  await page.evaluate(async ({ at }) => {
    const { monaco } = await import("/src/components/monaco.ts");
    const editor = monaco.editor.getEditors().find(view => view.getModel()?.uri.path.endsWith("/index.html"))!;
    editor.focus();
    editor.setPosition(editor.getModel()!.getPositionAt(at));
  }, { at });
  await page.keyboard.type(text);
}

/** An agent connected over MCP (from a third tab, as the fixture's own account, with live sharing off) joins the page's
 * room as the relay lets agents in (a bearer token, from Node), and says it works in Claude Code with its caret where
 * `follow`'s is. Agents' own text joins the copy in a later slice (am-25). */
async function agentAt(browser: Browser, baseURL: string, follow: string) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await context.newPage();
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await openEditor(page, baseURL);
  await page.locator(".repository-menu__trigger").click();
  const made = page.waitForResponse(response => new URL(response.url()).pathname === "/api/agent/connect" && response.request().method() === "POST");
  await page.getByRole("button", { name: "Connect to MCP", exact: true }).click();
  const { token } = await (await made).json() as { token: string };
  const connect = (url: string) => new Promise<LiveRoomSocket>((resolve, reject) => {
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
      room.setPresence({ author: 7, name: "Claude Code", agent: "claude-code", caret: theirs.caret! });
    },
  });
  return { room, context };
}

test.beforeEach(() => { pageErrors.length = 0; });
test.afterEach(() => { expect(pageErrors).toEqual([]); });

test("Lex and Anna type in the code pane and see each other's carets; an agent shows its program; Anna's tag takes back only her words", async ({ browser, baseURL }) => {
  const lex = await person(browser, "Lex"), anna = await person(browser, "Anna");
  let agent: Awaited<ReturnType<typeof agentAt>> | undefined;
  try {
    await openEditor(lex.page, baseURL);
    await openEditor(anna.page, baseURL);
    await editorMounted(lex.page);
    await editorMounted(anna.page);
    await typeInCode(lex.page, "Edit plain HTML", ", by Lex,");
    await expect.poll(() => source(anna.page), { timeout: 20_000 }).toContain("Edit plain HTML, by Lex,");
    await typeInCode(anna.page, '<h1 data-key="hero-title">', "Anna was here: ");
    await expect.poll(() => source(lex.page), { timeout: 20_000 }).toContain("Anna was here: A native browser preview");

    // Each sees the other's caret in the code pane: a circle with the first letter, the whole name only on hover.
    const annaAtLex = lex.page.locator(".live-caret__flag", { has: lex.page.locator("b", { hasText: "A" }) });
    const lexAtAnna = anna.page.locator(".live-caret__flag", { has: anna.page.locator("b", { hasText: "L" }) });
    await expect(annaAtLex).toBeVisible({ timeout: 20_000 });
    await expect(annaAtLex).toHaveAccessibleName("Anna");
    await expect(lexAtAnna).toBeVisible({ timeout: 20_000 });
    await expect(lexAtAnna).toHaveAccessibleName("Lex");
    await expect(annaAtLex.locator(".live-caret__name")).toHaveText("nna");
    await expect(annaAtLex.locator(".live-caret__name")).toHaveCSS("opacity", "0");
    await annaAtLex.hover({ position: circle });
    await expect(annaAtLex.locator(".live-caret__name")).toHaveCSS("opacity", "1");
    // An agent in the room: its circle holds the icon of its program, its name on hover.
    agent = await agentAt(browser, baseURL!, "Lex");
    const agentAtLex = lex.page.locator(".live-caret__flag[data-agent]");
    await expect(agentAtLex).toBeVisible({ timeout: 20_000 });
    await expect(agentAtLex).toHaveAccessibleName("Claude Code");
    await expect(agentAtLex.locator("svg.live-caret__program")).toBeVisible();
    await agentAtLex.hover({ position: circle });
    await expect(agentAtLex.locator(".live-caret__name")).toHaveText("Claude Code");
    await expect(agentAtLex.locator(".live-caret__undo")).toBeHidden();

    // Anna's tag ends with an undo while her change can be taken back: it takes back her words in both tabs, Lex's stay.
    await annaAtLex.hover({ position: circle });
    const undo = annaAtLex.getByRole("button", { name: "Undo Anna's change" });
    await expect(undo).toBeVisible();
    await undo.click();
    for (const tab of [lex, anna]) {
      await expect.poll(() => source(tab.page), { timeout: 20_000 }).not.toContain("Anna was here: ");
      expect(await source(tab.page)).toContain("Edit plain HTML, by Lex,");
    }
    // Nothing more of hers to take back: the undo goes, her caret stays.
    await expect(undo).toBeHidden();
    await expect(annaAtLex).toBeVisible();
  } finally {
    agent?.room.close();
    await agent?.context.close();
    await lex.context.close();
    await anna.context.close();
  }
});
