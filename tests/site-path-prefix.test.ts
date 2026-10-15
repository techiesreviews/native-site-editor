import assert from "node:assert/strict";
import { test } from "node:test";
import { sitePathPrefix, siteAddress, withSitePrefix, sitePathOf, siteRouteOf } from "../shared/site-path-prefix.ts";
const mediaUrl = (path: string) => `/${path.split("/").map(encodeURIComponent).join("/")}`;

const paths = ["", "media/images/x.webp", "hello world.txt", "日本語/été.webp", "a#b/c?d", "100%.pdf", "a/%20/# ?%.webp", "my-site/x.webp"];

test("site prefix follows encoded folders across full address forms", () => {
  for (const [url, expected] of [
    ["https://u.github.io/my-site/", "/my-site"], ["https://u.github.io/my-site", "/my-site"],
    ["https://u.github.io/my-site/index.html", "/my-site"], ["https://u.github.io/my-site/index.htm", "/my-site"],
    ["http://EXAMPLE.COM:8080/my-site/?x=1#hi", "/my-site"], ["https://x.test/a/b/index.html?x#y", "/a/b"],
    ["https://x.test//a///b//", "/a/b"], ["https://x.test/a b/日本語/", "/a%20b/%E6%97%A5%E6%9C%AC%E8%AA%9E"],
    ["https://x.test/a%20b/%25/", "/a%20b/%25"], ["https://x.test/index.html/", ""],
    ["https://x.test/folder.html", "/folder.html"], [" https://x.test/a/ ", "/a"],
  ]) assert.equal(sitePathPrefix(url), expected, url);
});

test("domain roots and missing or unusable addresses have no prefix", () => {
  for (const url of [undefined, "", "garbage", "/relative", "//host/a", "ftp://host/a", "mailto:a@b.test", "https://user:pass@host/a", "https://user@host/a", "https://:pass@host/a", "https://techies.review", "https://techies.review/", "http://localhost:8080/?x#y", "https://host/index.htm", "https://host///"])
    assert.equal(sitePathPrefix(url), "", url);
});

test("repository paths round trip with and without nested or encoded prefixes", () => {
  for (const prefix of ["", "/my-site", "/a/b", "/a%20b/%E6%97%A5"]) {
    for (const path of paths) assert.equal(sitePathOf(siteAddress(path, prefix), { prefix }), path, `${prefix}: ${path}`);
    assert.equal(siteAddress("", prefix), prefix + "/");
  }
  assert.equal(siteAddress("media/images/x.webp", "/my-site"), "/my-site/media/images/x.webp");
  // Repository folder names that happen to match the prefix still need the prefix added.
  assert.equal(siteAddress("my-site/x.webp", "/my-site"), "/my-site/my-site/x.webp");
});

test("domain-root writes remain byte-identical to mediaUrl", () => {
  for (const path of [...paths, "a//b", "/already-root", "!'()*"]) assert.equal(siteAddress(path, ""), mediaUrl(path));
  for (const address of ["/", "/about/", "/x?a#b", "x", "//host/x", "https://host/x", "mailto:x", "#x"])
    assert.equal(withSitePrefix(address, ""), address);
});

test("encoded routes get a prefix exactly once without changing query or fragment", () => {
  for (const [address, expected] of [
    ["/about/", "/my-site/about/"], ["/", "/my-site/"], ["/x?a#b", "/my-site/x?a#b"],
    ["/a%20b", "/my-site/a%20b"], ["/my-site", "/my-site"], ["/my-site/", "/my-site/"],
    ["/my-site?x#y", "/my-site?x#y"], ["/my-site/x", "/my-site/x"], ["/my-site-old/x", "/my-site/my-site-old/x"],
  ]) assert.equal(withSitePrefix(address, "/my-site"), expected, address);
  for (const address of ["", "relative", "../x", "//host/x", "https://host/x", "mailto:x", "#x", "?x"])
    assert.equal(withSitePrefix(address, "/my-site"), address);
});

test("read-back accepts prefixed and legacy roots with segment boundaries", () => {
  for (const [address, expected] of [
    ["/my-site/media/x.webp", "media/x.webp"], ["/media/x.webp", "media/x.webp"],
    ["/my-site", ""], ["/my-site/", ""], ["/", ""], ["/my-site?x#y", ""],
    ["/my-site/a%20b/%23%3F%25?query#hash", "a b/#?%"], ["/my-site-old/x", "my-site-old/x"], ["/my-site//x", "x"], ["/my-site/%2Fx", "x"],
    ["/my-site/a/../b", "b"],
  ]) assert.equal(sitePathOf(address, { prefix: "/my-site" }), expected, address);
});

