import assert from "node:assert/strict";
import { test } from "node:test";
import { createGuestTextEdits } from "../src/guest-text-edits";
import { createGuestAsks, GUEST_NO_ANSWER } from "../src/guest-asks";
import { GUEST_RENDERS_KEPT } from "../src/live-session";
import type { GuestContext } from "../src/components/native-preview";
import type { GuestMessage } from "../src/live-session";
import { forEachAwait, type AwaitRace } from "./support/await-race";

const settle = () => new Promise<void>(resolve => setImmediate(resolve));
const selected = { path: "index.html", node: [0, 0], tag: "p" };
const context: GuestContext = {
  path: "index.html", links: [], pictures: [],
  sizes: { kind: "inline", sizes: [{ value: "1.25rem", label: "Large" }] },
};

function fixture(race?: AwaitRace) {
  const sent: GuestMessage[] = [], answers: (string | undefined)[] = [];
  let changes = 0;
  const asks = createGuestAsks(message => sent.push(message));
  const read = () => asks.ask<{ size?: string; bold?: boolean }>(ask => ({ t: "sources", ask }), 10_000);
  const edits = createGuestTextEdits({
    read: race ? race.port("sources", read) : read,
    write: (change, on) => asks.change(change, on),
    changed: () => { changes++; }, answered: reason => { answers.push(reason); },
  } satisfies Parameters<typeof createGuestTextEdits>[0]);
  edits.context(context);
  const reads = () => sent.filter(message => message.t === "sources");
  const writes = () => sent.filter(message => message.t === "change");
  return {
    edits, reads, writes, answers, changes: () => changes,
    reply(bold = false, at = reads().length - 1) {
      const request = reads()[at];
      assert.ok(request, "the guest asked for sources");
      asks.answer(request.ask, { size: "default", bold });
    },
    answer(reason?: string, at = writes().length - 1) {
      const request = writes()[at];
      assert.ok(request, "the guest sent a change");
      asks.answer(request.ask, { done: !reason, why: reason });
    },
    close() { edits.close(); asks.close(); },
  };
}

function bold(f: ReturnType<typeof fixture>) {
  const control = f.edits.controls().find(control => control.kind === "button" && control.ariaLabel === "Bold");
  assert.ok(control?.kind === "button", "Bold is available");
  return control;
}

test("changing selection keeps the typing wait until a render confirms the letters", async t => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const f = fixture();
  try {
    f.edits.select(selected);
    f.reply(); await settle();
    f.edits.typing(1);
    f.edits.select({ ...selected, node: [0, 1] });
    assert.equal(f.reads().length, 1, "no source read starts ahead of the typed letters");
    f.edits.rendered(1, 1);
    f.edits.select({ ...selected, node: [0, 1] });
    t.mock.timers.tick(1_201);
    f.reply(); await settle();
    const bold = f.edits.controls().find(control => control.kind === "button" && control.ariaLabel === "Bold");
    assert.ok(bold?.kind === "button", "the second paragraph has its Bold control after confirmation");
    assert.equal(bold.waiting, false);
    bold.onPress();
    assert.equal(f.writes().length, 1);
    assert.deepEqual(f.writes()[0].change.node, [0, 1]);
    const reads = f.reads().length;
    t.mock.timers.tick(2_001); await settle();
    assert.equal(f.reads().length, reads, "abandoned typing does not schedule a late source read");
  } finally { f.close(); }
});

test("returning to a paragraph before its typed letters are confirmed cannot format an old render", async t => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const f = fixture();
  try {
    f.edits.select(selected); f.reply(); await settle();
    f.edits.typing(1);
    f.edits.select({ ...selected, node: [0, 1] });
    f.edits.select(selected);
    f.reply(); await settle();
    for (const control of f.edits.controls()) {
      assert.equal(control.waiting, true);
      if (control.kind === "button") control.onPress();
    }
    assert.equal(f.writes().length, 0);
    assert.equal(f.reads().length, 1, "returning does not read ahead of unconfirmed typing");
    f.edits.rendered(1, 1); f.edits.select(selected);
    t.mock.timers.tick(1_201);
    f.reply(); await settle();
    assert.equal(bold(f).waiting, false);
    bold(f).onPress();
    assert.equal(f.writes().length, 1);
    assert.equal(f.writes()[0].seen, 1);
  } finally { f.close(); }
});

