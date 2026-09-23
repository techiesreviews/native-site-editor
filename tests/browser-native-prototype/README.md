# Browser-native preview prototype

Throwaway prototype for checking whether a browser-native preview runtime can cover the small slice that currently motivates Astro: routes, shared header/footer/card templates, and quick HTML/CSS editing without iframe reloads or scroll jumps.

Open through the existing dev server:

```txt
http://127.0.0.1:5190/tests/browser-native-prototype/index.html
```

Scope:

- One self-contained HTML file.
- No dependencies, framework, compiler, or network calls.
- In-memory state only. Refresh resets the prototype.
- `site-header`, `site-footer`, and `project-card` are native Custom Elements.
- Home/About use hash routing so browser Back/Forward can be felt. This is route proof only, not a production SEO design.
- Source edits update an existing sandboxed iframe through `postMessage`. The iframe is initialized with `srcdoc` once.
- CSS updates replace stylesheet text. HTML/template updates use a small keyed same-tag DOM reconcile.
- The iframe uses `sandbox="allow-scripts"` (never `allow-same-origin`) so only the prototype's own runtime script runs. Form submits and top-level link navigation are blocked except the demo routes.
- Edited HTML and templates are sanitized before rendering: `<script>` elements, `on*` event attributes, `javascript:` URLs, and `<meta http-equiv="refresh">` are stripped. This is a prototype guard, not a general-purpose sanitizer.

Useful checks:

- Edit `site.css`; visual style changes without frame load count increasing.
- Scroll the preview, edit page HTML, and check that scroll stays put.
- Edit `Header template`; both routes share the new header.
- Edit `Card template`; both Home cards update from the same template.
- Use preview Home/About links and browser Back/Forward.

Limits:

- `<script>` tags, `on*` handlers, and `javascript:` URLs in edited HTML are stripped before render; this prototype guard is not a general-purpose sanitizer.
- The `input-to-update estimate` metric spans from the input event through the parent frame queue to the preview's render ack. It is a rough latency estimate, not a precise paint measurement.
- No saving, files, GitHub, migration, production routing, or production security model.
- DOM reconcile is intentionally tiny and bounded for this prototype.
