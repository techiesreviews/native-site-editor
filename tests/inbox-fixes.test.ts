// Fix with AI and Fix all with AI in the Inbox (TOOLS-253): the connected agent suggests, nothing changes until the
// user accepts (one by one, or Accept all), any suggestion can be edited first, and the words land as the page's own
// edits. A fake agent stands in for the connected one.
import test from "node:test";
import assert from "node:assert/strict";
import { createInboxFixes, fixEdits, type InboxAgent, type InboxFix } from "../src/inbox/inbox-fixes.ts";
import type { InboxItem } from "../src/inbox/inbox-item.ts";
import { forEachAwait } from "./support/await-race.ts";

const page = `<!doctype html><html><head><title>Home</title></head><body><img src="/images/team.jpg"><a href="/new/"><svg></svg></a><p><a href="/bikes/">click here</a></p><h2>A</h2><h4>Opening hours</h4><video src="/m/fit.mp4" controls></video></body></html>`;
const header = `<header><img src="/images/logo.svg"><a href="/">Home</a></header>`;
const at = (source: string, needle: string) => source.indexOf(needle);

const picture: InboxItem = { key: "picture\nindex.html\nimages/team.jpg", kind: "picture", what: "Picture without a description", where: "Home page", page: "index.html", at: at(page, "<img"), fix: "alt", found: page };
const unnamed: InboxItem = { key: "link\nindex.html\n/new/\n0", kind: "link", what: "Link without a name", where: "Home page", page: "index.html", at: at(page, `<a href="/new/">`), fix: "name", found: page };
const vague: InboxItem = { key: "link\nindex.html\n/bikes/\n0", kind: "link", what: "Link that only says “click here”", where: "Home page", page: "index.html", at: at(page, `<a href="/bikes/">`), fix: "words", words: "click here", found: page };
const heading: InboxItem = { key: "heading\nindex.html\nOpening hours\n0", kind: "heading", what: "Heading skips a level", where: "Home page", page: "index.html", at: at(page, "<h4>"), level: { from: 4, to: 3 }, found: page };
const video: InboxItem = { key: "video\nindex.html\n/m/fit.mp4\n0", kind: "video", what: "Video without subtitles", where: "Home page", page: "index.html", at: at(page, "<video"), wave: "No speech", found: page };
const logo: InboxItem = { key: "picture\ncomponents/site-header/site-header.html\nimages/logo.svg", kind: "picture", what: "Picture without a description", where: "Site header",
  page: "components/site-header/site-header.html", at: at(header, "<img"), fix: "alt", found: header,
  shared: { tag: "site-header", name: "Site header", pages: ["index.html", "about/index.html", "shop/index.html"] } };

/** A fake connected agent: it answers each item from `answers` when `release` is called (a missing answer fails). */
function fakeAgent(answers: Record<string, string | Error>, connected = true) {
  const asked: InboxItem[] = [];
  const waiting: (() => void)[] = [];
  const agent: InboxAgent = {
    connected: () => connected,
    suggest(item) {
      asked.push(item);
      return new Promise((resolve, reject) => waiting.push(() => {
        const answer = answers[item.key];
        if (answer instanceof Error || answer === undefined) reject(answer ?? new Error("No answer"));
        else resolve(answer);
      }));
    },
  };
  return { agent, asked, release: async () => { for (const go of waiting.splice(0)) go(); await new Promise(done => setTimeout(done)); } };
}

function setup(agent: InboxAgent | undefined) {
  const written: InboxFix[][] = [];
  let changes = 0;
  const errors: unknown[] = [];
  const fixes = createInboxFixes({
    agent: () => agent,
    write: async (list) => { written.push(list.map(fix => ({ ...fix }))); },
    changed: () => { changes++; },
  });
  return { fixes, written, errors, changes: () => changes };
}

