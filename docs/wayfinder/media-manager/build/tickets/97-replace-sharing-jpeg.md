---
title: Replace everywhere gives sharing tags a JPEG of the new picture
type: task (AFK)
status: open
assignee: claude (mm-97 runner)
blocked_by: [95-avif-sharing-copy]
builder: sol
phase: 4
---

## What

Follow-up from slice [95](95-avif-sharing-copy.md#done-2026-10-15) (1db840bb, review finding 2 and "Follow-ups"). Improve images now gives `og:image`/`twitter:image` a same-size JPEG (`<main>-sharing.jpg`, quality 82) on AVIF/WebP sites, because LinkedIn and Facebook do not show WebP or AVIF sharing pictures. Replace everywhere (slices [53](53-replace-everywhere.md#done-2026-10-14) and [54](54-rename-and-replace-in-details.md#done-2026-10-14), agents in 55) has the same gap: it points every mention of the old family, sharing tags included, at the new main. When the new picture is AVIF or WebP, those sharing tags then name a file LinkedIn and Facebook cannot show, and a written `og:image:type` stays `image/jpeg`.

- **Which tags.** Every own-site `og:image`, `og:image:url`, `og:image:secure_url` and `twitter:image` (`property` or `name`) that Replace everywhere repoints. That covers tags that mention the old main, its copies, its kept original, its family's `-sharing.jpg` (slice 95), or a Trimmed copy that slice 53 switches to the new family, including a slice 36 `-social.jpg` made from the old picture. JSON-LD, sample code, outside addresses and every other mention keep slice 53's rules (new main, copies, version mark).
- **AVIF or WebP replacement.** Those tags go to `<new main's stem>-sharing.jpg` at a **full address** from the site's address (slice 36's `socialImageAddress`). With no site address they get a root link, and the result message adds slice 36's no-address note. A matching `og:image:type`, `og:image:width` or `og:image:height` after `og:image` follows: `image/jpeg` and the JPEG's size (as slice 95 does).
- **The JPEG.** Made the way slice 95 makes it, reusing its code (pull slice 95's inline sharing-JPEG step in `improve-heavy.ts` into one shared helper both use; Improve images' behaviour does not change). It is made from the best bytes the replace has ★: the kept original when one is passed, otherwise the new main, at the new main's width and height, never cropped or enlarged, quality 82, transparency on white (`plainJpeg`), no copies, no kept original. Its record is `sharing: true`, so it joins the new main's family (slice 95's `MediaFamily.sharing`) and the Social image picker reuses it. Unlike slice 95 there is no "not lighter" check ★: the old picture leaves anyway, so the tags must name something sharing services can show.
- **Names.** Same name and type (`hero.avif` → `hero.avif`): the old `hero-sharing.jpg`, when there is one, is overwritten in place (slice 53's `overwrites`), so its address stays and gets the version mark; there is none to overwrite when it did not exist. A type change (`hero.jpg` → `hero.webp`): the JPEG is `hero-sharing.jpg`; when that name is taken by a file outside the old family, the replace refuses with "… is taken. Nothing was replaced." (slice 53's rule for taken names ★). It is made only when at least one sharing tag needs it.
- **JPEG or PNG replacement.** No JPEG is made. Sharing tags go to the new main as today, and a matching `og:image:type`/`width`/`height` follows the new main (`image/png` for a PNG). The old family's `-sharing.jpg` leaves with the old family.
- **Families, Recently removed, Undo.** Everything stays one batch and one Undo step ("Replace everywhere"). The old family (its `-sharing.jpg` included) still goes to Recently removed as one entry; restoring it while the address is taken refuses as today. Trimmed copies that nothing mentions afterwards (a `-social.jpg` included) still go to Recently removed in the same batch. Undo removes the new JPEG and puts every tag back.
- **Site address.** The replace reads the site's address from the config (`site.url`) in the same batch, so details (slice 54) and agents (slice 55) get it without new arguments; a config changed meanwhile refuses like any other source.
- **Boot.** New code stays in the lazy workspace, `replace-everywhere` and worker chunks.

## Done when

- `tests/replace-everywhere.test.ts` (or the workspace tests where pixels are needed): an AVIF and a WebP replacement point own-site `og:image`, `og:image:url`, `og:image:secure_url` and `twitter:image` at `<stem>-sharing.jpg` at a full address, with `og:image:type/width/height` following. The JPEG is a JPEG at the new main's size, made from the kept original when given. No site address gives a root link plus the note. Same-name replace overwrites the old `-sharing.jpg` with a version mark. Type change makes a new one, and a taken name refuses. A tag that pointed at the old `-sharing.jpg`, at a copy, or at a `-social.jpg` of the old picture follows. A JPEG or PNG replacement makes no JPEG, and its `og:image:type` follows the new main. Outside addresses, JSON-LD and non-sharing mentions keep slice 53's behaviour.
- `tests/media-workspace.test.ts`: one batch and one Undo for the whole replace, the JPEG included. The old family (with its `-sharing.jpg`) is in Recently removed as one entry. Undo removes the new JPEG and restores every tag. The config's address is read in the batch.
- `tests/improve-heavy.test.ts` stays green unchanged (the shared helper keeps slice 95's behaviour).
- `npm run check`, unit, lint, and the media rename/replace, media library and social image specs stay green. Boot grows by well under 1 KB.
