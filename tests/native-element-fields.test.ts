import assert from "node:assert/strict";
import test from "node:test";
import { chromium } from "@playwright/test";
import { startTags } from "../shared/html-source.ts";
import { locateNativeFieldElement, nativeElementFields, nativeElementAttributeEdits } from "../src/page-builder/native-element-fields.ts";
function write(source: string, patch: Record<string, string | null>, name = startTags(source)[0].name) {
  const tag = startTags(source).find((item) => item.name === name)!;
  const located = locateNativeFieldElement(source, tag);
  assert.ok(!("error" in located));
  return nativeElementAttributeEdits(source, located, patch);
}
function output(source: string, patch: Record<string, string | null>, name?: string) {
  const result = write(source, patch, name);
  assert.ok(!("error" in result), "error" in result ? result.error : "");
  assert.equal(result.expectedSource, source);
  return result.edits.reduceRight((text, edit) => text.slice(0, edit.start) + edit.text + text.slice(edit.end), source);
}
test("fields reflect tag applicability, decoded values and honest custom method", () => {
  const source = '<form method="custom"><input type="text"><input type="SUBMIT"><button type="reset"></button><button></button><iframe title="A &amp; B"></iframe></form>';
  const fields = startTags(source).map((tag) => nativeElementFields(source, tag));
  assert.equal(fields[0].find((field) => field.property === "method")?.options?.at(-1)?.value, "custom");
  assert.equal(fields[1].some((field) => field.property === "formaction"), false);
  assert.equal(fields[2].some((field) => field.property === "formaction"), true);
  assert.equal(fields[3].some((field) => field.property === "formaction"), false);
  assert.equal(fields[4].some((field) => field.property === "formaction"), true);
  assert.equal(fields[5].find((field) => field.property === "title")?.value, "A & B");
  assert.deepEqual(nativeElementFields("<label>Caption</label>", startTags("<label>Caption</label>")[0]), []);
});
test("patches are atomic, exact, removable and reject stale or forged source tags", () => {
  const source = '<video data-x="keep  bytes" title=old src="a"></video>';
  assert.equal(output(source, { title: null }), '<video data-x="keep  bytes" src="a"></video>');
  assert.ok("error" in write(source, { title: "good", onclick: "bad" }));
  assert.ok("error" in write('<form method="custom"></form>', { method: "PUT" }));
  assert.ok("error" in write('<input type="text">', { formaction: "/send" }));
  const located = locateNativeFieldElement(source, startTags(source)[0]); assert.ok(!("error" in located));
  assert.ok("error" in nativeElementAttributeEdits(source.replace("old", "new"), located, { title: "x" }));
  assert.ok("error" in locateNativeFieldElement(source, { ...startTags(source)[0], end: 2 }));
  const malformed = '<video title="unfinished>';
  assert.ok("error" in locateNativeFieldElement(malformed, startTags(malformed)[0]));
  assert.ok("error" in write('<video title="first" title="second"></video>', { title: null }));
  for (const wrapper of ["svg", "math", "template", "noscript"]) {
    const text = `<${wrapper}><video></video></${wrapper}>`;
    assert.deepEqual(nativeElementFields(text, startTags(text)[1]), []);
  }
});
test("URL policies reject executable/entity/control schemes without partial edits", () => {
  for (const src of ["javascript:alert(1)", "java&#x73;cript:alert(1)", "data:text/html,x", "vbscript:x", "java\nscript:x", "https://x\t/y"]) assert.ok("error" in write('<iframe></iframe>', { src, title: "good" }), src);
  assert.ok(!("error" in write('<iframe></iframe>', { src: "about:blank" })));
  assert.ok("error" in write('<video></video>', { src: "about:blank" }));
  for (const action of ["mailto:hello@example.com", "tel:+123", "/send?a=1&b=2"]) assert.ok(!("error" in write('<form></form>', { action })));
});
test("production attribute edits preserve browser values, Unicode and unquoted slash bytes", async () => {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    const source = '<main>İstanbul<video src=x/ data-x="a  b" title="&amp;#106;"></video><iframe></iframe></main>';
    const raw = 'A "quote" & <tag> &#106;';
    const edited = output(source, { title: raw, poster: "/image?a=1&b=2" }, "video");
    assert.ok(edited.startsWith('<main>İstanbul<video src=x/ data-x="a  b"'));
    await page.setContent(edited);
    assert.deepEqual(await page.locator("video").evaluate((el) => [el.getAttribute("src"), el.getAttribute("data-x"), el.getAttribute("title"), el.getAttribute("poster")]), ["x/", "a  b", raw, "/image?a=1&b=2"]);
    const slash = output('<video src=x/>', { title: "new" });
    await page.setContent(slash);
    assert.equal(await page.locator("video").getAttribute("src"), "x/");
    const unicode = output('<video data-x=a\u00a0data-key=1/>', { title: "new" });
    await page.setContent(unicode);
    assert.equal(await page.locator("video").getAttribute("data-x"), "a\u00a0data-key=1/");
    const decoded = '<iframe title="&amp;#106;"></iframe>';
    const field = nativeElementFields(decoded, startTags(decoded)[0])[1];
    assert.equal(field.value, "&#106;");
    await page.setContent(output(decoded, { title: field.value }));
    assert.equal(await page.locator("iframe").getAttribute("title"), "&#106;");
  } finally { await browser.close(); }
});