test("a missing host context abandons a pending read without throwing or updating the controls", async () => {
  const f = fixture();
  try {
    f.edits.select(selected);
    f.edits.context(undefined);
    f.reply(); await settle();
    assert.deepEqual(f.edits.controls(), []);
  } finally { f.close(); }
});

test("typing ahead of confirmations enables formatting once the last letter and source read arrive", async t => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const f = fixture();
  try {
    f.edits.select(selected); f.reply(); await settle();
    f.edits.typing(1);
    for (let seq = 2; seq <= 60; seq++) {
      f.edits.typing(seq);
      f.edits.rendered(seq - 1, seq - 1); f.edits.select(selected);
      assert.equal(bold(f).waiting, true);
      bold(f).onPress();
      t.mock.timers.tick(100);
    }
    f.edits.rendered(60, 60); f.edits.select(selected);
    f.reply(); await settle();
    assert.equal(bold(f).waiting, false);
    bold(f).onPress();
    assert.equal(f.writes().length, 1);
    assert.equal(f.writes()[0].seen, 60);
  } finally { f.close(); }
});

test("a control retained across selection changes or close cannot send another text change", async () => {
  for (const abandon of ["selection", "close"]) {
    const f = fixture();
    try {
      f.edits.select(selected);
      f.reply(); await settle();
      const bold = f.edits.controls().find(control => control.kind === "button" && control.ariaLabel === "Bold");
      assert.ok(bold?.kind === "button");
      if (abandon === "close") f.edits.close();
      else {
        f.edits.select(undefined);
        f.edits.select(selected);
        f.reply(true); await settle();
      }
      bold.onPress();
      assert.equal(f.writes().length, 0, `${abandon}: abandoned control sends nothing`);
    } finally { f.close(); }
  }
});

test("changing the host page cancels a text change even when the same page comes back before its answer", async t => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const f = fixture();
  try {
    f.edits.select(selected); f.reply(); await settle();
    bold(f).onPress();
    f.edits.context({ ...context, path: "other.html" });
    f.edits.context(context);
    f.reply(true); await settle();
    assert.equal(bold(f).waiting, false, "the old write cannot hold the new visit");
    f.answer("Old page refused"); await settle();
    assert.deepEqual(f.answers, [], "the old page's answer cannot warn on the new visit");
    const changes = f.changes(), reads = f.reads().length;
    t.mock.timers.tick(2_001); await settle();
    assert.equal(f.changes(), changes);
    assert.equal(f.reads().length, reads);
  } finally { f.close(); }
});

test("old source replies never replace a newer completed read, in either reply order", async t => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  for (const order of [[1, 2], [2, 1]]) {
    const f = fixture();
    try {
      f.edits.select(selected); f.reply(); await settle();
      f.edits.rendered(1, 0); f.edits.select(selected);
      t.mock.timers.tick(1_201);
      f.edits.rendered(2, 0); f.edits.select(selected);
      t.mock.timers.tick(1_201);
      assert.equal(f.reads().length, 3, "a newer render reads without waiting for an unanswered older read");
      for (const at of order) { f.reply(at === 2, at); await settle(); }
      assert.equal(bold(f).pressed, true);
      bold(f).onPress();
      assert.equal(f.writes().length, 1);
      assert.equal(f.writes()[0].seen, 2, "the latest completed read supplies the proof");
      assert.deepEqual(f.writes()[0].change, { kind: "bold", ...selected, on: false });
    } finally { f.close(); }
  }
});

test("an expired source reply cannot send a change while a retained render's read is pending", async t => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const f = fixture();
  try {
    f.edits.select(selected);
    for (let n = 1; n <= GUEST_RENDERS_KEPT + 1; n++) {
      f.edits.rendered(n, 0); f.edits.select(selected);
    }
    f.reply(false, 0); await settle();
    assert.equal(bold(f).waiting, true);
    bold(f).onPress();
    assert.equal(f.writes().length, 0, "a forced event cannot send an expired proof");
    f.reply(true); await settle();
    assert.equal(bold(f).waiting, false);
    bold(f).onPress();
    assert.equal(f.writes().length, 1);
    assert.equal(f.writes()[0].seen, 50, "the write names the read's retained render, not the latest render");
    assert.equal(f.writes()[0].change.kind, "bold");
  } finally { f.close(); }
});

