import { readFile } from "node:fs/promises";
import { resolve, extname, sep } from "node:path";
import { expect, test } from "@playwright/test";
import { requireActualFixture } from "./fixture-contract";
import { sampleContrast, type ContrastSample } from "./tone-contrast";

requireActualFixture();

const origin = "http://starter-tones.test";
const fixture = resolve("fixtures/actual-starter");
const brands = ["starter", ...Array.from({ length: 8 }, (_, i) => `oklch(0.61 0.12 ${i * 45})`),
  "#ffd400", "#0066cc", "#ff0000", "#808080", "oklch(0.7 0.3 150)"];
const tones = ["none", "light", "dark", "brand", "accent"];

// Home covers hero/feature/contact, plain sections, nested project/note cards,
// header/footer and slotted actions. About adds real plain hero/prose/contact.
// No shipped page uses intro/split/quote, .btn/.cta/.steps or forms. Mount those
// in the home DOM only, using the real component loader, templates and CSS.
const extraCases = `
  <section-intro></section-intro>
  <section-split></section-split>
  <section class="flow" id="tone-extra-cases">
    <card-quote></card-quote>
    <a class="btn" href="/about/">A plain button</a>
    <div class="cta"><a href="/about/">Primary action</a><a href="/">Secondary action</a></div>
    <ol class="steps"><li><h3>First step</h3><p>Step description</p></li></ol>
    <form><label>Name <input value="Sample name"></label>
      <label>Message <textarea>Sample message</textarea></label>
      <label>Choice <select><option>First choice</option></select></label>
      <button class="btn" type="button">Send message</button>
      <button class="btn" type="button" disabled>Disabled action</button>
    </form>
  </section>`;

