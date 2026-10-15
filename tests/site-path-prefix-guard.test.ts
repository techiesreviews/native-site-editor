import assert from "node:assert/strict";
import { test } from "node:test";
import { ts, parse, walk, strip, literal, member, finding, nameFindings, sourceFiles, readSource, unallowed, staleEntries, type AllowlistEntry, type Detector, type Finding } from "./support/source-guard.ts";

const rootTemplates: Detector = (source, file) => {
  const tree = parse(source, file), hits: Finding[] = [];
  walk(tree, node => {
    if (ts.isTemplateExpression(node) && node.head.text === "/") hits.push(finding(tree, node, "root-template"));
  });
  return hits;
};
const rootConcatenations: Detector = (source, file) => {
  const tree = parse(source, file), hits: Finding[] = [];
  walk(tree, node => {
    if (!ts.isBinaryExpression(node) || node.operatorToken.kind !== ts.SyntaxKind.PlusToken || literal(strip(node.left)) !== "/") return;
    // endsWith("/" + name) compares a repository path suffix; it does not build a root address.
    const parent = node.parent;
    if (ts.isCallExpression(parent) && member(parent.expression)?.name === "endsWith" && parent.arguments.includes(node)) return;
    hits.push(finding(tree, node, "root-concatenation"));
  });
  return hits;
};
const mediaBuilders: Detector = (source, file) => nameFindings(source, file, "media-url", name => name === "mediaUrl");
const rootAttributes: Detector = (source, file) => {
  const tree = parse(source, file), hits: Finding[] = [];
  walk(tree, node => {
    if (!ts.isStringLiteral(node) && !ts.isNoSubstitutionTemplateLiteral(node) && !ts.isTemplateHead(node) && !ts.isTemplateMiddle(node) && !ts.isTemplateTail(node)) return;
    for (const match of node.text.matchAll(/(?<![\w:-])(?:src|href)\s*=\s*(["'])\/(?!\/)(?:(?!\1)[\s\S])*(?:\1|$)/gi))
      hits.push(finding(tree, node, "root-attribute", match[0]));
  });
  return hits;
};
const detectors = [rootTemplates, rootConcatenations, mediaBuilders, rootAttributes];
// Temporary migration inventory: slices 78–79 must remove every entry, including readers.
const allowlist: AllowlistEntry[] = [
  { file: "src/components/github-trip.ts", match: { rule: "media-url", function: "<top-level>" }, reason: "Slice 78: media, preview and page-link addresses use the shared site-prefix helper.", count: 1 },
  { file: "src/components/github-trip.ts", match: { rule: "media-url", function: "picture" }, reason: "Slice 78: media, preview and page-link addresses use the shared site-prefix helper.", count: 2 },
  { file: "src/components/site-settings.ts", match: { rule: "root-template", function: "picture" }, reason: "Slice 78: media, preview and page-link addresses use the shared site-prefix helper.", count: 1 },
  { file: "src/components/site-settings.ts", match: { rule: "root-template", function: "done" }, reason: "Slice 78: media, preview and page-link addresses use the shared site-prefix helper.", count: 1 },
  { file: "src/components/site-settings.ts", match: { rule: "root-template", function: "addImageChoices" }, reason: "Slice 78: media, preview and page-link addresses use the shared site-prefix helper.", count: 1 },
  { file: "src/main.ts", match: { rule: "root-template", function: "nativeFallbackPage" }, reason: "Read/compare fallback routes; slice 79 moves prefix interpretation to sitePathOf.", count: 1 },
  { file: "src/main.ts", match: { rule: "root-attribute", function: "picture" }, reason: "Slice 78: media, preview and page-link addresses use the shared site-prefix helper.", count: 1 },
  { file: "src/main.ts", match: { rule: "root-attribute", function: "renderLogin" }, reason: "Slice 78: editor-shell home navigation must explicitly retain an empty prefix.", count: 1 },
  { file: "src/main.ts", match: { rule: "root-attribute", function: "<top-level>" }, reason: "Slice 78: editor authentication navigation must explicitly retain an empty prefix.", count: 1 },
  { file: "src/native-create.ts", match: { rule: "root-template", function: "normalizeRoute" }, reason: "Slice 79: route construction and route validation diagnostics follow the site address.", count: 3 },
  { file: "src/native-pages.ts", match: { rule: "root-template", function: "nativeNewTarget" }, reason: "Read/compare reserved routes in a diagnostic; slice 79 aligns route interpretation with sitePathOf.", count: 1 },
  { file: "src/native-settings.ts", match: { rule: "media-url", function: "<top-level>" }, reason: "Slice 78: media, preview and page-link addresses use the shared site-prefix helper.", count: 1 },
  { file: "src/native-settings.ts", match: { rule: "media-url", function: "socialFrame" }, reason: "Slice 78: media, preview and page-link addresses use the shared site-prefix helper.", count: 2 },
  { file: "src/native-settings.ts", match: { rule: "root-attribute", function: "open404" }, reason: "Slice 78: media, preview and page-link addresses use the shared site-prefix helper.", count: 1 },
  { file: "src/native-settings.ts", match: { rule: "root-attribute", function: "imageUrl" }, reason: "Slice 78: media, preview and page-link addresses use the shared site-prefix helper.", count: 1 },
  { file: "src/onboarding-media/index.ts", match: { rule: "media-url", function: "installMedia" }, reason: "Slice 78: media, preview and page-link addresses use the shared site-prefix helper.", count: 3 },
  { file: "src/page-builder/card-source.ts", match: { rule: "root-template", function: "linkRoute" }, reason: "Read/compare card routes; slice 78 moves prefix interpretation to sitePathOf.", count: 1 },
  { file: "src/page-builder/cards.ts", match: { rule: "root-template", function: "cardPageFolders" }, reason: "Read/compare page-folder routes; slice 78 moves prefix interpretation to sitePathOf.", count: 1 },
  { file: "src/page-builder/component-loader.ts", match: { rule: "root-attribute", function: "<top-level>" }, reason: "Slice 78: component-loader script address follows the site prefix.", count: 1 },
  { file: "src/page-builder/components.ts", match: { rule: "root-template", function: "slotRow" }, reason: "Slice 78: media, preview and page-link addresses use the shared site-prefix helper.", count: 1 },
  { file: "src/page-builder/components.ts", match: { rule: "root-template", function: "structure" }, reason: "Slice 78: media, preview and page-link addresses use the shared site-prefix helper.", count: 1 },
  { file: "src/page-builder/improve-images.ts", match: { rule: "root-concatenation", function: "improveImagesPlan" }, reason: "Read/display page-route labels; slice 78 aligns prefix interpretation with sitePathOf.", count: 1 },
  { file: "src/page-builder/looping-video.ts", match: { rule: "media-url", function: "<top-level>" }, reason: "Slice 78: media, preview and page-link addresses use the shared site-prefix helper.", count: 1 },
  { file: "src/page-builder/looping-video.ts", match: { rule: "media-url", function: "loopingVideoMarkup" }, reason: "Slice 78: media, preview and page-link addresses use the shared site-prefix helper.", count: 2 },
  { file: "src/page-builder/looping-video.ts", match: { rule: "media-url", function: "backgroundVideoMarkup" }, reason: "Slice 78: media, preview and page-link addresses use the shared site-prefix helper.", count: 2 },
  { file: "src/page-builder/media-attributes.ts", match: { rule: "root-template", function: "mediaUrl" }, reason: "Slice 78: media, preview and page-link addresses use the shared site-prefix helper.", count: 1 },
  { file: "src/page-builder/media-insert.ts", match: { rule: "media-url", function: "<top-level>" }, reason: "Slice 78: media, preview and page-link addresses use the shared site-prefix helper.", count: 1 },
  { file: "src/page-builder/media-insert.ts", match: { rule: "media-url", function: "insertedImagePage" }, reason: "Slice 78: media, preview and page-link addresses use the shared site-prefix helper.", count: 1 },
  { file: "src/page-builder/media-library-details.ts", match: { rule: "root-template", function: "renderPreview" }, reason: "Slice 78: media, preview and page-link addresses use the shared site-prefix helper.", count: 1 },
  { file: "src/page-builder/media-markup.ts", match: { rule: "media-url", function: "<top-level>" }, reason: "Slice 78: media, preview and page-link addresses use the shared site-prefix helper.", count: 2 },
  { file: "src/page-builder/media-markup.ts", match: { rule: "media-url", function: "mediaSrcset" }, reason: "Slice 78: media, preview and page-link addresses use the shared site-prefix helper.", count: 1 },
  { file: "src/page-builder/media-markup.ts", match: { rule: "media-url", function: "mediaImageMarkup" }, reason: "Slice 78: media, preview and page-link addresses use the shared site-prefix helper.", count: 1 },
  { file: "src/page-builder/media-page-markup.ts", match: { rule: "media-url", function: "<top-level>" }, reason: "Slice 78: media, preview and page-link addresses use the shared site-prefix helper.", count: 1 },
  { file: "src/page-builder/media-page-markup.ts", match: { rule: "media-url", function: "prepareMediaPath" }, reason: "Slice 78: media, preview and page-link addresses use the shared site-prefix helper.", count: 5 },
  { file: "src/page-builder/media-page-markup.ts", match: { rule: "media-url", function: "placeMediaPath" }, reason: "Slice 78: media, preview and page-link addresses use the shared site-prefix helper.", count: 2 },
  { file: "src/page-builder/media-references.ts", match: { rule: "media-url", function: "<top-level>" }, reason: "Slice 78: media, preview and page-link addresses use the shared site-prefix helper.", count: 1 },
  { file: "src/page-builder/media-references.ts", match: { rule: "media-url", function: "rewriteMediaReferences" }, reason: "Slice 78: media, preview and page-link addresses use the shared site-prefix helper.", count: 1 },
  { file: "src/page-builder/media-rename.ts", match: { rule: "root-concatenation", function: "add" }, reason: "Slice 78: renamed media addresses follow the site prefix.", count: 1 },
  { file: "src/page-builder/media-rename.ts", match: { rule: "root-concatenation", function: "address" }, reason: "Slice 78: media, preview and page-link addresses use the shared site-prefix helper.", count: 1 },
  { file: "src/page-builder/native-elements.ts", match: { rule: "root-template", function: "nativeElementMarkup" }, reason: "Slice 78: media, preview and page-link addresses use the shared site-prefix helper.", count: 1 },
  { file: "src/page-builder/online-video.ts", match: { rule: "root-template", function: "onlineVideoHref" }, reason: "Slice 78: media, preview and page-link addresses use the shared site-prefix helper.", count: 1 },
  { file: "src/page-builder/online-video.ts", match: { rule: "media-url", function: "<top-level>" }, reason: "Slice 78: media, preview and page-link addresses use the shared site-prefix helper.", count: 1 },
  { file: "src/page-builder/online-video.ts", match: { rule: "media-url", function: "onlineVideoMarkup" }, reason: "Slice 78: media, preview and page-link addresses use the shared site-prefix helper.", count: 1 },
  { file: "src/page-builder/online-video.ts", match: { rule: "media-url", function: "stillTag" }, reason: "Slice 78: media, preview and page-link addresses use the shared site-prefix helper.", count: 1 },
  { file: "src/page-builder/online-video.ts", match: { rule: "media-url", function: "swapOnlineVideoStillInPage" }, reason: "Slice 78: media, preview and page-link addresses use the shared site-prefix helper.", count: 1 },
  { file: "src/page-builder/outside-pictures.ts", match: { rule: "media-url", function: "<top-level>" }, reason: "Slice 78: media, preview and page-link addresses use the shared site-prefix helper.", count: 1 },
  { file: "src/page-builder/outside-pictures.ts", match: { rule: "media-url", function: "rewriteOutsidePicturesPlan" }, reason: "Slice 78: media, preview and page-link addresses use the shared site-prefix helper.", count: 1 },
  { file: "src/page-builder/player-markup.ts", match: { rule: "media-url", function: "<top-level>" }, reason: "Slice 78: media, preview and page-link addresses use the shared site-prefix helper.", count: 1 },
  { file: "src/page-builder/player-markup.ts", match: { rule: "media-url", function: "subtitleMarkup" }, reason: "Slice 78: media, preview and page-link addresses use the shared site-prefix helper.", count: 1 },
  { file: "src/page-builder/player-markup.ts", match: { rule: "media-url", function: "videoMarkup" }, reason: "Slice 78: media, preview and page-link addresses use the shared site-prefix helper.", count: 2 },
  { file: "src/page-builder/player-markup.ts", match: { rule: "media-url", function: "audioMarkup" }, reason: "Slice 78: media, preview and page-link addresses use the shared site-prefix helper.", count: 1 },
  { file: "src/page-builder/player-markup.ts", match: { rule: "media-url", function: "downloadCardMarkup" }, reason: "Slice 78: media, preview and page-link addresses use the shared site-prefix helper.", count: 2 },
  { file: "src/page-builder/player-markup.ts", match: { rule: "root-attribute", function: "addMediaPlayerLinks" }, reason: "Slice 78: media, preview and page-link addresses use the shared site-prefix helper.", count: 2 },
  { file: "src/page-builder/replace-everywhere.ts", match: { rule: "root-concatenation", function: "address" }, reason: "Slice 78: media, preview and page-link addresses use the shared site-prefix helper.", count: 1 },
  { file: "src/page-builder/site-navigation.ts", match: { rule: "root-attribute", function: "readNavigation" }, reason: "Read/compare authored home links; slice 78 moves prefix interpretation to sitePathOf.", count: 2 },
  { file: "src/page-builder/site-navigation.ts", match: { rule: "root-attribute", function: "editNavigation" }, reason: "Slice 78: media, preview and page-link addresses use the shared site-prefix helper.", count: 1 },
  { file: "src/page-builder/social-image.ts", match: { rule: "media-url", function: "<top-level>" }, reason: "Slice 78: media, preview and page-link addresses use the shared site-prefix helper.", count: 1 },
  { file: "src/page-builder/social-image.ts", match: { rule: "media-url", function: "socialImageAddress" }, reason: "Slice 78: media, preview and page-link addresses use the shared site-prefix helper.", count: 1 },
  { file: "src/page-builder/video-details.ts", match: { rule: "media-url", function: "<top-level>" }, reason: "Slice 78: media, preview and page-link addresses use the shared site-prefix helper.", count: 1 },
  { file: "src/page-builder/video-details.ts", match: { rule: "media-url", function: "setPosterInPage" }, reason: "Slice 78: media, preview and page-link addresses use the shared site-prefix helper.", count: 1 },
  { file: "shared/native-routes.ts", match: { rule: "root-template", function: "nativePageRoute" }, reason: "Slice 79: page-route addresses follow the site prefix.", count: 2 },
  { file: "shared/native-routes.ts", match: { rule: "root-template", function: "nativeLinkTarget" }, reason: "Read/compare route targets; slice 79 moves prefix interpretation to sitePathOf.", count: 1 },
  { file: "shared/starting-point.ts", match: { rule: "root-attribute", function: "blankSiteFiles" }, reason: "Slice 78: new-site stylesheet and home links follow the site prefix.", count: 2 },
];
const files = [...sourceFiles("src"), ...sourceFiles("shared")].filter(file => /\.(?:ts|js)$/.test(file) && file !== "shared/site-path-prefix.ts");
const hits = files.flatMap(file => detectors.flatMap(detect => detect(readSource(file), file)));

const FAKE = "src/fake.ts";
test("root templates detect direct substitutions", () => {
  for (const source of ['const a = `/${path}`;', 'const a = `/${a}/${b}`;'])
    assert.equal(rootTemplates(source, FAKE).length, 1, source);
});
test("root concatenations detect slash literals", () => {
  for (const source of ['const a = "/" + path;', "const a = '/' + path;", 'const a = ("/") + path;'])
    assert.equal(rootConcatenations(source, FAKE).length, 1, source);
});
test("mediaUrl references count imports, calls and aliases, excluding its declaration", () => {
  for (const source of ['mediaUrl(path);', 'const build = mediaUrl;', 'import { mediaUrl } from "./media";', 'media.mediaUrl(path);', 'const { mediaUrl: build } = media;'])
    assert.ok(mediaBuilders(source, FAKE).length > 0, source);
  assert.deepEqual(mediaBuilders('export const mediaUrl = (path) => path;', FAKE), []);
  assert.deepEqual(mediaBuilders('export function mediaUrl(path) { return path; }', FAKE), []);
});
test("root HTML attributes detect strings and template pieces, including the home link", () => {
  for (const source of [
    'const a = \'<script src="/loader.js"></script>\';', 'const a = `<a href="/">Home</a>`;',
    'const a = `<p>${text}</p><link href="/site.css">`;', 'const a = `<img src="/${path}">`;', 'const a = "<img src=\'/x\'>";',
    "const a = `<img src=\"/it's.webp\">`;",
  ]) assert.equal(rootAttributes(source, FAKE).length, 1, source);
  assert.equal(rootAttributes('const a = `<img src="/x"><a href="/">`;', FAKE).length, 2);
});
test("detectors permit helper calls and ignore comments, unrelated literals and protocol-relative attributes", () => {
  for (const source of [
    'siteAddress(path, prefix); withSitePrefix(route, prefix); sitePathOf(address, { prefix });',
    '// const a = `/${path}`; mediaUrl(path); href="/x"',
    'const a = "/relative"; const b = `//${host}`; const c = "https://" + host;',
    'const a = `<img src="//host/x"><a href="https://host/x">`;',
    'path.endsWith("/" + value);', 'const a = `<p>src</p>`;', 'const a = `<p data-href="/x" data-src="/x">`;',
  ]) assert.deepEqual(detectors.flatMap(detect => detect(source, FAKE)), [], source);
});
test("root-address writers and readers have only measured migration exceptions", () => {
  assert.ok(files.includes("shared/starting-point.ts"));
  assert.ok(files.includes("src/components/native-preview-runtime.js"));
  assert.deepEqual(unallowed(hits, allowlist), []);
});
test("every migration exception still matches its exact count", () => {
  assert.deepEqual(staleEntries(hits, allowlist), []);
});
