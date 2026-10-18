import { expect, type Page } from "@playwright/test";

/**
 * Chooses Connect with MCP (the project menu is open) and returns the prompt it copies, with
 * the server address and token in it. The browser contexts of one Playwright worker share the
 * clipboard, so the prompt an earlier test copied can still be there while this tab makes its
 * token: wait for the prompt holding the token this click made (the `/api/agent/connect`
 * answer), never just any prompt.
 */
export async function copyConnectionPrompt(page: Page) {
  // The legacy fixture cannot upgrade relay sockets; simulate a deployment without the relay route.
  await page.routeWebSocket("**/api/agent/relay?*", socket => socket.close());
  await page.route("**/api/agent/relay", route => route.fulfill({ status: 404, body: "Not found" }));
  const made = page.waitForResponse((response) =>
    new URL(response.url()).pathname === "/api/agent/connect" && response.request().method() === "POST");
  await page.getByRole("button", { name: "Connect with MCP", exact: true }).click();
  const answer = await made;
  expect(answer.ok()).toBe(true);
  const { token } = (await answer.json()) as { token: string };
  expect(token).toMatch(/^ase_[a-f0-9]{64}$/);
  await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toContain(`Authorization: \`Bearer ${token}\``);
  const prompt = await page.evaluate(() => navigator.clipboard.readText());
  return { prompt, url: /Server: `(\S+)`/.exec(prompt)![1], token };
}