test("Fix with AI asks the agent, shows Thinking, then the suggestion, and nothing is written until Accept", async () => {
  const fake = fakeAgent({ [picture.key]: "  “Three riders at the workshop door” \n" });
  const { fixes, written } = setup(fake.agent);
  const asking = fixes.suggest(picture);
  assert.equal(fixes.state(picture.key)?.status, "thinking");
  assert.deepEqual(fake.asked.map(item => item.key), [picture.key]);
  await fake.release();
  await asking;
  // The agent's words, one line, quotes and spaces trimmed.
  assert.deepEqual(fixes.state(picture.key), { status: "suggested", draft: "Three riders at the workshop door" });
  assert.equal(written.length, 0);
  assert.equal(await fixes.accept(picture), true);
  assert.deepEqual(written, [[{ item: picture, words: "Three riders at the workshop door" }]]);
  assert.equal(fixes.state(picture.key)?.status, "accepted");
});

test("the user edits the suggestion before accepting; empty or still vague words are refused on the row", async () => {
  const fake = fakeAgent({ [vague.key]: "See the bikes in stock" });
  const { fixes, written } = setup(fake.agent);
  const asking = fixes.suggest(vague);
  await fake.release();
  await asking;
  fixes.edit(vague.key, "read more");
  assert.equal(await fixes.accept(vague), false);
  assert.equal(fixes.state(vague.key)?.invalid, true);
  fixes.edit(vague.key, "   ");
  assert.equal(await fixes.accept(vague), false);
  fixes.edit(vague.key, "Bikes in stock now");
  assert.equal(fixes.state(vague.key)?.invalid, undefined);
  assert.equal(await fixes.accept(vague), true);
  assert.deepEqual(written, [[{ item: vague, words: "Bikes in stock now" }]]);
});

test("Not now puts the row back as it was; a failed suggestion says so on the button and can be asked again", async () => {
  const fake = fakeAgent({ [unnamed.key]: new Error("The agent did not answer.") });
  const { fixes, errors } = setup(fake.agent);
  const asking = fixes.suggest(unnamed);
  await fake.release();
  await asking;
  assert.equal(fixes.state(unnamed.key)?.status, "failed");
  // The failure stays on the row's button, never a toast.
  assert.deepEqual(errors, []);
  const again = fakeAgent({ [unnamed.key]: "See all new arrivals" });
  const second = setup(again.agent);
  const asked = second.fixes.suggest(unnamed);
  await again.release();
  await asked;
  second.fixes.dismiss(unnamed.key);
  assert.equal(second.fixes.state(unnamed.key), undefined);
});

test("with no agent connected nothing is asked and the button says so on itself", async () => {
  const fake = fakeAgent({}, false);
  const { fixes } = setup(fake.agent);
  assert.equal(fixes.connected(), false);
  await fixes.suggest(picture);
  assert.equal(fake.asked.length, 0);
  assert.equal(fixes.state(picture.key), undefined);
  assert.equal(setup(undefined).fixes.connected(), false);
});

test("a shared part's suggestion is accepted on every page that shows it, and says so", async () => {
  const fake = fakeAgent({ [logo.key]: "Fjord Cycles logo" });
  const { fixes, written } = setup(fake.agent);
  assert.equal(fixes.acceptLabel(logo), "Accept on 3 pages");
  assert.equal(fixes.acceptLabel(picture), "Accept");
  const asking = fixes.suggest(logo);
  await fake.release();
  await asking;
  assert.equal(await fixes.accept(logo), true);
  assert.deepEqual(written, [[{ item: logo, words: "Fjord Cycles logo" }]]);
});

