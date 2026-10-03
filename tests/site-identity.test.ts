import { test } from "node:test";
import assert from "node:assert/strict";
import { readSiteIdentity, withSiteIdentityConfig, withSiteIdentityPage } from "../src/page-builder/site-identity";
import { readHeadSettings } from "../src/page-builder/site-head";
const home = '<head><title>Home</title><meta property="og:site_name" content="Studio"><meta property="og:image" content="/default.png"><link rel="icon" href="/favicon.svg"></head>';
test("site identity reads head defaults and respects configured default image", () => {
  assert.deepEqual(readSiteIdentity(undefined, home), { name: "Studio", favicon: "/favicon.svg", socialImage: "/default.png" });
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
