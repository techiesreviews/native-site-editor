import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";
import { expect, type Page } from "@playwright/test";
import { openEditor } from "../support/scenarios";
import { editorMounted } from "./drafts";

// The agent pins specs' shared steps (native-agent-pins.spec.ts, native-agent-pins-actual.spec.ts, tickets am-13, am-45):
// connect an MCP client through Connect to MCP, and read a theme token as the editor computes it.
export async function connect(page: Page, baseURL: string | undefined) {
  const messages: string[] = [];
  page.on("websocket", socket => {
    if (socket.url().includes("/api/agent/relay?")) socket.on("framereceived", ({ payload }) => messages.push(String(payload)));
  });
  await openEditor(page, baseURL);
  await editorMounted(page);
  // On a phone the Page structure sits folded in its sheet.
  if (page.viewportSize()!.width > 600) await expect(page.getByRole("tree", { name: "Page structure" }).locator("[data-node]").first()).toBeVisible();
  await page.locator(".repository-menu__trigger").click();
  const made = page.waitForResponse(response => new URL(response.url()).pathname === "/api/agent/connect" && response.request().method() === "POST");
  await page.getByRole("button", { name: "Connect to MCP", exact: true }).click();
  const { token } = await (await made).json() as { token: string };
  await expect.poll(() => messages.some(message => message.includes('"type":"ready"'))).toBe(true);
  await page.keyboard.press("Escape");
  const client = new Client({ name: "agent-pins-spec", version: "1" });
  await client.connect(new StreamableHTTPClientTransport(new URL(`${baseURL}/mcp`), { requestInit: { headers: { Authorization: `Bearer ${token}` } } }));
  return client;
}

// A theme token as the editor computes a colour set to it.
export const token = (page: Page, name: string) => page.evaluate(name => {
  const probe = document.createElement("span");
  probe.style.color = `var(--${name})`;
  document.body.append(probe);
  const colour = getComputedStyle(probe).color;
  probe.remove();
  return colour;
}, name);