test("Fix all with AI asks for every item it can fix at once; headings and videos are left to their own fixes", async () => {
  const fake = fakeAgent({ [picture.key]: "Three riders", [unnamed.key]: "See all new arrivals", [logo.key]: "Fjord Cycles logo" });
  const { fixes } = setup(fake.agent);
  const items = [picture, unnamed, vague, heading, video, logo];
  assert.deepEqual(fixes.all(items), { status: "ready", count: 4 });
  const asking = fixes.suggestAll(items);
  assert.deepEqual(fake.asked.map(item => item.key), [picture.key, unnamed.key, vague.key, logo.key]);
  assert.deepEqual(fixes.all(items), { status: "thinking", count: 4 });
  await fake.release();
  await asking;
  // One suggestion failed (no answer for the vague link): its row says so; the others wait for Accept.
  assert.equal(fixes.state(vague.key)?.status, "failed");
  // Pages in total: the home page and the header's three (the home page among them) are three pages.
  assert.deepEqual(fixes.all(items), { status: "suggested", count: 3, pages: 3 });
  assert.equal(fixes.acceptAllLabel(items), "Accept all on 3 pages");
});

test("Accept all writes every suggestion, edited ones as edited, as one change; a failed one is left waiting", async () => {
  const fake = fakeAgent({ [picture.key]: "Three riders", [unnamed.key]: "See all new arrivals", [logo.key]: "Fjord Cycles logo" });
  const { fixes, written } = setup(fake.agent);
  const items = [picture, unnamed, vague, logo];
  const asking = fixes.suggestAll(items);
  await fake.release();
  await asking;
  fixes.edit(unnamed.key, "All new bikes");
  assert.equal(await fixes.acceptAll(items), true);
  assert.deepEqual(written, [[
    { item: picture, words: "Three riders" },
    { item: unnamed, words: "All new bikes" },
    { item: logo, words: "Fjord Cycles logo" },
  ]]);
  assert.deepEqual([picture, unnamed, logo].map(item => fixes.state(item.key)?.status), ["accepted", "accepted", "accepted"]);
  assert.equal(fixes.state(vague.key)?.status, "failed");
  assert.deepEqual(fixes.all(items), { status: "accepted", count: 3 });
});

test("Accept all refuses while a row's words are empty, marking that row, and writes nothing", async () => {
  const fake = fakeAgent({ [picture.key]: "Three riders", [unnamed.key]: "See all new arrivals" });
  const { fixes, written } = setup(fake.agent);
  const items = [picture, unnamed];
  const asking = fixes.suggestAll(items);
  await fake.release();
  await asking;
  fixes.edit(picture.key, "");
  assert.equal(await fixes.acceptAll(items), false);
  assert.equal(fixes.state(picture.key)?.invalid, true);
  assert.equal(written.length, 0);
});

test("a refused write puts the rows back to their suggestions and says why on the row", async () => {
  const fake = fakeAgent({ [picture.key]: "Three riders" });
  const fixes = createInboxFixes({ agent: () => fake.agent, write: async () => { throw new Error("The page changed. Nothing was changed."); }, changed() {} });
  const asking = fixes.suggest(picture);
  await fake.release();
  await asking;
  assert.equal(await fixes.accept(picture), false);
  assert.deepEqual(fixes.state(picture.key), { status: "suggested", draft: "Three riders", refused: "The page changed. Nothing was changed." });
  // Changing the words clears it.
  fixes.edit(picture.key, "Three riders at the door");
  assert.equal(fixes.state(picture.key)?.refused, undefined);
});

test("rows that leave the list forget their suggestion; an answer for a row gone is dropped", async () => {
  const fake = fakeAgent({ [picture.key]: "Three riders" });
  const { fixes } = setup(fake.agent);
  const asking = fixes.suggest(picture);
  fixes.keep([]);
  await fake.release();
  await asking;
  assert.equal(fixes.state(picture.key), undefined);
});

