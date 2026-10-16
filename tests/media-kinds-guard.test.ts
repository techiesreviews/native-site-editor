import assert from "node:assert/strict";
import { test } from "node:test";
import { ts, parse, walk, finding, sourceFiles, readSource, unallowed, staleEntries, type AllowlistEntry, type Detector, type Finding, type TS } from "./support/source-guard.ts";

// Match whole extension tokens, including historical regex abbreviations. Archive and office
// formats count too; generic words that are also extensions (key, pages, md, txt) stay out.
const names = "jpg|jpeg|png|webp|gif|avif|svg|ico|bmp|tif|tiff|heic|heif|mp4|m4v|webm|mov|ogv|mkv|avi|mpeg|mpg|mp3|m4a|aac|wav|ogg|oga|opus|flac|aif|aiff|woff|woff2|ttf|otf|eot|pdf|zip|gz|tgz|tar|7z|rar|bz2|xz|zst|doc|docx|xls|xlsx|ppt|pptx|odt|ods|odp|rtf|epub";
const token = new RegExp(String.raw`(?<![a-z\d])(?:jpe\?g|tiff\?|woff2\?|aiff\?|mpe\?g|docx\?|xlsx\?|pptx\?|${names})(?![a-z\d])`, "gi");
const extension = new RegExp(String.raw`^(?:\.|(?:image|video|audio|font)\/)?(?:${names})(?:\+xml)?$`, "i");
/** A string that is nothing but extensions separated by spaces ("jpg png webp"). */
const spaceList = (text: string) => /^\.?[a-z\d]+(?: \.?[a-z\d]+)+$/i.test(text.trim()) && [...text.matchAll(token)].length >= 2;
const detect: Detector = (source, file) => {
  if (file === "shared/media-kinds.ts") return [];
  const tree = parse(source, file), hits: Finding[] = [];
  const strings = (node: TS.Node): string[] => {
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return [node.text];
    return ts.isArrayLiteralExpression(node) ? node.elements.flatMap(strings) : [];
  };
  walk(tree, node => {
    if (ts.isRegularExpressionLiteral(node) && node.text.includes("|") && [...node.text.matchAll(token)].length >= 2)
      hits.push(finding(tree, node, "media-regex"));
    if ((ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) && ((node.text.includes(",") || node.text.includes("|")) && [...node.text.matchAll(token)].length >= 2 || spaceList(node.text)))
      hits.push(finding(tree, node, "media-string"));
    if (ts.isArrayLiteralExpression(node) && !(node.parent && ts.isArrayLiteralExpression(node.parent)) && strings(node).filter(value => extension.test(value)).length >= 2)
      hits.push(finding(tree, node, "media-array"));
    if (ts.isObjectLiteralExpression(node) && node.properties.filter(property => property.name && extension.test(property.name.getText(tree).replace(/^["']|["']$/g, ""))).length >= 2)
      hits.push(finding(tree, node, "media-keys"));
  });
  return hits;
};

const allowlist: AllowlistEntry[] = [
  { file: "src/onboarding-media/index.ts", match: '"./*.{mp4,webm,jpg,png,webp,vtt}"', reason: "Vite requires a literal import.meta.glob to discover bundled onboarding files." },
  { file: "src/onboarding-media/names.ts", match: { rule: "media-keys", text: 'id: "signin"', includes: true }, reason: "Named PNG and WebP screenshots of one onboarding step, not extension classification." },
  { file: "src/onboarding-media/names.ts", match: { rule: "media-keys", text: 'id: "install"', includes: true }, reason: "Named PNG and WebP screenshots of one onboarding step, not extension classification." },
  { file: "src/page-builder/audio-prepare.ts", match: "/^(mp3|mp4|m4a|adts|aac)$/i", reason: "Mediabunny container identifiers, including ADTS, are not filename extensions." },
  { file: "src/page-builder/media-encoders.ts", match: { rule: "media-keys", function: "createMediaEncoder" }, reason: "Codec loader implementations, not accepted file extensions." },
  { file: "src/page-builder/media-library-optimise.ts", match: '[["webp", "WebP"], ["avif", "AVIF"], ["png", "PNG"], ["jpeg", "JPEG"]]', reason: "Ordered encoder choices and UI labels; JPEG is an encoder name, not the output extension jpg." },
  { file: "src/page-builder/media-optimise.ts", match: '["webp", "png", "jpeg", "avif"]', reason: "Validates encoder option names, not file extensions; matches the format union and select." },
  { file: "src/page-builder/media-replace-rules.ts", match: '"Choose a JPEG, PNG, WebP or AVIF picture."', reason: "User-facing error prose, not a machine-readable extension list." },
  { file: "worker/site-conventions.ts", match: { rule: "media-string", function: "<top-level>" }, reason: "Agent-facing site-conventions documentation with filename examples, not executable extension policy." },
];

test("media extension policies stay in shared/media-kinds.ts", () => {
  const hits = ["src", "shared", "worker"].flatMap(directory => sourceFiles(directory)).flatMap(file => detect(readSource(file), file));
  assert.deepEqual(unallowed(hits, allowlist), []);
  assert.deepEqual(staleEntries(hits, allowlist), []);
});

test("guard catches pasted historical lists and each list syntax in memory", () => {
  for (const source of [
    String.raw`const old = /\.(?:jpe?g|png|webp|gif|avif|svg)$/i;`,
    String.raw`const old = /\.(woff2?|ttf|otf|eot)$/i;`,
    String.raw`const old = /\.(mp4|m4v|webm|mov|ogv|mkv|avi|mpe?g)$/i;`,
    `const old = ["jpg", "png"];`,
    `const old = new Set(["jpg", "png"]);`,
    `const old = [".jpg", ".png"];`,
    `const old = { "image/jpeg": "jpg", "image/png": "png" };`,
    String.raw`const old = new RegExp("\\.(?:jpg|png)$", "i");`,
    `const old = { jpg: "image/jpeg", png: "image/png" };`,
    `const old = ".mp4,.webm";`,
    `const old = [["png", "PNG"], ["jpeg", "JPEG"]];`,
    String.raw`const old = /\.(?:zip|tar|gz|tgz|7z|rar)$/i;`,
    String.raw`const old = /\.(?:docx?|xlsx?|pptx?)$/i;`,
    `const old = ["doc", "docx"];`,
    `const old = "jpg png".split(" ");`,
  ]) assert.ok(detect(source, "src/example.ts").length, source);
  assert.deepEqual(detect(String.raw`const single = /\.svg$/i; const encode = "image/webp";`, "src/example.ts"), []);
  assert.deepEqual(detect(`const canonical = ["jpg", "png"];`, "shared/media-kinds.ts"), []);
});