test("site address alone supplies own origin and prefix, including ports", () => {
  const site = { url: "https://EXAMPLE.com:8443/my-site/index.html?x#y", origins: new Set(["http://localhost:8080"]) };
  for (const address of ["https://example.com:8443/my-site/media/x.webp?x#y", "http://localhost:8080/my-site/media/x.webp", "/my-site/media/x.webp", "/media/x.webp"])
    assert.equal(sitePathOf(address, site), "media/x.webp", address);
  assert.equal(sitePathOf("https://example.com:8443/my-site/", site), "");
  assert.equal(sitePathOf("https://example.com/media/x.webp", site), undefined);
  assert.equal(sitePathOf("https://other.test/media/x.webp", site), undefined);
  assert.equal(sitePathOf("https://example.com/x", { prefix: "" }), undefined);
  assert.equal(sitePathOf("https://example.com/x", { url: "https://example.com" }), "x");
});

test("a full address on the site's host outside its folder belongs to another site there", () => {
  const site = { url: "https://user.github.io/my-site/" };
  for (const address of ["https://user.github.io/other-site/x.png", "https://user.github.io/x.png", "https://user.github.io/", "https://user.github.io/my-site-old/x.png", "https://user.github.io/media/x.png"])
    assert.equal(sitePathOf(address, site), undefined, address);
  assert.equal(sitePathOf("https://user.github.io/other-site/x.png", { prefix: "/my-site", origins: ["https://user.github.io"] }), undefined);
  assert.equal(sitePathOf("https://user.github.io/my-site/x.png", site), "x.png");
  assert.equal(sitePathOf("https://user.github.io/my-site", site), "");
  // Root links stay this site's, with or without the prefix; a domain-root site reads every path on its host.
  assert.equal(sitePathOf("/other-site/x.png", site), "other-site/x.png");
  assert.equal(sitePathOf("https://user.github.io/other-site/x.png", { url: "https://user.github.io/" }), "other-site/x.png");
});

test("read-back rejects non-root links, malformed encoding and decoded escapes", () => {
  const site = { url: "https://example.com/my-site/" };
  for (const address of ["", "x.webp", "../x", "#x", "?x", "//example.com/x", "ftp://example.com/x", "mailto:a@b", "/%", "/%E0%A4%A", "/../x", "/%2e%2e/x", "/my-site/../x", "/my-site/%2e%2e/x", "/my-site/a/../../x", "/my-site//../x", "/my-site/a//../../x", "/my-site/a%2f..%2f../x", "/my-site/..%5cx", "https://example.com/my-site/../x", "https://example.com/../../x", "https://example.com/my-site/%2e%2e/x", "https://user:pass@example.com/my-site/x"])
    assert.equal(sitePathOf(address, site), undefined, address);
});

test("read-back matches a prefix however its characters are encoded", () => {
  const url = "https://x.test/café/";
  assert.equal(sitePathPrefix(url), "/caf%C3%A9");
  for (const address of ["https://x.test/café/media/x.webp", "https://x.test/caf%C3%A9/media/x.webp", "https://x.test/caf%c3%a9/media/x.webp",
    "/café/media/x.webp", "/caf%C3%A9/media/x.webp", "/caf%c3%a9/media/x.webp", "/media/x.webp"])
    assert.equal(sitePathOf(address, { url }), "media/x.webp", address);
  assert.equal(sitePathOf("/caf%c3%a9", { url }), "");
  assert.equal(sitePathOf("/cafés/x.webp", { url }), "cafés/x.webp");
  assert.equal(sitePathOf("/caf%c3%a9/../../x", { url }), undefined);
});

test("siteRouteOf reads an address as a root route", () => {
  assert.equal(siteRouteOf("/my-site/about/", { prefix: "/my-site" }), "/about/");
  assert.equal(siteRouteOf("/about/", { prefix: "/my-site" }), "/about/");
  assert.equal(siteRouteOf("/my-site", { prefix: "/my-site" }), "/");
  assert.equal(siteRouteOf("https://user.github.io/my-site/media/x.png", { url: "https://user.github.io/my-site/" }), "/media/x.png");
  assert.equal(siteRouteOf("about/", { prefix: "/my-site" }), undefined);
  assert.equal(siteRouteOf("/../x", { prefix: "/my-site" }), undefined);
});