test("the words land as the page's own markup: a description, a link's name, a link's words, a heading's level, No speech", () => {
  const apply = (source: string, edits: { start: number; end: number; text: string }[]) =>
    [...edits].sort((a, b) => b.start - a.start).reduce((text, edit) => text.slice(0, edit.start) + edit.text + text.slice(edit.end), source);
  const plan = (item: InboxItem, words: string, source = page) => {
    const result = fixEdits(item, words, source);
    assert.ok(!("refuse" in result), JSON.stringify(result));
    return apply(source, result);
  };
  assert.match(plan(picture, `Riders & "friends"`), /<img src="\/images\/team\.jpg" alt="Riders &amp; &quot;friends&quot;">/);
  assert.match(plan(unnamed, "See all new arrivals"), /<a href="\/new\/" aria-label="See all new arrivals"><svg><\/svg><\/a>/);
  assert.match(plan(vague, "Bikes <in> stock"), /<a href="\/bikes\/">Bikes &lt;in&gt; stock<\/a>/);
  assert.match(plan(heading, "3"), /<h3>Opening hours<\/h3>/);
  assert.match(plan(video, ""), /<video src="\/m\/fit\.mp4" controls data-no-speech=""><\/video>/);
  assert.match(plan(logo, "Fjord Cycles logo", header), /<img src="\/images\/logo\.svg" alt="Fjord Cycles logo">/);
  // The element is no longer where the row found it: nothing is planned.
  assert.ok("refuse" in fixEdits(picture, "x", page.replace("<img", "<p")));
});

test("a fix replaces an empty attribute in place, never adding a second one", () => {
  const source = `<p><img src="/x.svg" alt=""><a href="/" aria-label=""><svg></svg></a></p>`;
  const img: InboxItem = { ...picture, at: source.indexOf("<img"), found: source };
  const link: InboxItem = { ...unnamed, at: source.indexOf("<a"), found: source };
  const apply = (item: InboxItem, words: string) => {
    const edits = fixEdits(item, words, source);
    assert.ok(!("refuse" in edits));
    return [...edits].sort((a, b) => b.start - a.start).reduce((text, edit) => text.slice(0, edit.start) + edit.text + text.slice(edit.end), source);
  };
  assert.equal(apply(img, "A mark"), `<p><img src="/x.svg" alt="A mark"><a href="/" aria-label=""><svg></svg></a></p>`);
  assert.equal(apply(link, "Home"), `<p><img src="/x.svg" alt=""><a href="/" aria-label="Home"><svg></svg></a></p>`);
});

test("a link's name may not be vague words either", async () => {
  const fake = fakeAgent({ [unnamed.key]: "click here" });
  const { fixes, written } = setup(fake.agent);
  const asking = fixes.suggest(unnamed);
  await fake.release();
  await asking;
  assert.equal(await fixes.accept(unnamed), false);
  assert.equal(fixes.state(unnamed.key)?.invalid, true);
  assert.equal(written.length, 0);
});

test("an accepted row the next check still lists (its change undone) is ready for Fix with AI again", async () => {
  const fake = fakeAgent({ [picture.key]: "Three riders" });
  const { fixes } = setup(fake.agent);
  const asking = fixes.suggest(picture);
  await fake.release();
  await asking;
  await fixes.accept(picture);
  assert.equal(fixes.state(picture.key)?.status, "accepted");
  fixes.keep([picture]);
  assert.equal(fixes.state(picture.key), undefined);
});

test("an agent that goes away while Thinking leaves the row failed, never stuck", async () => {
  let connected = true;
  const agent: InboxAgent = { connected: () => connected, suggest: () => { connected = false; return Promise.reject(new Error("No agent is connected.")); } };
  const { fixes } = setup(agent);
  await fixes.suggest(picture);
  assert.equal(fixes.state(picture.key)?.status, "failed");
});

