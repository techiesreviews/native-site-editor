import { test } from "node:test";
import assert from "node:assert/strict";
import { readSiteIdentity, siteAddressInput, SITE_ADDRESS_PROBLEM, withSiteIdentityConfig, withSiteIdentityPage } from "../src/page-builder/site-identity";
import { readHeadSettings } from "../src/page-builder/site-head";
const home = '<head><title>Home</title><meta property="og:site_name" content="Studio"><meta property="og:image" content="/default.png"><link rel="icon" href="/favicon.svg"></head>';
test("site identity reads head defaults and respects configured default image", () => {
  assert.deepEqual(readSiteIdentity(undefined, home), { name: "Studio", favicon: "/favicon.svg", socialImage: "/default.png", url: "" });
  assert.equal(readSiteIdentity('{"site":{"socialImage":"/other.png"}}', home).socialImage, "/other.png");
});
test("unusable configured site values fall back to page metadata", () => {
  const fallback = readSiteIdentity(undefined, home);
  for (const config of ["null", '{"site":null}', '{"site":[]}', '{"site":"unexpected"}', "broken"]) {
    assert.deepEqual(readSiteIdentity(config, home), fallback);
  }
});
test("site config preserves unknown settings and refuses invalid JSON", () => {
  const next = JSON.parse(withSiteIdentityConfig('{"site":{"url":"https://example.com/"},"other":true}', { name: "Name", favicon: "", socialImage: "/card.png" }));
  assert.equal(next.other, true);
  assert.equal(next.site.url, "https://example.com/");
  assert.throws(() => withSiteIdentityConfig("invalid", { name: "", favicon: "", socialImage: "" }));
});
test("site-wide identity updates defaults and favicon but keeps custom social images", () => {
  const before = readSiteIdentity(undefined, home);
  const after = { name: "New studio", favicon: "/new.png", socialImage: "/new-card.png" };
  const head = readHeadSettings(withSiteIdentityPage(home, before, after));
  assert.equal(head.icon, "/new.png");
  assert.equal(head["og:image"], "/new-card.png");
  assert.equal(head.title, "Home");
  assert.equal(readHeadSettings(withSiteIdentityPage(home.replace("/default.png", "/custom.png"), before, after))["og:image"], "/custom.png");
});
test("site identity reads the site address as written", () => {
  assert.equal(readSiteIdentity('{"site":{"url":"https://name.github.io/my-site/"}}', home).url, "https://name.github.io/my-site/");
  assert.equal(readSiteIdentity('{"site":{"url":42}}', home).url, "");
});
test("the Site address field accepts full addresses and refuses obviously wrong ones", () => {
  for (const [typed, url] of [
    ["", ""], ["   ", ""],
    ["https://name.github.io/my-site/", "https://name.github.io/my-site/"],
    ["  https://name.github.io/my-site  ", "https://name.github.io/my-site"],
    ["name.github.io/my-site/", "https://name.github.io/my-site/"],
    ["techies.review", "https://techies.review/"],
    ["HTTP://Example.COM:8080/a/", "http://example.com:8080/a/"],
    ["http://localhost:4321/", "http://localhost:4321/"],
  ]) assert.deepEqual(siteAddressInput(typed), { url }, typed);
  for (const typed of ["my site", "not an address", "ftp://example.com/", "mailto:me@example.com", "https://me:pw@example.com/",
    "https://example.com/?a=1", "https://example.com/#top", "https://example.com/?", "https://", "example", "javascript:alert(1)"])
    assert.deepEqual(siteAddressInput(typed), { error: SITE_ADDRESS_PROBLEM }, typed);
});
test("site config writes, keeps and removes the address", () => {
  const identity = { name: "N", favicon: "", socialImage: "" };
  assert.equal(JSON.parse(withSiteIdentityConfig("{}", { ...identity, url: "https://name.github.io/my-site/" })).site.url, "https://name.github.io/my-site/");
  // No address and none typed: no key is added.
  assert.equal("url" in JSON.parse(withSiteIdentityConfig("{}", { ...identity, url: "" })).site, false);
  // Unchanged (not passed): kept as written.
  assert.equal(JSON.parse(withSiteIdentityConfig('{"site":{"url":"https://x.example"}}', identity)).site.url, "https://x.example");
  // Cleared: removed.
  assert.equal("url" in JSON.parse(withSiteIdentityConfig('{"site":{"url":"https://x.example"}}', { ...identity, url: "" })).site, false);
});
