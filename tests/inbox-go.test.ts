// Going to an Inbox row's spot (src/inbox/inbox-go.ts): its page opens, then Page settings, Edit component mode or a
// selection follow there, only while the session the row was pressed on holds.
import test from "node:test";
import assert from "node:assert/strict";
import { goTo, type GoPorts } from "../src/inbox/inbox-go.ts";
import type { InboxItem } from "../src/inbox/inbox-item.ts";
import { forEachAwait, type AwaitRace } from "./support/await-race";

const files: Readonly<Record<string, string>> = {
  "index.html": "<!doctype html><html><head><title></title></head><body><site-header></site-header></body></html>",
  "components/site-header/site-header.html": "<header><site-logo></site-logo></header>",
  "components/site-logo/site-logo.html": `<img src="/images/logo.svg">`,
};
const components = { "site-header": "components/site-header/site-header.html", "site-logo": "components/site-logo/site-logo.html" };
const title: InboxItem = { key: "title\nindex.html", kind: "title", what: "Page without a title", where: "Home page", page: "index.html" };
const logo: InboxItem = { key: "picture\ncomponents/site-logo/site-logo.html\nimages/logo.svg", kind: "picture", what: "Picture without a description",
  where: "Site logo", page: "components/site-logo/site-logo.html", at: 0, fix: "alt", shared: { tag: "site-logo", name: "Site logo", pages: ["index.html"] } };
// The browser's parser stands in: every tag is found, at a path named by its offset.
const pathAt = (_source: string, at: number) => [at];

/** The editor as going to a spot sees it, with what it did while the session held (`acts`) and after (`stale`). */
function editor(race?: AwaitRace) {
  const state = { live: true, acts: [] as string[], stale: [] as string[] };
  let opened: string | undefined;
  const act = (what: string) => { (state.live ? state.acts : state.stale).push(what); };
  const wrap = <Args extends unknown[], Value>(name: string, work: (...args: Args) => Promise<Value>) => race ? race.port(name, work) : work;
  const ports = {
    appStore: { openFile: { get value() { return opened; } } },
    site: () => ({ components }),
    source: (file: string) => files[file],
    showing: () => undefined,
    route: (file: string) => `/${file}`,
    stamp: () => ({ holds: () => state.live }),
    open: wrap("open", async (page: string) => { act(`open ${page}`); opened = page; }),
    pageDetails: (page: string) => act(`details ${page}`),
    editComponent: wrap("editComponent", async (tag: string, instance: { path: string; node: number[] } | undefined, notes: readonly string[]) => {
      act(`mode ${tag} ${instance?.path ?? "code"}${notes.length ? `: ${notes.join(" ")}` : ""}`);
      return "mode" as const;
    }),
    select: (request: { path: string; node: number[] }, later: boolean) => act(`select ${request.path} ${request.node.join(".")}${later ? " later" : ""}`),
  } satisfies GoPorts;
  return { state, ports };
}

test("a page's title opens Page settings on that page; a shared part opens Edit component mode through the parts it sits in", async () => {
  const page = editor();
  await goTo(title, page.ports, pathAt);
  assert.deepEqual(page.state.acts, ["open index.html", "details index.html"]);
  const part = editor();
  await goTo(logo, part.ports, pathAt);
  assert.deepEqual(part.state.acts, [
    "open index.html",
    "mode site-header index.html: Site logo, inside Site header, is a shared part. A change here shows on the one page that uses it.",
    "mode site-logo components/site-header/site-header.html",
    "select components/site-logo/site-logo.html 0",
  ]);
});

test("going to a row's spot acts only on the session it was pressed on (await race)", async () => {
  for (const [item, count] of [[title, 1], [logo, 3]] as const) {
    const awaits = await forEachAwait(race => {
      const { state, ports } = editor(race);
      return { state, done: goTo(item, ports, pathAt) };
    }, run => { run.state.live = false; }, run => {
      // Another site, branch or load opened meanwhile: nothing more is done on the editor.
      assert.deepEqual(run.state.stale, []);
    });
    assert.equal(awaits, count, item.kind);
  }
});
