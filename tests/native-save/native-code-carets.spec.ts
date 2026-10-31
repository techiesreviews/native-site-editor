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

const source = (page: Page) => page.evaluate(async (path) => (await import("/src/components/source-editor.ts")).getMountedSource(path) ?? "", file);

/** A browser signed in under `name` (the fixture has one GitHub account: the session read names it differently). */
async function person(browser: Browser, name: string, phone = false) {
  const context = await browser.newContext(phone
    ? { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, reducedMotion: "reduce" }
    : { viewport: { width: 1440, height: 1000 } });
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

/** Types `text` in the code pane after the first `after`: with the keyboard, or on a phone (no hardware keys) as Monaco's
 * own typing command, the path its on-screen keyboard input takes. */
async function typeInCode(page: Page, after: string, text: string, phone = false) {
  const at = (await source(page)).indexOf(after) + after.length;
  await page.evaluate(async ({ at, text }) => {
    const { monaco } = await import("/src/components/monaco.ts");
    const editor = monaco.editor.getEditors().find(view => view.getModel()?.uri.path.endsWith("/index.html"))!;
    editor.focus();
    editor.setPosition(editor.getModel()!.getPositionAt(at));
    if (text) editor.trigger("keyboard", "type", { text });
  }, { at, text: phone ? text : "" });
  if (!phone) await page.keyboard.type(text);
}

/** An agent connected over MCP (from a third tab, as the fixture's own account, with live sharing off) joins the page's
 * room as the relay lets agents in (a bearer token, from Node), and says it works in Claude Code (as `name`) with its
 * caret where `follow`'s is; with `claim`, it says it is that person's author id. Agents' own text joins the copy in a
 * later slice (am-25). */
async function agentAt(browser: Browser, baseURL: string, follow: string, { name = "Claude Code", claim }: { name?: string; claim?: string } = {}) {
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
      const states = [...peers.values()].map(peer => peer.state as { name?: string; author?: number; caret?: JsonValue } | null);
      const theirs = states.find(state => state?.name === follow && state.caret), claimed = claim ? states.find(state => state?.name === claim)?.author : 7;
      if (!theirs || claimed === undefined || said) return;
      said = true;
      room.setPresence({ author: claimed, name, agent: "claude-code", caret: theirs.caret! });
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
    // Each one's caret in the other's code, unfolded and scrolled to (sections open folded; a caret in a fold is not shown).
    await reveal(lex.page, (await source(lex.page)).indexOf("Anna was here: ") + "Anna was here: ".length);
    await reveal(anna.page, (await source(anna.page)).indexOf(", by Lex,") + ", by Lex,".length);
    await expect(annaAtLex).toBeVisible({ timeout: 20_000 });
    await expect(annaAtLex).toHaveAccessibleName("Anna");
    await expect(lexAtAnna).toBeVisible({ timeout: 20_000 });
    await expect(lexAtAnna).toHaveAccessibleName("Lex");
    // Closed, the name is there for no one; its first letter shows only when the tag opens to the left.
    await expect(annaAtLex.locator(".live-caret__name")).toHaveText("Anna");
    await expect(annaAtLex.locator(".live-caret__initial")).toBeHidden();
    await expect(annaAtLex.locator(".live-caret__name")).toHaveCSS("opacity", "0");
    await annaAtLex.locator(".live-caret__mark").hover();
    await expect(annaAtLex.locator(".live-caret__name")).toHaveCSS("opacity", "1");
    // An agent in the room: its circle holds the icon of its program, its name on hover.
    agent = await agentAt(browser, baseURL!, "Lex");
    const agentAtLex = lex.page.locator('.live-caret__flag[data-agent][aria-label="Claude Code"]');
    await expect(agentAtLex).toBeVisible({ timeout: 20_000 });
    await expect(agentAtLex).toHaveAccessibleName("Claude Code");
    await expect(agentAtLex.locator("svg.live-caret__program")).toBeVisible();
    await agentAtLex.locator(".live-caret__mark").hover();
    await expect(agentAtLex.locator(".live-caret__name")).toHaveText("Claude Code");
    await expect(agentAtLex.locator(".live-caret__undo")).toBeHidden();

    // Lex scrolls his own line to the top of his pane; then an agent appears there for the first time, saying it is Anna
    // (her author id), and nothing else happens. Its circle is inside the pane, its tag below the caret; and as two say
    // they are Anna's author, her tag offers no Undo until the other leaves.
    await lex.page.evaluate(async () => {
      const { monaco } = await import("/src/components/monaco.ts");
      const editor = monaco.editor.getEditors().find(view => view.getModel()?.uri.path.endsWith("/index.html"))!;
      const model = editor.getModel()!, line = model.getPositionAt(model.getValue().indexOf(", by Lex,")).lineNumber;
      await editor.getAction("editor.unfoldAll")?.run();
      editor.setScrollTop(editor.getTopForLineNumber(line));
    });
    const impostor = await agentAt(browser, baseURL!, "Lex", { name: "Impostor", claim: "Anna" });
    try {
      const impostorAtLex = lex.page.locator('.live-caret__flag[aria-label="Impostor"]');
      const pane = lex.page.locator(".code-editor .monaco-editor").first();
      await expect.poll(async () => {
        const box = await pane.boundingBox(), mark = await impostorAtLex.locator(".live-caret__mark").boundingBox();
        return Boolean(box && mark && mark.y >= box.y && mark.y + mark.height <= box.y + box.height);
      }, { timeout: 20_000 }).toBe(true);
      await expect(impostorAtLex.locator("xpath=..")).toHaveAttribute("data-below", "");
      await expect(annaAtLex.locator(".live-caret__undo")).toHaveAttribute("hidden", "");
    } finally {
      impostor.room.close();
      await impostor.context.close();
    }
    await expect(lex.page.locator('.live-caret__flag[aria-label="Impostor"]')).toHaveCount(0, { timeout: 45_000 });
    await expect(annaAtLex.locator(".live-caret__undo")).not.toHaveAttribute("hidden");

    // Anna's tag ends with an undo while her change can be taken back: it takes back her words in both tabs, Lex's stay.
    await reveal(lex.page, (await source(lex.page)).indexOf("Anna was here: ") + "Anna was here: ".length);
    await annaAtLex.locator(".live-caret__mark").hover();
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

    // Her selection shows at Lex's as a tint over the same words, and goes when she collapses it.
    const word = "native browser";
    await anna.page.evaluate(async (word) => {
      const { monaco } = await import("/src/components/monaco.ts");
      const editor = monaco.editor.getEditors().find(view => view.getModel()?.uri.path.endsWith("/index.html"))!;
      const model = editor.getModel()!, start = model.getValue().indexOf(word);
      editor.setSelection(monaco.Range.fromPositions(model.getPositionAt(start), model.getPositionAt(start + word.length)));
    }, word);
    const tints = () => lex.page.evaluate(async () => {
      const { monaco } = await import("/src/components/monaco.ts");
      const model = monaco.editor.getEditors().find(view => view.getModel()?.uri.path.endsWith("/index.html"))!.getModel()!;
      return model.getAllDecorations().filter(item => item.options.className?.includes("live-caret-tint"))
        .map(item => model.getValueInRange(item.range));
    });
    await expect.poll(tints, { timeout: 20_000 }).toEqual([word]);
    await expect(lex.page.locator(".live-caret-tint").first()).toBeVisible();
    await anna.page.evaluate(async () => {
      const { monaco } = await import("/src/components/monaco.ts");
      const editor = monaco.editor.getEditors().find(view => view.getModel()?.uri.path.endsWith("/index.html"))!;
      editor.setPosition(editor.getSelection()!.getEndPosition());
    });
    await expect.poll(tints).toEqual([]);

    // Her caret on the top line Lex's pane shows (scrolled there, not the file's first line): its circle is in the pane.
    await lex.page.evaluate(async (word) => {
      const { monaco } = await import("/src/components/monaco.ts");
      const editor = monaco.editor.getEditors().find(view => view.getModel()?.uri.path.endsWith("/index.html"))!;
      const model = editor.getModel()!, line = model.getPositionAt(model.getValue().indexOf(word)).lineNumber;
      await editor.getAction("editor.unfoldAll")?.run();
      editor.setScrollTop(editor.getTopForLineNumber(line));
    }, word);
    const editorOf = annaAtLex.locator("xpath=ancestor::div[contains(concat(' ', @class, ' '), ' monaco-editor ')][1]");
    await expect.poll(async () => {
      const pane = await editorOf.boundingBox(), mark = await annaAtLex.locator(".live-caret__mark").boundingBox();
      return Boolean(pane && mark && mark.y >= pane.y && mark.y + mark.height <= pane.y + pane.height);
    }, { timeout: 20_000 }).toBe(true);
    await expect(annaAtLex.locator("xpath=..")).toHaveAttribute("data-below", "");

    // Anna leaves: her caret fades out and goes.
    await anna.context.close();
    await expect(annaAtLex).toHaveCount(0, { timeout: 45_000 });
  } finally {
    agent?.room.close();
    await agent?.context.close();
    await lex.context.close();
    await anna.context.close();
  }
});