test("an expired source reply cannot authorize a write while a fresh reply is held", async t => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const f = fixture();
  try {
    f.edits.select(selected); f.reply(); await settle();
    f.edits.rendered(1, 0); f.edits.select(selected);
    t.mock.timers.tick(1_201);
    f.edits.rendered(GUEST_RENDERS_KEPT + 1, 0); f.edits.select(selected);
    f.reply(true, 1); await settle();
    assert.equal(bold(f).waiting, true);
    bold(f).onPress();
    assert.equal(f.writes().length, 0);
    f.reply(false, 2); await settle();
    assert.equal(bold(f).waiting, false);
    bold(f).onPress();
    assert.equal(f.writes()[0].seen, GUEST_RENDERS_KEPT + 1);
  } finally { f.close(); }
});

test("continuous acknowledged typing keeps fresh controls usable and sends each format change once", async t => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  for (const answerFirst of [false, true]) {
    const f = fixture();
    try {
      f.edits.select(selected); f.reply(); await settle();
      for (let seq = 1; seq <= 60; seq++) {
        f.edits.typing(seq);
        f.edits.rendered(seq, seq); f.edits.select(selected);
        f.reply(); await settle();
        assert.equal(bold(f).waiting, false);
        t.mock.timers.tick(100);
      }
      const size = f.edits.controls().find(control => control.kind === "select" && control.label === "Text size");
      assert.ok(size?.kind === "select");
      assert.equal(size.waiting, false);
      size.onChange("1.25rem"); size.onChange("1.25rem");
      assert.equal(f.writes().length, 1, "repeated events do not resend a pending change");
      assert.equal(f.writes()[0].seen, 60);
      if (answerFirst) { f.answer(); await settle(); }
      f.edits.rendered(61, 60); f.edits.select(selected);
      if (!answerFirst) {
        f.answer(); await settle();
        assert.equal(bold(f).waiting, true, "a render preceding the answer does not confirm the write");
        t.mock.timers.tick(2_001);
      }
      f.reply(); await settle();
      assert.equal(bold(f).waiting, false);
      bold(f).onPress(); bold(f).onPress();
      assert.equal(f.writes().length, 2);
      assert.equal(f.writes()[1].seen, 61);
    } finally { f.close(); }
  }
});

test("lost typing and format acknowledgements recover without resending a change", async t => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const f = fixture();
  try {
    f.edits.select(selected); f.reply(); await settle();
    f.edits.typing(1);
    t.mock.timers.tick(2_001);
    f.reply(); await settle();
    assert.equal(bold(f).waiting, false);
    bold(f).onPress();
    t.mock.timers.tick(60_001); await settle();
    assert.deepEqual(f.answers, [GUEST_NO_ANSWER]);
    f.reply(true); await settle();
    assert.equal(bold(f).waiting, false);
    assert.equal(bold(f).pressed, true, "a fresh source read recovers the written change even without its answer");
    f.answer(); await settle();
    assert.equal(f.writes().length, 1, "a late answer never retries the write");
    assert.deepEqual(f.answers, [GUEST_NO_ANSWER]);
  } finally { f.close(); }
});

test("a pending source read makes no late updates after selection, page or session ends", async t => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  for (const abandon of ["selection", "page", "close"]) {
    const fixtures: ReturnType<typeof fixture>[] = [];
    try {
      assert.equal(await forEachAwait(race => {
        const f = fixture(race);
        fixtures.push(f);
        f.edits.select(selected);
        return { f, done: settle().then(async () => { f.reply(); await settle(); }), changes: 0 };
      }, run => {
        if (abandon === "selection") run.f.edits.select(undefined);
        else if (abandon === "page") run.f.edits.context({ ...context, path: "other.html" });
        else run.f.close();
        run.changes = run.f.changes();
      }, run => {
        assert.equal(run.f.changes(), run.changes, `${abandon}: the late read draws nothing`);
        assert.deepEqual(run.f.edits.controls(), []);
        const reads = run.f.reads().length;
        t.mock.timers.tick(15_001);
        assert.equal(run.f.reads().length, reads, "cancelled read starts no retry");
      }), 1);
    } finally { fixtures.forEach(f => f.close()); }
  }
});