test("a suggestion stays with its element: one like it put before it takes its key but not its suggestion", async () => {
  const fake = fakeAgent({ [unnamed.key]: "See all new arrivals" });
  const { fixes, written } = setup(fake.agent);
  fixes.keep([unnamed]);
  const asking = fixes.suggest(unnamed);
  await fake.release();
  await asking;
  // Words typed above it: the same element, further on; the suggestion stays.
  const above = page.replace("<img", "<p>New</p><img");
  const moved = { ...unnamed, found: above, at: above.indexOf(`<a href="/new/">`) };
  assert.equal(fixes.keep([moved]), false);
  assert.equal(fixes.state(unnamed.key)?.status, "suggested");
  // Another link to the same address put before it: the first such link (key …0) is now the new one.
  const copy = `<a href="/new/"><svg></svg></a>`, other = `<a href="/new/" class="arrow"><svg></svg></a>`;
  const twice = above.replace(copy, other + copy);
  const first = { ...unnamed, found: twice, at: twice.indexOf(other) };
  const second = { ...unnamed, key: unnamed.key.replace(/0$/, "1"), found: twice, at: twice.indexOf(copy) };
  assert.equal(fixes.keep([first, second]), true);
  assert.equal(fixes.state(unnamed.key), undefined);
  assert.equal(await fixes.accept(first), false);
  assert.equal(written.length, 0);
});

test("a suggestion follows its element when a tag is put right before it", async () => {
  const fake = fakeAgent({ [unnamed.key]: "See all new arrivals" });
  const { fixes } = setup(fake.agent);
  fixes.keep([unnamed]);
  const asking = fixes.suggest(unnamed);
  await fake.release();
  await asking;
  const copy = `<a href="/new/"><svg></svg></a>`;
  const before = page.replace(copy, `<span></span>${copy}`);
  assert.equal(fixes.keep([{ ...unnamed, found: before, at: before.indexOf(copy) }]), false);
  assert.equal(fixes.state(unnamed.key)?.status, "suggested");
});

test("a like link put after the element leaves its suggestion with it", async () => {
  const fake = fakeAgent({ [unnamed.key]: "See all new arrivals" });
  const { fixes } = setup(fake.agent);
  fixes.keep([unnamed]);
  const asking = fixes.suggest(unnamed);
  await fake.release();
  await asking;
  const copy = `<a href="/new/"><svg></svg></a>`;
  const after = page.replace(copy, copy + copy);
  const first = { ...unnamed, found: after, at: after.indexOf(copy) };
  const second = { ...unnamed, key: unnamed.key.replace(/0$/, "1"), found: after, at: after.indexOf(copy) + copy.length };
  assert.equal(fixes.keep([first, second]), false);
  assert.equal(fixes.state(unnamed.key)?.status, "suggested");
});

test("a new attribute goes before the tag's end, keeping the slash an unquoted address ends with", () => {
  const source = `<p><a href=/new/><svg></svg></a><img src="/x.svg"/></p>`;
  const link: InboxItem = { ...unnamed, at: source.indexOf("<a"), found: source };
  const img: InboxItem = { ...picture, at: source.indexOf("<img"), found: source };
  const apply = (item: InboxItem, words: string) => {
    const edits = fixEdits(item, words, source);
    assert.ok(!("refuse" in edits));
    return [...edits].sort((a, b) => b.start - a.start).reduce((text, edit) => text.slice(0, edit.start) + edit.text + text.slice(edit.end), source);
  };
  assert.match(apply(link, "Home"), /<a href=\/new\/ aria-label="Home">/);
  assert.match(apply(img, "A mark"), /<img src="\/x\.svg" alt="A mark"\/>/);
});

test("a link with the same tag but other contents put before it never takes its suggestion", async () => {
  const fake = fakeAgent({ [unnamed.key]: "See all new arrivals" });
  const { fixes, written } = setup(fake.agent);
  fixes.keep([unnamed]);
  const asking = fixes.suggest(unnamed);
  await fake.release();
  await asking;
  const copy = `<a href="/new/"><svg></svg></a>`, other = `<a href="/new/"><svg><path d="M1 1"/></svg></a>`;
  const twice = page.replace(copy, other + copy);
  const first = { ...unnamed, found: twice, at: twice.indexOf(other) };
  const second = { ...unnamed, key: unnamed.key.replace(/0$/, "1"), found: twice, at: twice.indexOf(copy, twice.indexOf(other) + other.length) };
  assert.equal(fixes.keep([first, second]), true);
  assert.equal(await fixes.accept(first), false);
  assert.equal(written.length, 0);
});