/** Shows `offset`'s place in the pane's code: unfolded (the head and sections open folded) and scrolled to. */
const reveal = (page: Page, offset: number) => page.evaluate(async (offset) => {
  const { monaco } = await import("/src/components/monaco.ts");
  const editor = monaco.editor.getEditors().find(view => view.getModel()?.uri.path.endsWith("/index.html"))!;
  await editor.getAction("editor.unfoldAll")?.run();
  editor.revealPosition(editor.getModel()!.getPositionAt(offset));
}, offset);

test("on a phone the tag opens on a tap with 44 px targets inside the pane, even for a long name by the pane's edge; by keyboard it opens and takes back with focus kept", async ({ browser, baseURL }) => {
  const longName = `Annabel ${"Featherstonehaugh-".repeat(4)}`.slice(0, 80);
  const lex = await person(browser, "Lex", true), anna = await person(browser, longName);
  try {
    await openEditor(anna.page, baseURL);
    await openEditor(lex.page, baseURL);
    await editorMounted(anna.page);
    await editorMounted(lex.page);
    // Lex types, and his page shows his words; then Anna types at the end of a line, by the right edge of his narrow pane.
    await typeInCode(lex.page, "Edit plain HTML", ", by Lex,", true);
    await expect.poll(() => source(anna.page), { timeout: 20_000 }).toContain("Edit plain HTML, by Lex,");
    await expect(lex.page.frameLocator(".native-preview-frame").locator("p.lead")).toContainText("Edit plain HTML, by Lex,");
    // Deliberate fixed wait: his typing settles TYPING_SETTLE_MS after the last key (src/components/code-editor.ts), and
    // then the page selects what he typed and his code scrolls back to it. Nothing on screen marks that moment, and the
    // scroll would undo showing Anna's caret below, so the spec lets it pass first.
    const settle = await lex.page.evaluate(async () => (await import("/src/components/code-editor.ts")).TYPING_SETTLE_MS);
    await lex.page.waitForTimeout(settle + 300);
    await typeInCode(anna.page, "<head>", "<!--A-->");
    await expect.poll(() => source(lex.page), { timeout: 20_000 }).toContain("<head><!--A-->");

    // At Lex's (390 px, touch, reduced motion): the code is in the bottom sheet; her caret at the right edge of his pane.
    await lex.page.getByRole("button", { name: "Page structure and code" }).tap();
    await expect(lex.page.locator(".code-editor .monaco-editor").first()).toBeVisible();
    const annaAtLex = lex.page.locator(".live-caret__flag", { has: lex.page.locator("b", { hasText: "A" }) });
    const editorBox = () => annaAtLex.locator("xpath=ancestor::div[contains(concat(' ', @class, ' '), ' monaco-editor ')][1]").boundingBox();
    // The sheet's editor lays out after it opens: her place is shown once it has.
    await expect.poll(async () => {
      await reveal(lex.page, (await source(lex.page)).indexOf("<!--A-->") + "<!--A-->".length);
      const pane = await editorBox(), mark = await annaAtLex.locator(".live-caret__mark").boundingBox();
      return Boolean(pane && mark && mark.x >= pane.x && mark.x + mark.width <= pane.x + pane.width);
    }, { timeout: 20_000 }).toBe(true);
    // An agent at the same place (its tag never has an undo) opens to the side with room: its tag stays in the pane with
    // more than a letter of its name; when it leaves, its caret goes.
    const agent = await agentAt(browser, baseURL!, longName);
    try {
      const agentAtLex = lex.page.locator('.live-caret__flag[aria-label="Claude Code"]');
      await expect(agentAtLex).toBeVisible({ timeout: 20_000 });
      const mark = (await agentAtLex.locator(".live-caret__mark").boundingBox())!;
      await lex.page.touchscreen.tap(mark.x + mark.width / 2, mark.y + mark.height / 2);
      await expect(agentAtLex).toBeFocused();
      await expect.poll(async () => {
        const pane = await editorBox(), box = await agentAtLex.boundingBox();
        return Boolean(pane && box && box.x >= pane.x && box.x + box.width <= pane.x + pane.width);
      }).toBe(true);
      expect(await agentAtLex.locator(".live-caret__name").evaluate(name => name.clientWidth)).toBeGreaterThan(10);
    } finally {
      agent.room.close();
      await agent.context.close();
    }
    await expect(lex.page.locator('.live-caret__flag[aria-label="Claude Code"]')).toHaveCount(0, { timeout: 45_000 });
    // Reduced motion: the tag's reveal does not move.
    expect(await annaAtLex.evaluate(flag => getComputedStyle(flag, "::before").transitionProperty)).not.toContain("clip-path");
    // A tap on her circle opens the tag and keeps focus there (the code does not take it back).
    await annaAtLex.locator(".live-caret__mark").tap();
    await expect(annaAtLex).toBeFocused();
    await expect(annaAtLex.locator(".live-caret__name")).toHaveCSS("opacity", "1");
    const undo = annaAtLex.getByRole("button", { name: `Undo ${longName}'s change` });
    await expect(undo).toBeVisible();
    // The undo stays inside the pane (the tag places itself once its undo shows), and presses 44 px around it reach it.
    await expect.poll(async () => {
      const pane = await editorBox(), box = await undo.boundingBox();
      return Boolean(pane && box && box.x >= pane.x && box.x + box.width <= pane.x + pane.width);
    }).toBe(true);
    const reached = await undo.evaluate(button => {
      const rect = button.getBoundingClientRect(), x = rect.x + rect.width / 2, y = rect.y + rect.height / 2;
      return [[-21, 0], [21, 0], [0, -21], [0, 21]].map(([dx, dy]) => document.elementFromPoint(x + dx, y + dy)?.closest(".live-caret__undo") === button);
    });
    expect(reached).toEqual([true, true, true, true]);
    // A real tap where it shows (Playwright's own tap would scroll the code to "bring it into view", moving it).
    const box = (await undo.boundingBox())!;
    await lex.page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
    for (const tab of [lex, anna]) {
      await expect.poll(() => source(tab.page), { timeout: 20_000 }).not.toContain("<!--A-->");
      expect(await source(tab.page)).toContain("Edit plain HTML, by Lex,");
    }

    // At Anna's, by keyboard: Ctrl+M lets Tab leave the code, Tab reaches Lex's tag, which opens; Enter on its undo takes
    // back his changes, latest first, and focus stays on his tag.
    const lexAtAnna = anna.page.locator(".live-caret__flag", { has: anna.page.locator("b", { hasText: "L" }) });
    await reveal(anna.page, (await source(anna.page)).indexOf(", by Lex,") + ", by Lex,".length);
    await expect(lexAtAnna).toBeVisible({ timeout: 20_000 });
    await anna.page.getByRole("textbox", { name: "File source" }).first().focus();
    await anna.page.keyboard.press("Control+m");
    await anna.page.keyboard.press("Tab");
    await expect(lexAtAnna).toBeFocused();
    await expect(lexAtAnna.locator(".live-caret__name")).toHaveCSS("opacity", "1");
    expect(await lexAtAnna.evaluate(flag => getComputedStyle(flag).outlineStyle)).not.toBe("none");
    await anna.page.keyboard.press("Tab");
    await expect(lexAtAnna.getByRole("button", { name: "Undo Lex's change" })).toBeFocused();
    // His latest change was taking hers back: Enter puts her words back; again, it takes back his typing.
    await anna.page.keyboard.press("Enter");
    for (const tab of [lex, anna]) await expect.poll(() => source(tab.page), { timeout: 20_000 }).toContain("<head><!--A-->");
    await anna.page.keyboard.press("Enter");
    for (const tab of [lex, anna]) await expect.poll(() => source(tab.page), { timeout: 20_000 }).not.toContain(", by Lex,");
    // Nothing more of his to take back: the undo goes and focus stays on his tag.
    await expect(lexAtAnna.getByRole("button")).toBeHidden();
    await expect(lexAtAnna).toBeFocused();
  } finally {
    await lex.context.close();
    await anna.context.close();
  }
});

