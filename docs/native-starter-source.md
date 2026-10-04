# Native starter source

The Starter site normally comes from the template repository
(`techiesreviews/native-site-editor-starter`, branch `main`) as a codeload
tarball. An editor can instead use the native static Starter vendored into
its own assets by setting `STARTER_SOURCE`:

| `STARTER_SOURCE` | Starter site |
| --- | --- |
| unset | template repository tarball (production and generic deploys) |
| `native-static` | `public/native-static-starter/v6a9ca44/`, read through `ASSETS` only |
| anything else | Create site and Start your site fail with a clear error |

Both entry points, Create site (`POST /api/repositories` with
`startingPoint: "starter"`) and Start your site (`GET /api/starter`), use the
same resolver, `starterProvider` in `worker/starter.ts`. A blank page never
reads a starter.

Only `wrangler.preview.jsonc` sets `native-static`. To try it locally:

```sh
npx wrangler dev --var STARTER_SOURCE:native-static
```

## The vendored files

`v6a9ca44` is starter commit `6a9ca44`: six ready routes (`index.html`,
`about/`, three `work/` pages, `404.html`), `styles/`, `images/` and
`robots.txt`, copied byte for byte. Each file is stored as
`files/<path>.asset` so asset HTML handling cannot redirect or rewrite it.
`manifest.json` lists every file with its size and SHA-256, and carries
`.editor/config.json` inline. The worker checks the manifest (version, safe
unique paths, counts and sizes) and every file's size and checksum, then
prepares the files like the template's (site name in the settings, test host
and noindex taken out). Damage is an error; there is no fallback to the
template.

To move to a new starter version, add a new `v<sha>` folder from the
starter's tracked website files and update `NATIVE_STARTER_VERSION`.