test("another site opening forgets every suggestion, and an answer still on its way is dropped", async () => {
  const fake = fakeAgent({ [picture.key]: "Three riders", [vague.key]: "Bikes in stock" });
  const { fixes } = setup(fake.agent);
  const asked = fixes.suggest(picture);
  await fake.release();
  await asked;
  const late = fixes.suggest(vague);
  fixes.clear();
  await fake.release();
  await late;
  assert.equal(fixes.state(picture.key), undefined);
  assert.equal(fixes.state(vague.key), undefined);
});

test("a refused Accept is said on the status line; refused words replace the earlier refusal", async () => {
  const fake = fakeAgent({ [vague.key]: "Bikes in stock" });
  const said: string[] = [];
  let changes = 0;
  const fixes = createInboxFixes({ agent: () => fake.agent, write: async () => { throw new Error("The page changed. Nothing was changed."); }, changed: () => { changes++; }, refused: message => said.push(message) });
  const asking = fixes.suggest(vague);
  await fake.release();
  await asking;
  assert.equal(await fixes.accept(vague), false);
  assert.deepEqual(said, ["The page changed. Nothing was changed."]);
  const before = changes;
  fixes.edit(vague.key, "read more");
  // Typing that clears the refusal draws the row again.
  assert.equal(changes, before + 1);
  assert.equal(await fixes.accept(vague), false);
  assert.deepEqual(fixes.state(vague.key), { status: "suggested", draft: "read more", invalid: true });
});

test("an older Accept that settles after another site's Accept of the same row never touches the newer one", async () => {
  const answers: Record<string, string> = { [picture.key]: "Old words" };
  const agent: InboxAgent = { connected: () => true, suggest: async item => answers[item.key] };
  const settle: { fail?: (error: Error) => void; done?: () => void }[] = [];
  const fixes = createInboxFixes({ agent: () => agent, write: () => new Promise<void>((done, fail) => { settle.push({ done, fail }); }), changed() {} });
  await fixes.suggest(picture);
  const old = fixes.accept(picture);
  // Another site opens; the same row is asked and accepted there.
  fixes.clear();
  answers[picture.key] = "New words";
  await fixes.suggest(picture);
  const newer = fixes.accept(picture);
  settle[0].fail!(new Error("The site changed since it was checked. Nothing was changed."));
  assert.equal(await old, false);
  assert.deepEqual(fixes.state(picture.key), { status: "accepting", draft: "New words" });
  settle[1].done!();
  assert.equal(await newer, true);
  assert.deepEqual(fixes.state(picture.key), { status: "accepted", draft: "New words" });
});

test("Fix with AI and Accept settle only on the site they were pressed on (await race)", async () => {
  // Accept's write succeeds, or the page refuses it: either way another site opening meanwhile keeps the row untouched.
  for (const refuses of [false, true]) {
    const awaits = await forEachAwait(race => {
      const said: string[] = [];
      const agent: InboxAgent = { connected: () => true, suggest: race.port("suggest", async (_item: InboxItem) => "Three riders") };
      const fixes = createInboxFixes({
        agent: () => agent,
        write: race.port("write", async (_list: readonly InboxFix[]) => { if (refuses) throw new Error("The page changed. Nothing was changed."); }),
        changed() {},
        refused: message => said.push(message),
      });
      const done = fixes.suggest(picture).then(() => fixes.accept(picture));
      return { fixes, said, done };
    }, run => { run.fixes.clear(); }, run => {
      assert.equal(run.fixes.state(picture.key), undefined);
      assert.deepEqual(run.said, []);
    });
    assert.equal(awaits, 2);
  }
});
