import assert from "node:assert/strict";
import test from "node:test";
import { PLANS_WAIT_MS, isPlan, loadPlans, parsePlans } from "../src/catalogue/plans.ts";

// The planning mock-ups on the catalogue board (TOOLS-218): /mockups/board.json from the preview build, read into one
// area per map and one card per mock-up. Anything that is not as the build writes it is left out, so a board served
// without the list (the dev server answers with its own page) simply has no such areas.

const card = (file: string, extra: Record<string, unknown> = {}) => ({ file, title: `Title of ${file}`, label: "idea", labelName: "Idea only", tickets: "", href: `/mockups/atomic-catalogue/${file}`, ...extra });

test("each map becomes an area and each mock-up a card named by its title, with its label, tickets, link and picture", () => {
  const plans = parsePlans(JSON.stringify({ maps: [
    { map: "atomic-catalogue", mockups: [
      card("08-board.html", { label: "live", labelName: "Live", tickets: "tickets 05, 07", picture: "/mockups/atomic-catalogue/agreed/08-board.webp" }),
      card("55-menu.html"),
    ] },
    { map: "styling", mockups: [card("03-panel.html", { href: "/mockups/styling/03-panel.html", label: "building", labelName: "Being built" })] },
  ] }));
  assert.deepEqual(plans.areas, [{ id: "plan:atomic-catalogue", name: "atomic-catalogue" }, { id: "plan:styling", name: "styling" }]);
  assert.deepEqual(plans.mockups.map(({ id, area, name }) => ({ id, area, name })), [
    { id: "plan:atomic-catalogue/08-board.html", area: "plan:atomic-catalogue", name: "Title of 08-board.html" },
    { id: "plan:atomic-catalogue/55-menu.html", area: "plan:atomic-catalogue", name: "Title of 55-menu.html" },
    { id: "plan:styling/03-panel.html", area: "plan:styling", name: "Title of 03-panel.html" },
  ]);
  assert.deepEqual(plans.mockups[0], {
    id: "plan:atomic-catalogue/08-board.html", area: "plan:atomic-catalogue", name: "Title of 08-board.html",
    files: ["docs/wayfinder/atomic-catalogue/prototypes/08-board.html"], defaults: {}, controls: [],
    label: "live", labelName: "Live", tickets: "tickets 05, 07", href: "/mockups/atomic-catalogue/08-board.html", picture: "/mockups/atomic-catalogue/agreed/08-board.webp",
  });
  assert.equal("picture" in plans.mockups[1], false);
  assert.ok(plans.mockups.every(isPlan));
  assert.equal(isPlan({ area: "atoms" }), false);
});

test("an id holds no space or character an address would escape, so a card's name can be found by aria-labelledby", () => {
  const plans = parsePlans(JSON.stringify({ maps: [{ map: "my map", mockups: [card("a #1?.html", { href: "/mockups/my%20map/a%20%231%3F.html" })] }] }));
  assert.deepEqual(plans.areas, [{ id: "plan:my%20map", name: "my map" }]);
  assert.deepEqual(plans.mockups.map(({ id, area, files }) => ({ id, area, files })),
    [{ id: "plan:my%20map/a%20%231%3F.html", area: "plan:my%20map", files: ["docs/wayfinder/my map/prototypes/a #1?.html"] }]);
  assert.ok(plans.mockups.every(({ id }) => !/\s/.test(id)));
});

test("a text that is not the build's list gives no areas, and a card that is not as written is left out", () => {
  const none = { areas: [], mockups: [] };
  for (const text of ["", "<!doctype html><title>editor</title>", "null", "[]", "{}", '{"maps":{}}', '{"maps":[null,{"map":"","mockups":[]},{"map":"a"}]}']) assert.deepEqual(parsePlans(text), none, text);
  const plans = parsePlans(JSON.stringify({ maps: [
    { map: "a", mockups: [
      card("ok.html"), card("", {}), card("no-title.html", { title: "" }), card("wrong-label.html", { label: "shipped" }), card("no-words.html", { labelName: "" }),
      card("tickets.html", { tickets: 3 }), card("elsewhere.html", { href: "https://example.com/x.html" }), card("script.html", { href: "javascript:alert(1)" }),
      card("pic.html", { picture: "https://example.com/x.webp" }), null,
    ] },
    { map: "empty", mockups: [card("bad.html", { label: "x" })] },
    { map: "a", mockups: [card("again.html")] },
  ] }));
  assert.deepEqual(plans.areas, [{ id: "plan:a", name: "a" }]);
  assert.deepEqual(plans.mockups.map(({ name }) => name), ["Title of ok.html", "Title of pic.html"]);
  assert.equal("picture" in plans.mockups[1], false, "a picture from another site is not shown");
});

test("the list is read from /mockups/board.json, and a missing or broken one leaves the board without mock-up areas", async () => {
  const real = globalThis.fetch;
  const answer = (response: () => Response | Promise<Response>) => { globalThis.fetch = (async (input: Parameters<typeof fetch>[0]) => { assert.equal(String(input), "/mockups/board.json"); return response(); }) as typeof fetch; };
  try {
    answer(() => new Response(JSON.stringify({ maps: [{ map: "a", mockups: [card("x.html")] }] })));
    assert.deepEqual((await loadPlans()).areas, [{ id: "plan:a", name: "a" }]);
    answer(() => new Response("not here", { status: 404 }));
    assert.deepEqual(await loadPlans(), { areas: [], mockups: [] });
    answer(() => new Response("<!doctype html><title>editor</title>"));
    assert.deepEqual(await loadPlans(), { areas: [], mockups: [] });
    answer(() => { throw new TypeError("offline"); });
    assert.deepEqual(await loadPlans(), { areas: [], mockups: [] });
  } finally {
    globalThis.fetch = real;
  }
});

test("a list that never answers is given up on after a few seconds, so the board still opens", async () => {
  const real = globalThis.fetch;
  let signal: AbortSignal | null | undefined;
  // Like the browser's fetch: it settles only when its signal aborts.
  globalThis.fetch = ((_input: unknown, init?: RequestInit) => new Promise((_resolve, reject) => {
    signal = init?.signal;
    signal?.addEventListener("abort", () => reject(signal!.reason));
  })) as typeof fetch;
  try {
    const started = Date.now();
    assert.deepEqual(await loadPlans(), { areas: [], mockups: [] });
    assert.ok(signal, "the request carries a time limit");
    assert.ok(Date.now() - started >= PLANS_WAIT_MS - 100 && Date.now() - started < PLANS_WAIT_MS + 2000);
  } finally {
    globalThis.fetch = real;
  }
});
