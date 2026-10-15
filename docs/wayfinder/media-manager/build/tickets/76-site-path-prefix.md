---
title: The site's path prefix
type: task (AFK)
status: closed
assignee: claude (mm-76 runner)
blocked_by: [55-agents-tidy, 69-agents-video-audio, 75-agents-improve-images]
builder: sol
phase: 7
---

## What

Lex's handoff decision 7: follow the site's address. No base-path notion exists today.

- From Site settings' full address (`.editor/config.json`, for example `https://user.github.io/my-site/`), derive the path prefix (`/my-site`); none for a site at a domain root (techies.review, the starter), so those are unchanged.
- One shared helper turns a repository path into the address the editor writes (`/my-site/media/images/x.webp`), and one reads an address back to a repository path, accepting both prefixed and unprefixed root links and full own-domain addresses.
- A source guard (`tests/support/source-guard.ts`) lists today's root-address writers and will require them to use the helper as slices 78–79 convert them.

## Done when

- `tests/site-path-prefix.test.ts`: prefixes from many address forms (trailing slash or not, `index.html`, ports, no address), write and read round trips, domain-root sites unchanged.

## Done (2026-10-15)
- **Behaviour.** Nothing changes for sites at a domain root (the starter, techies.review): no writer uses the helper yet.
  - **Helper** `shared/site-path-prefix.ts`: `sitePathPrefix(siteUrl)` gives `/my-site` from `https://user.github.io/my-site/` (trailing slash or not, `index.html`, ports, query/hash ignored; `""` for no, unusable or domain-root addresses; percent-encoded like `URL.pathname`). `siteAddress(path, prefix)` writes a repository path as a root address (with `""` exactly `mediaUrl`'s output); `withSitePrefix(root, prefix)` prefixes a root address or route once, keeping query and `#`. `sitePathOf(address, { prefix?, url?, origins? })` reads prefixed and unprefixed root links and full addresses on the site's own origin back to a decoded repository path; the prefix matches on segment boundaries and is compared decoded; relative, outside, protocol-relative, malformed and escaping addresses give undefined.
  - **Source guard** `tests/site-path-prefix-guard.test.ts` (on `tests/support/source-guard.ts`): root templates (`` `/${…}` ``), `"/" + x`, `mediaUrl` references and root `src="/…"`/`href="/…"` literals in `src/` and `shared/`. Its allowlist is the migration inventory (83 hits in 30 files, each naming slice 78 or 79); slice 78's Done-when empties it.
  - **Site address field (lead note).** Site settings had no field for the address. General › Site identity now has **Site address** (`.editor/config.json` `site.url`, the key publishing setup writes) with "Where your site lives, like https://name.github.io/my-site/". It is checked only when changed: blank removes the key (a site without one gains none), `https://` is added when left out, and an address with spaces, another scheme, a login, a query, a `#` part or no dotted host is refused ("Enter your site's full web address, like https://name.github.io/my-site/. Nothing was applied."). A Social image chosen in the same Apply uses the new address. Slice 36's no-address note now reads "… Add it in Site settings, General, Site address, then choose the image again." Slices 74/95 read `site.url` as before.
- **Commits.** 97245603 claim; 2bcfe265 helper and guard (Sol); 4ef4a563 Site address field (runner); b7f9b682 review fix; this close.
- **Tests.** New `tests/site-path-prefix.test.ts` (9 tests: address forms, round trips with spaces/unicode/`#`/`?`/`%`, domain-root byte identity with `mediaUrl`, prefix once, read-back boundaries, own origin with ports, rejections, encoding-insensitive prefixes) and `tests/site-path-prefix-guard.test.ts`. `tests/site-identity.test.ts` +3 (reading, the field's rule, writing/keeping/removing the key). Browser: `native-site-settings.spec.ts` "set, check and undo the site address"; `native-social-image.spec.ts` "a site address set in the same Apply gives the sharing copy its full address, with one Undo". Ran `npm run check`, `npm run lint`, unit 3,291/3,291 (before the review tests); site settings, social image, settings layout and setup checklist specs 34/34, then site settings and social image 23/23 after the review fix. Screenshots (desktop, phone): `/home/ubulex/Projects/native-site-editor/.scratch/shots/mm-76/`.
- **Review (GPT-6.1 Sol, read-only), 1 round.** Evidence: `/home/ubulex/Projects/native-site-editor/.scratch/reviews/mm-76/round-1/` (run.log: model gpt-6.1-sol, sandbox read-only; result.md `REVIEW_STATUS: complete`). Fixed 1 (P2): `/café/` vs `/caf%c3%a9/` prefixes were not matched on read-back; now compared decoded. Both validation gaps closed (encoding cases; one Apply with address and Social image). Rejected 0. Not re-reviewed: a small, tested fix.
- **Bytes.** `test:budget` 351 KB gzip of 355 KB. Boot delta about +0.05 KB (the longer note text); the field and its rule are in the lazy settings chunk; the helper is not imported by app code yet.
- **Follow-ups.** Slice 78: `sitePathOf` also reads a full address on the site's origin outside the prefix (e.g. another project site on `user.github.io`) as this site's file, like an unprefixed root link; decide there whether full addresses must carry the prefix. Slice 80: changing the address rewrites addresses; today Site settings only stores it.
