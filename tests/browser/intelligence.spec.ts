import { test, expect } from "@playwright/test";

for (const alias of [false, true]) {
  test(`Astro project diagnoses and completes ${alias ? "aliased" : "relative"} imported props and refreshes after a draft changes`, async ({
    page,
  }) => {
    const source = {
      ["a".repeat(40)]:
        "---\ninterface Props { title: string; count?: number }\nconst {title} = Astro.props;\n---\n<h1>{title}</h1>",
      ["b".repeat(40)]:
        '---\nimport Card from "./Card.astro";\nconst count = 42;\n---\n<Card title={count} />',
    };
    const entries = [
      {
        path: "Card.astro",
        sha: "a".repeat(40),
        type: "blob",
        mode: "100644",
        size: 100,
      },
      {
        path: "index.astro",
        sha: "b".repeat(40),
        type: "blob",
        mode: "100644",
        size: 100,
      },
    ];
    if (alias) {
      source["b".repeat(40)] = source["b".repeat(40)].replace(
        "./Card.astro",
        "@components/Card.astro",
      );
      source["d".repeat(40)] = JSON.stringify({
        extends: "astro/tsconfigs/strict",
        compilerOptions: { baseUrl: ".", paths: { "@components/*": ["./*"] } },
      });
      entries.push({
        path: "tsconfig.json",
        sha: "d".repeat(40),
        type: "blob",
        mode: "100644",
        size: 100,
      });
    }
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.route("**/api/**", (route) => {
      const url = new URL(route.request().url());
      const responses: Record<string, unknown> = {
        "/api/session": {
          configured: true,
          user: { login: "lex" },
          installUrl: null,
        },
        "/api/repositories": [
          {
            id: 1,
            name: "starter",
            full_name: "lex/starter",
            private: true,
            default_branch: "main",
            owner: { login: "lex", type: "User" },
          },
        ],
        "/api/branches": ["main"],
        "/api/snapshot": {
          branch: "main",
          commit: "c".repeat(40),
          entries,
          detection: { status: "detected", message: "Astro" },
        },
        "/api/file": { content: source[url.searchParams.get("sha") ?? ""] },
      };
      return route.fulfill({ json: responses[url.pathname] });
    });
    await page.goto("/");
    await page.locator(".repository-menu__trigger").click();
    await page.getByLabel("Repository", { exact: true }).selectOption("1");
    await page
      .getByRole("button", { name: "index.astro", exact: true })
      .click();
    await expect(page.locator(".squiggly-error").first()).toBeVisible({
      timeout: 15000,
    });
    await page.locator(".squiggly-error").first().hover({ force: true });
    await expect(page.locator(".monaco-hover:visible").first()).toContainText(
      "not assignable",
      { timeout: 10000 },
    );
    const lines = page.locator(".monaco-editor .view-lines").first();
    await lines.click({ position: { x: 150, y: 10 } });
    await page.keyboard.press("Control+Home");
    for (let i = 0; i < 4; i++) await page.keyboard.press("ArrowDown");
    await page.keyboard.press("Home");
    for (let i = 0; i < 6; i++) await page.keyboard.press("ArrowRight");
    await page.keyboard.press("Control+Space");
    await expect(page.locator(".suggest-widget.visible")).toContainText(
      "count",
      {
        timeout: 15000,
      },
    );
    await page.keyboard.press("Escape");
    await page.locator("#explorer-toggle").click();
    await page.getByRole("button", { name: "Card.astro", exact: true }).click();
    await lines.click({ position: { x: 150, y: 10 } });
    await page.keyboard.press("Control+a");
    await page.keyboard.insertText(
      source["a".repeat(40)].replace("title: string", "title: number"),
    );
    await page.locator("#explorer-toggle").click();
    await page
      .getByRole("button", { name: "index.astro", exact: true })
      .click();
    await page
      .locator(".view-lines")
      .getByText("title", { exact: true })
      .hover();
    await expect(page.locator(".monaco-hover:visible").first()).toContainText(
      "Props.title: number",
      { timeout: 15000 },
    );
    await expect(page.locator(".squiggly-error")).toHaveCount(0, {
      timeout: 15000,
    });
    await page.screenshot({
      path: "test-results/astro-project-intelligence.png",
    });
    expect(errors).toEqual([]);
  });
}