test("starter tones keep text and filled controls accessible across brands and schemes", { tag: "@actual" }, async ({ page }) => {
  test.setTimeout(60_000);
  let fallback = false;
  const failures: string[] = [];
  const worst = { text: Infinity, fill: Infinity };
  const counts = { text: 0, fill: 0 };
  const coverage = new Set<string>();
  const nativeText = "@supports (color: contrast-color(red))";
  // Without this condition the fallback pass would silently test the native text again.
  expect(await readFile(resolve(fixture, "styles/tones.css"), "utf8")).toContain(nativeText);
  await page.route(`${origin}/**`, async route => {
    const url = new URL(route.request().url());
    const path = resolve(fixture, `.${decodeURIComponent(url.pathname)}${url.pathname.endsWith("/") ? "index.html" : ""}`);
    if (!path.startsWith(`${fixture}${sep}`)) return route.fulfill({ status: 403 });
    const mime: Record<string, string> = { ".html": "text/html", ".css": "text/css", ".js": "text/javascript", ".svg": "image/svg+xml", ".png": "image/png" };
    try {
      let body = await readFile(path);
      // Also exercise the shipped computed-text fallback: Chromium supports
      // contrast-color(), whose black/white choice can mask a missing nudge.
      // Disable only that @supports condition; leave all formulas unchanged.
      if (fallback && path.endsWith(`${sep}tones.css`)) body = Buffer.from(body.toString().replace(nativeText, "@supports (color: --test-computed-text-fallback)"));
      await route.fulfill({ body, contentType: mime[extname(path)] ?? "application/octet-stream" });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      await route.fulfill({ status: 404 });
    }
  });

  for (const textMode of ["native", "computed fallback"]) {
    fallback = textMode === "computed fallback";
    for (const path of ["/", "/about/"]) {
      await page.goto(`${origin}${path}`);
      // The native pass must really take the contrast-color() branch.
      if (!fallback) expect(await page.evaluate(() => CSS.supports("color", "contrast-color(red)"))).toBe(true);
      if (path === "/") await page.locator("main").evaluate((main, html) => main.insertAdjacentHTML("beforeend", html), extraCases);
      // A definition alone is insufficient: wait for nested templates and every
      // shadow stylesheet, including the loader's dynamically inserted cases.
      await expect.poll(() => page.evaluate(() => {
        const ready = (root: Document | ShadowRoot): boolean => [...root.querySelectorAll("*")].every(element => {
          if (element.localName.includes("-") && (!element.shadowRoot || !element.matches(":defined"))) return false;
          if (element instanceof HTMLLinkElement && element.rel === "stylesheet" && !element.sheet) return false;
          return !element.shadowRoot || ready(element.shadowRoot);
        });
        return ready(document);
      })).toBe(true);

      for (const scheme of ["light", "dark"] as const) {
        await page.emulateMedia({ colorScheme: scheme });
        const result = await page.evaluate(({ brands, tones, scheme }) => {
          const samples: ContrastSample[] = [];
          const covered = new Set<string>();
          const unsupported: string[] = [];
          const skipped = { image: 0, hidden: 0 };
          const canvas = document.createElement("canvas");
          canvas.width = canvas.height = 1;
          const context = canvas.getContext("2d", { colorSpace: "srgb", willReadFrequently: true })!;
          const colours = new Map<string, ContrastSample["foreground"]>();
          // Let the browser parse all CSS Color formats, convert to sRGB and
          // clip/gamut-map as it paints. Never assume computed colours are rgb().
          const pixel = (colour: string): ContrastSample["foreground"] => {
            const cached = colours.get(colour);
            if (cached) return cached;
            if (!CSS.supports("color", colour)) throw new Error(`Unparseable computed colour: ${colour}`);
            context.clearRect(0, 0, 1, 1);
            context.fillStyle = colour;
            context.fillRect(0, 0, 1, 1);
            const data = context.getImageData(0, 0, 1, 1).data;
            const parsed = { colour, rgba: [data[0] / 255, data[1] / 255, data[2] / 255, data[3] / 255] as [number, number, number, number] };
            colours.set(colour, parsed);
            return parsed;
          };
          // Walk the composed tree: assigned nodes replace fallback nodes; a
          // slotted node's ancestors pass through its slot, then the shadow host.
          const parent = (element: Element): Element | null => element.assignedSlot ?? element.parentElement ??
            (element.getRootNode() instanceof ShadowRoot ? (element.getRootNode() as ShadowRoot).host : null);
          const children = (element: Element): Node[] => {
            if (element instanceof HTMLSlotElement) {
              const assigned = element.assignedNodes({ flatten: true });
              return assigned.length ? assigned : [...element.childNodes];
            }
            return [...(element.shadowRoot ?? element).childNodes];
          };
          const walk = (element: Element): Element[] => [element, ...children(element).flatMap(node => node instanceof Element ? walk(node) : [])];
          const bands = [...document.querySelectorAll("site-header, main > *, site-footer")];
          const canvasProbe = document.createElement("span");
          canvasProbe.style.color = "Canvas";
          document.body.append(canvasProbe);
          const canvasPixel = pixel(getComputedStyle(canvasProbe).color);
          canvasProbe.remove();
          const backgrounds = (element: Element | null): ContrastSample["backgrounds"] => {
            const layers: ContrastSample["backgrounds"] = [];
            for (let current = element; current; current = parent(current)) {
              const layer = pixel(getComputedStyle(current).backgroundColor);
              if (layer.rgba[3] > 0) layers.push(layer);
              if (layer.rgba[3] === 1) return layers;
            }
            return [...layers, canvasPixel];
          };
          const visible = (element: Element) => {
            if (!element.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })) return false;
            for (let current: Element | null = element; current; current = parent(current)) {
              if (current.matches(":disabled, [hidden], [aria-disabled='true']") || getComputedStyle(current).opacity === "0") return false;
            }
            return true;
          };
          const describe = (element: Element, text: string) => `${element.localName}${element.id ? `#${element.id}` : ""}${[...element.classList].map(name => `.${name}`).join("")} ${JSON.stringify(text.replace(/\s+/g, " ").trim().slice(0, 65))}`;
          for (const brand of brands) {
            if (brand === "starter") document.documentElement.style.removeProperty("--brand");
            else document.documentElement.style.setProperty("--brand", brand);
            for (const tone of tones) {
              for (const band of bands) {
                if (tone === "none") band.removeAttribute("data-tone");
                else band.setAttribute("data-tone", tone);
              }
              for (const [index, band] of bands.entries()) {
                const bandName = `${index}:${band.localName}${band.id ? `#${band.id}` : ""}`;
                const elements = walk(band);
                const images = elements.filter(element => element.matches("img, svg, video, canvas") && visible(element)).map(element => element.getBoundingClientRect());
                // No named element exemptions: skip only text over a CSS image
                // (including gradients), or whose text rectangle overlaps a
                // rendered image/replaced element. Adjacent split images do not
                // exempt the content column. Hidden/disabled text is not painted.
                const overImage = (element: Element, textNodes: Node[]) => {
                  // An opaque background colour hides any image further out.
                  for (let current: Element | null = element; current; current = parent(current)) {
                    const style = getComputedStyle(current);
                    if (style.backgroundImage !== "none") return true;
                    if (pixel(style.backgroundColor).rgba[3] === 1) break;
                  }
                  return textNodes.some(node => {
                    const range = document.createRange();
                    range.selectNodeContents(node);
                    return [...range.getClientRects()].some(rect => images.some(image => rect.left < image.right && rect.right > image.left && rect.top < image.bottom && rect.bottom > image.top));
                  });
                };
                for (const element of elements) {
                  if (!visible(element)) { skipped.hidden++; continue; }
                  const style = getComputedStyle(element);
                  const ownNodes = children(element).filter(node => node.nodeType === Node.TEXT_NODE && node.textContent?.trim());
                  const controlText = element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement ? element.value :
                    element instanceof HTMLSelectElement ? element.selectedOptions[0]?.textContent ?? "" : "";
                  const text = ownNodes.map(node => node.textContent).join(" ") || controlText;
                  const add = (check: ContrastSample["check"], foreground: string, layers: ContrastSample["backgrounds"], label = text) => {
                    // Coverage counts what was measured (and the components and
                    // classes around it), not what was skipped.
                    for (let current: Element | null = element; current; current = parent(current)) {
                      covered.add(current.localName);
                      for (const name of current.classList) covered.add(`.${name}`);
                    }
                    // The samples model colours only: partial opacity, filters
                    // or blending would change the painted pixels, so refuse them.
                    for (let current: Element | null = element; current; current = parent(current)) {
                      const paint = getComputedStyle(current);
                      if (paint.opacity !== "1" || paint.filter !== "none" || paint.mixBlendMode !== "normal") {
                        unsupported.push(`${bandName} tone=${tone} brand=${brand} scheme=${scheme} ${describe(element, label)}: ${describe(current, "")} has opacity ${paint.opacity}, filter ${paint.filter}, blend ${paint.mixBlendMode}`);
                        return;
                      }
                    }
                    samples.push({ band: bandName, tone, brand, scheme, element: describe(element, label), check, foreground: pixel(foreground), backgrounds: layers });
                  };
                  if (text.trim()) {
                    if (overImage(element, ownNodes)) skipped.image++;
                    else add("text", style.color, backgrounds(element));
                  }
                  // Include filled component actions and button controls, not
                  // just .btn/.cta. Transparent secondary actions have no fill.
                  // The starter has no styled text fields: native input/select/
                  // textarea identify their edges with UA borders, not contrasting
                  // fills. Their text is checked above, not their default fill.
                  if (element.matches("a, button, input:is([type=button], [type=submit], [type=reset])") && pixel(style.backgroundColor).rgba[3] > 0) {
                    add("fill", style.backgroundColor, backgrounds(parent(element)));
                  }
                  // .steps generates its numbered disc with ::before; it has
                  // no DOM text node, but both the number and fill must pass.
                  const before = getComputedStyle(element, "::before");
                  if (before.content !== "none" && before.content !== "normal" && before.display !== "none") {
                    add("text", before.color, [pixel(before.backgroundColor), ...backgrounds(element)], `${text} ::before ${before.content}`);
                    if (pixel(before.backgroundColor).rgba[3] > 0) add("fill", before.backgroundColor, backgrounds(element), `${text} ::before`);
                  }
                }
              }
            }
          }
          return { samples, covered: [...covered], skipped, unsupported };
        }, { brands, tones, scheme });
        for (const name of result.covered) coverage.add(name);
        failures.push(...result.unsupported.map(line => `${path} text-mode=${textMode} unsupported paint: ${line}`));
        for (const sample of result.samples) {
          const { ratio, foreground, background } = sampleContrast(sample);
          counts[sample.check]++;
          worst[sample.check] = Math.min(worst[sample.check], ratio);
          // The canvas pixel is the 8-bit sRGB colour the screen shows, so the
          // thresholds apply as they are, without a tolerance.
          const minimum = sample.check === "text" ? 4.5 : 3;
          if (ratio < minimum) failures.push(`${path} text-mode=${textMode} band=${sample.band} tone=${sample.tone} brand=${sample.brand} scheme=${sample.scheme} ${sample.check} ${sample.element}: ${sample.foreground.colour} on [${sample.backgrounds.map(layer => layer.colour).join(" over ")}] => ${JSON.stringify(foreground)} / ${JSON.stringify(background)} = ${ratio.toFixed(3)}:1 (needs ${minimum})`);
        }
        console.log(`tones ${path} ${scheme} ${textMode}: ${result.samples.length} checks; skips ${JSON.stringify(result.skipped)}`);
      }
    }
  }
  for (const required of ["section", "section-hero", "section-feature", "section-intro", "section-split", "section-contact", "card-note", "card-project", "card-quote", "site-header", "site-footer", ".btn", ".cta", ".steps", "form", "input", "textarea", "select", "button"]) {
    if (!coverage.has(required)) failures.push(`Coverage missing: ${required}`);
  }
  console.log(`tones worst: text=${worst.text.toFixed(3)}:1 (${counts.text}), fill=${worst.fill.toFixed(3)}:1 (${counts.fill})`);
  expect(failures, failures.join("\n")).toEqual([]);
});
