// The picture's text of a pseudo-element (src/agent-picture.ts contentText, ticket am-14): what `content` shows as
// text, its strings unescaped and its attr()s read, the rest (counters, quotes, images) nothing. The drawing itself
// needs a browser: tests/native-save/native-agent-picture.spec.ts takes real pictures.
import { strict as assert } from "node:assert";
import { test, type TestContext } from "node:test";
import { contentText, encode } from "../src/agent-picture.ts";

// Deliberate: contentText reads only getAttribute, so the fake element has nothing else.
const element = (attributes: Record<string, string>) => ({ getAttribute: (name: string) => attributes[name] ?? null }) as Pick<Element, "getAttribute"> as Element;

test("a pseudo-element's content becomes its text: strings, escapes and attr()s; counters, quotes and images show nothing", () => {
  const el = element({ "data-label": "New" });
  assert.equal(contentText('"→ "', el), "→ ");
  assert.equal(contentText("'It\\'s' \" here\"", el), "It's here");
  assert.equal(contentText('"\\201C" attr(data-label) "\\201D"', el), "“New”");
  assert.equal(contentText('"\\2014 x"', el), "—x");
  assert.equal(contentText("attr(missing)", el), "");
  assert.equal(contentText('counter(item) ". "', el), ". ");
  assert.equal(contentText("open-quote", el), "");
  assert.equal(contentText('url("data:image/svg+xml,x")', el), "");
});

// The browser's image and canvas, faked: a picture's base64 grows with its pixels and quality, and a WebP the browser
// cannot make comes back as PNG (so JPEG is asked for). Each try is recorded.
function fakeBrowser(t: TestContext, options: { webp?: boolean; tainted?: boolean } = {}) {
  const tries: string[] = [];
  class FakeImage implements Pick<HTMLImageElement, "src" | "decode"> { src = ""; decode = async () => {}; }
  // Deliberate: encode draws with only these three context members, so the context is cast from them.
  const context = { fillStyle: "", fillRect() {}, drawImage() {} } satisfies Pick<CanvasRenderingContext2D, "fillStyle" | "fillRect" | "drawImage">;
  const canvas = {
    width: 0, height: 0,
    getContext: (() => context as Pick<CanvasRenderingContext2D, keyof typeof context> as CanvasRenderingContext2D) as HTMLCanvasElement["getContext"],
    toDataURL(type?: string, quality?: number) {
      if (options.tainted) throw new DOMException("Tainted canvases may not be exported.", "SecurityError");
      const kind = type === "image/webp" && options.webp === false ? "image/png" : type ?? "image/png";
      tries.push(`${kind} ${canvas.width}x${canvas.height} ${quality}`);
      return `data:${kind};base64,${"A".repeat(Math.round(canvas.width * canvas.height * (quality ?? 1) / 10))}`;
    },
  } satisfies Pick<HTMLCanvasElement, "width" | "height" | "getContext" | "toDataURL">;
  // Node has neither: they are set for the test and taken away after it.
  Object.assign(globalThis, { Image: FakeImage, document: { createElement: () => canvas } satisfies Pick<Document, "createElement"> });
  t.after(() => { Reflect.deleteProperty(globalThis, "Image"); Reflect.deleteProperty(globalThis, "document"); });
  return tries;
}

test("a picture is made smaller until it fits: lower quality first, then a smaller size; none fits, it says so", async t => {
  const tries = fakeBrowser(t);
  // 390 × 844 at 0.8 is 26,333 characters: 0.6 fits 20,000.
  const fitted = await encode("<svg/>", 390, 844, "#fff", 20_000);
  assert.deepEqual({ ...fitted, data: fitted.data.length }, { data: 19_750, mimeType: "image/webp", width: 390, height: 844 });
  assert.deepEqual(tries, ["image/webp 390x844 0.8", "image/webp 390x844 0.6"]);
  tries.length = 0;
  // 8,000: no quality fits at full size; at 3/4 size 0.4 does.
  const smaller = await encode("<svg/>", 390, 844, "#fff", 8_000);
  assert.ok(smaller.data.length <= 8_000);
  assert.deepEqual([smaller.width, smaller.height], [293, 633]);
  assert.equal(tries.at(-1), "image/webp 293x633 0.4");
  await assert.rejects(encode("<svg/>", 390, 844, "#fff", 10), /^Error: The picture could not fit its size limit\. Take one of a section instead\.$/);
});

test("a browser without WebP gives JPEG", async t => {
  const tries = fakeBrowser(t, { webp: false });
  assert.equal((await encode("<svg/>", 100, 100, "#fff", 1_000_000)).mimeType, "image/jpeg");
  assert.deepEqual(tries, ["image/png 100x100 0.8", "image/jpeg 100x100 0.8"]);
});

test("a canvas the browser will not read is refused, saying so", async t => {
  fakeBrowser(t, { tainted: true });
  await assert.rejects(encode("<svg/>", 100, 100, "#fff", 1_000_000), /would not let the editor read its picture of the page/);
});
