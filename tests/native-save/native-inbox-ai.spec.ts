// Fix with AI and Fix all with AI in the Inbox (TOOLS-253), with a real MCP client as the connected agent: it takes
// the Inbox's requests with wait_for_requests and answers with reply_to_request. Nothing changes until Accept; the
// suggestion can be edited first; Accept all says how many pages it changes; a suggestion that fails says so on its
// row's button. Seeded per browser session: the shared header has a picture without a description (on Home and
// About), and Home a "click here" link and a link with no name, beside the fixture's hero picture without alt text.
import { expect, test, type Page } from "@playwright/test";
import type { Client } from "@modelcontextprotocol/client";
import { connect } from "./agent-pins-support";
import { effectiveSource } from "./drafts";
import { waitForConnection } from "./mcp-prompt";

const inbox = (page: Page) => page.getByRole("dialog", { name: "Inbox", exact: true });
const inboxButton = (page: Page) => page.getByRole("banner").getByRole("button", { name: "Inbox", exact: true });
const row = (page: Page, what: string) => inbox(page).getByRole("listitem").filter({ has: page.getByRole("button", { name: what, exact: true }) });

const source = async (page: Page, baseURL: string | undefined, path: string) => await effectiveSource(page, baseURL, path) ?? "";

async function seed(page: Page, baseURL: string | undefined) {
  await page.goto(`${baseURL}/`);
  const commit = async (path: string, content: string) => expect((await page.request.post(`${baseURL}/__demo/external-edit`, { data: { path, content } })).status()).toBe(204);
  const read = async (path: string) => (await page.request.get(`${baseURL}/__demo/file?path=${path}`)).text();
  await commit("components/site-header/site-header.html", (await read("components/site-header/site-header.html"))
    .replace(`<a class="brand"`, `<img class="logo" src="/images/placeholder.svg" width="24" height="24" data-key="logo"><a class="brand"`));
  await commit("index.html", (await read("index.html")).replace(`<h2 data-key="filler-title">Scroll to verify</h2>`,
    `<h2 data-key="filler-title">Scroll to verify</h2>\n    <p data-key="more">See <a href="/about/" data-key="vague">click here</a> or <a href="/about/" data-key="arrow"><svg width="12" height="12"><path d="M2 6h8"/></svg></a>.</p>`));
}

async function agent(page: Page, baseURL: string | undefined) {
  const client = await connect(page, baseURL);
  const call = async (name: string, args: Record<string, unknown>) => {
    const response = await client.callTool({ name, arguments: args });
    expect(response.isError, JSON.stringify(response)).toBeFalsy();
    return JSON.parse((response.content as { text: string }[])[0].text);
  };
  await expect.poll(async () => (await call("get_site", { agent: "Describer" })).available ?? true, { timeout: 15_000 }).toBe(true);
  await waitForConnection(page);
  return { client, call };
}

test.describe("Fix with AI", () => {
  test.use({ viewport: { width: 1280, height: 900 } });
  let client: Client | undefined;
  test.afterEach(async () => { await client?.close(); client = undefined; });

  test("one row: Thinking…, the agent's suggestion to change, Accept writes it, and the request is let go", async ({ page, baseURL }) => {
    await seed(page, baseURL);
    const connected = await agent(page, baseURL);
    client = connected.client;
    await inboxButton(page).click();
    const hero = row(page, "Picture without a description, Home page");
    await hero.getByRole("button", { name: /^Fix with AI: / }).click();
    await expect(hero.getByRole("button", { name: /^Thinking…/ })).toHaveAttribute("aria-busy", "true");
    if (process.env.ASE_INBOX_SHOTS) await inbox(page).screenshot({ path: `${process.env.ASE_INBOX_SHOTS}/inbox-thinking.png` });
    const [request] = (await connected.call("wait_for_requests", { waitSeconds: 10, agent: "Describer" })).requests;
    expect(request.text).toMatch(/^Suggest alt text for this picture/);
    expect(request.text).toContain("Change nothing on the site.");
    expect(request.element.tag).toBe("img");
    await connected.call("reply_to_request", { request: request.id, status: "answered", message: "“A desk with a laptop”", agent: "Describer" });
    const field = hero.getByRole("textbox", { name: /^Description, suggested by AI/ });
    await expect(field).toHaveValue("A desk with a laptop");
    // Answered: its request is let go, so no pin stays on the page.
    await expect(page.locator(".agent-pin")).toHaveCount(0);
    // Nothing is written before Accept.
    expect(await source(page, baseURL, "index.html")).not.toContain("A desk with a laptop");
    await field.fill("A tidy desk with a laptop");
    await hero.getByRole("button", { name: "Accept", exact: true }).click();
    await expect.poll(() => source(page, baseURL, "index.html")).toMatch(/<img class="hero-image" src="\/images\/placeholder\.svg" data-key="hero-image" alt="A tidy desk with a laptop">/);
    // The row goes by itself once the check finds it fixed.
    await expect(inbox(page).getByRole("button", { name: "Picture without a description, Home page", exact: true })).toHaveCount(0);
  });

  test("Fix all with AI asks for every row at once; Accept all says the pages it changes and writes them; a failed one says so", async ({ page, baseURL }) => {
    await seed(page, baseURL);
    const connected = await agent(page, baseURL);
    client = connected.client;
    await inboxButton(page).click();
    await inbox(page).getByRole("button", { name: "Fix all with AI", exact: true }).click();
    await expect(inbox(page).getByRole("button", { name: "Thinking…", exact: true })).toBeVisible();
    const requests: { id: string; text: string; element: { file: string } }[] = (await connected.call("wait_for_requests", { waitSeconds: 10, agent: "Describer" })).requests;
    // The hero, the header's picture and the two links: four requests, one per row.
    expect(requests).toHaveLength(4);
    const about = (pattern: RegExp, file = "index.html") => requests.find(request => pattern.test(request.text) && request.element.file === file)!;
    const logo = about(/alt text/, "components/site-header/site-header.html");
    expect(logo.text).toContain("shared part Site header, shown on 2 pages");
    const reply = (request: { id: string }, message: string, status = "answered") =>
      connected.call("reply_to_request", { request: request.id, status, message, agent: "Describer" });
    await reply(logo, "Native Studio logo");
    await reply(about(/alt text/), "A desk with a laptop");
    await reply(about(/only says “click here”/), "Read about the studio");
    // The agent asks back instead: that row's suggestion fails and its pin stays for the question.
    await reply(about(/no name/), "Which page does it go to?", "question");
    const logoRow = row(page, "Picture without a description, Site header · changes 2 pages");
    await expect(logoRow.getByRole("textbox", { name: /^Description, suggested by AI/ })).toHaveValue("Native Studio logo");
    await expect(logoRow.getByRole("button", { name: "Accept on 2 pages", exact: true })).toBeVisible();
    await expect(row(page, "Link without a name, Home page").getByRole("button", { name: /^No suggestion · Try again/ })).toBeVisible();
    // Any suggestion can be changed before Accept all.
    await row(page, "Link that only says “click here”, Home page").getByRole("textbox").fill("See who we are");
    const all = inbox(page).getByRole("button", { name: "Accept all on 2 pages", exact: true });
    await expect(all).toBeVisible();
    // ASE_INBOX_SHOTS=<dir> saves the panel with its suggestions, light and dark, for the PR beside the prototype.
    if (process.env.ASE_INBOX_SHOTS) for (const scheme of ["light", "dark"] as const) {
      await page.emulateMedia({ colorScheme: scheme });
      await inbox(page).screenshot({ path: `${process.env.ASE_INBOX_SHOTS}/inbox-suggestions-${scheme}.png` });
    }
    expect(await source(page, baseURL, "index.html")).not.toContain("See who we are");
    await all.click();
    await expect.poll(() => source(page, baseURL, "index.html")).toContain(`<a href="/about/" data-key="vague">See who we are</a>`);
    expect(await source(page, baseURL, "index.html")).toContain(`data-key="hero-image" alt="A desk with a laptop">`);
    await expect.poll(() => source(page, baseURL, "components/site-header/site-header.html")).toContain(`data-key="logo" alt="Native Studio logo">`);
    // Left: the row whose suggestion failed, ready to be asked again.
    await expect(inbox(page).getByRole("button", { name: "Link that only says “click here”, Home page", exact: true })).toHaveCount(0);
    await expect(row(page, "Link without a name, Home page")).toBeVisible();
    // Accept all is one Undo step: one Undo puts every page and the header back, and their rows wait again, ready.
    await page.getByRole("banner").getByRole("button", { name: "Undo", exact: true }).click();
    await expect.poll(() => source(page, baseURL, "index.html")).toContain(`<a href="/about/" data-key="vague">click here</a>`);
    expect(await source(page, baseURL, "index.html")).not.toContain("A desk with a laptop");
    await expect.poll(() => source(page, baseURL, "components/site-header/site-header.html")).not.toContain("Native Studio logo");
    await inboxButton(page).click();
    await expect(row(page, "Picture without a description, Site header · changes 2 pages").getByRole("button", { name: /^Fix with AI: / })).toBeVisible();
    await expect(inbox(page).getByRole("button", { name: "Fix all with AI", exact: true })).toBeVisible();
  });
});
