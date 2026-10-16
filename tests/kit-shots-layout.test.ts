import { test } from "node:test";
import assert from "node:assert/strict";
import { chromium, type Page } from "@playwright/test";
import { checkLayout, type LayoutFinding, type LayoutKind } from "../scripts/agents/shots/layout-check.ts";

test("shot layout checks in Chromium", async (t) => {
  const browser = await chromium.launch({ headless: true });
  const fixture = async (html: string, width = 1000, css = "", setup?: (page: Page) => Promise<void>): Promise<LayoutFinding[]> => {
    const page = await browser.newPage({ viewport: { width, height: 700 } });
    try {
      await page.setContent(`<!doctype html><html lang="en"><style>
        html { color: oklch(0 0 none); background: oklch(1 0 none); font: 16px Arial; }
        body { margin: 0; }
        button { inline-size: 48px; block-size: 48px; border: 0; padding: 0; color: inherit; background: oklch(1 0 none); font: inherit; }
        a { color: inherit; }
        ${css}
      </style><body>${html}</body></html>`);
      if (setup) await setup(page);
      const result = await checkLayout(page);
      // Every reported selector must resolve to exactly one top-document node.
      for (const finding of result) if (finding.selector) assert.equal(await page.locator(finding.selector).count(), 1, finding.selector);
      assert.deepEqual(await checkLayout(page), result, "deterministic order and details");
      return result;
    } finally { await page.close(); }
  };
  const only = (findings: LayoutFinding[], kind: LayoutKind) => {
    assert.deepEqual(findings.map((finding) => finding.kind), [kind]);
    return findings[0];
  };

  try {
    await t.test("clipped control reports the cutting ancestor and pixels", async () => {
      const finding = only(await fixture('<div class="panel"><button id="cut">Cut</button></div>', 1000, '.panel { inline-size: 60px; overflow: hidden; } #cut { inline-size: 72px; }'), "clipped");
      assert.deepEqual(finding, { kind: "clipped", selector: "#cut", text: "Cut", detail: "cut 12 px right by div.panel" });
    });

    await t.test("overlap reports each pair once", async () => {
      const finding = only(await fixture('<button id="one">One</button><button id="two">Two</button>', 1000, 'button { position: absolute; inset-block-start: 20px; inset-inline-start: 20px; } #two { inset-block-start: 50px; inset-inline-start: 50px; }'), "overlap");
      assert.deepEqual(finding, { kind: "overlap", selector: "#one", text: "One", detail: "overlaps #two by 18x18 px" });
    });

    await t.test("small mobile tap target", async () => {
      const finding = only(await fixture('<button id="tiny" aria-label="Menu"></button>', 390, '#tiny { inline-size: 20px; block-size: 20px; }'), "tap-target");
      assert.deepEqual(finding, { kind: "tap-target", selector: "#tiny", text: "Menu", detail: "20x20 px, under 24 px" });
    });

    await t.test("tap targets from 24 to 44 px count only when a neighbour is within the 44 px zone", async () => {
      const finding = only(await fixture('<button id="tiny" aria-label="Menu"></button><button id="big">Big</button>', 390, '#tiny { inline-size: 28px; block-size: 28px; }'), "tap-target");
      assert.deepEqual(finding, { kind: "tap-target", selector: "#tiny", text: "Menu", detail: "28x28 px, crowded by #big" });
      assert.deepEqual(await fixture('<button aria-label="Alone"></button>', 390, 'button { inline-size: 28px; block-size: 28px; }'), []);
    });

    await t.test("same-looking crowded repeats collapse into one finding", async () => {
      const finding = only(await fixture('<nav>' + ["Section", "Div", "Heading", "Text", "Image"].map((name) => `<button aria-label="${name}"></button>`).join("") + '</nav>', 390, 'nav { display: flex; } button { inline-size: 36px; block-size: 36px; }'), "tap-target");
      assert.deepEqual(finding, { kind: "tap-target", selector: "button:nth-of-type(1)", text: "Section, Div, Heading…", detail: "36x36 px x5 alike, crowded by button:nth-of-type(2)" });
    });

    await t.test("controls covered by a floating panel are not on screen", async () => {
      assert.deepEqual(await fixture('<button id="a">A</button><button id="b">B</button><div class="panel"><p>Panel</p></div>', 390, '#a,#b { position:absolute; inset-block-start:10px; inline-size:20px; block-size:20px; color:#eee; } #b { inset-inline-start:12px; } .panel { position:fixed; inset:0; background:oklch(1 0 none); }'), []);
    });

    await t.test("a control peeking out from under a floating panel is layering, not overlap or crowding", async () => {
      assert.deepEqual(await fixture('<button id="under">Under</button><div class="panel"><button id="gear">Gear</button></div>', 390, '#under { position:absolute; inset-block-start:20px; inset-inline-start:180px; inline-size:44px; } .panel { position:fixed; inset-block:0 auto; inset-inline-start:0; inline-size:200px; block-size:120px; background:oklch(1 0 none); } #gear { position:absolute; inset-block-start:20px; inset-inline-start:150px; inline-size:44px; }'), []);
    });

    await t.test("closed details content and text over pictures or scrims are skipped", async () => {
      assert.deepEqual(await fixture('<details><summary>Usage</summary><button style="color:#eee">Hidden</button></details>', 1000), []);
      const picture = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="200" height="100"><rect width="200" height="100" fill="black"/></svg>');
      assert.deepEqual(await fixture(`<figure><img src="${picture}" alt=""><figcaption>On the picture</figcaption></figure>`, 1000, 'figure { position:relative; margin:0; } figcaption { position:absolute; inset-block-end:4px; color:white; }'), []);
      assert.deepEqual(await fixture('<div class="tile"><span>On a scrim</span></div>', 1000, '.tile { position:relative; padding:20px; } .tile::after { content:""; position:absolute; inset:0; z-index:-1; background:linear-gradient(transparent, black); } span { color:white; }'), []);
    });

    await t.test("low contrast text", async () => {
      const finding = only(await fixture('<p id="muted">Muted text</p>', 1000, '#muted { color: #999; }'), "contrast");
      assert.deepEqual(finding, { kind: "contrast", selector: "#muted", text: "Muted text", detail: "2.8:1 (#999999 on #ffffff, needs 4.5)" });
    });

    await t.test("narrow document overflow identifies the widest protrusion", async () => {
      const finding = only(await fixture('<div id="wide"><div style="inline-size: 400px; block-size: 10px"></div></div>', 390, '#wide { inline-size: 412px; block-size: 48px; }'), "overflow");
      assert.deepEqual(finding, { kind: "overflow", selector: "#wide", text: "", detail: "scrollWidth 412 > 390; widest #wide" });
    });

    await t.test("clean desktop and mobile page", async () => {
      for (const width of [390, 768, 1000]) assert.deepEqual(await fixture('<p>Readable text</p><button>Save</button>', width), []);
    });

    await t.test("known-fine patterns before and after opening a modal", async () => {
      const html = `
        <span class="sr-only">Invisible low contrast</span>
        <dialog id="closed"><button style="inline-size: 8px; block-size: 8px">Tiny</button></dialog>
        <button aria-label="Save"><svg role="button" width="12" height="12"><path d="M0 0h12v12H0z"/></svg></button>
        <p>Running text with <a href="#">an inline link</a> inside.</p>
        <div class="scroll"><div style="block-size: 200px"></div><button>Last</button></div>
        <button id="behind">Behind</button><button id="also-behind">Behind too</button>
        <dialog id="modal"><button>OK</button></dialog>`;
      const css = '.sr-only { position: absolute; inline-size: 1px; block-size: 1px; overflow: hidden; color: #eee; } .scroll { overflow: auto; inline-size: 100px; block-size: 60px; }';
      assert.deepEqual(await fixture(html, 390, css), []);
      assert.deepEqual(await fixture(html, 390, css, async (page) => {
        await page.evaluate(() => {
          for (const id of ["behind", "also-behind"]) document.getElementById(id)!.style.cssText = "position:absolute;left:0;top:0;width:12px;height:12px;color:#eee";
          (document.getElementById("modal") as HTMLDialogElement).showModal();
        });
      }), []);
    });

    await t.test("hidden, inert, closed popover and sr-only variants are ignored", async () => {
      const tiny = '<button style="inline-size: 8px; block-size: 8px; color: #eee">Tiny</button>';
      const html = ['hidden', 'inert', 'aria-hidden="true"', 'style="display:none"', 'style="visibility:hidden"', 'style="opacity:0"', 'style="inline-size:0;block-size:0;overflow:hidden"', 'popover'].map((attribute) => `<div ${attribute}>${tiny}</div>`).join("") + `
        <span style="position:absolute;clip:rect(0px,1px,1px,0px);color:#eee">Hidden text</span>
        <span style="position:absolute;clip-path:inset(50%);color:#eee">Hidden text</span>
        <span style="position:absolute;clip-path:inset(0 99% 0 0);inline-size:50px;color:#eee">Hidden text</span>
        <input type="hidden" value="hidden">`;
      assert.deepEqual(await fixture(html, 390), []);
    });

    await t.test("native topmost modal wins over document order and ARIA layers", async () => {
      assert.deepEqual(await fixture('<dialog id="top"><button>OK</button></dialog><dialog id="lower"><button style="inline-size:8px;block-size:8px">Bad</button></dialog><div aria-modal="true" style="position:fixed;z-index:999999"><button style="inline-size:8px;block-size:8px">Bad</button></div>', 390, "", async (page) => {
        await page.evaluate(() => {
          (document.getElementById("lower") as HTMLDialogElement).showModal();
          (document.getElementById("top") as HTMLDialogElement).showModal();
        });
      }), []);
    });

    await t.test("ARIA modal scopes checks to the highest visible layer", async () => {
      assert.deepEqual(await fixture('<div aria-modal="true" style="position:fixed;z-index:2"><button>OK</button></div><div aria-modal="true" style="position:fixed;z-index:1"><button style="inline-size:8px;block-size:8px">Bad</button></div><p style="color:#eee">Behind</p>', 390), []);
    });

    await t.test("nested native modals check only the focused top dialog", async () => {
      assert.deepEqual(await fixture('<dialog id="outer"><button style="inline-size:8px;block-size:8px">Bad</button><dialog id="inner"><button>OK</button></dialog></dialog>', 390, "", async (page) => {
        await page.evaluate(() => {
          (document.getElementById("outer") as HTMLDialogElement).showModal();
          (document.getElementById("inner") as HTMLDialogElement).showModal();
        });
      }), []);
    });

    await t.test("scrollable controls remain reachable on either axis", async () => {
      const html = '<div class="outer"><div class="scroll"><button>First</button><button>Last</button></div></div>';
      for (const overflow of ["auto", "scroll"]) {
        assert.deepEqual(await fixture(html, 390, `.outer { inline-size: 100px; overflow: hidden; } .scroll { display: flex; gap: 100px; overflow: ${overflow}; inline-size: 100px; } button { flex-shrink: 0; }`), []);
        assert.deepEqual(await fixture(html, 390, `.outer { inline-size: 100px; overflow: clip; } .scroll { overflow: ${overflow}; block-size: 60px; } button { display: block; margin-block: 10px 100px; }`, async (page) => {
          await page.locator(".scroll").evaluate((element) => { element.scrollTop = element.scrollHeight; });
        }), []);
      }
    });

    await t.test("unreachable negative scroll overflow is clipped", async () => {
      const finding = only(await fixture('<div id="scroll"><button id="lost">Lost</button></div>', 1000, '#scroll { overflow:auto; inline-size:100px; } #lost { position:relative; inset-inline-start:-12px; }'), "clipped");
      assert.match(finding.detail, /cut 12 px left by #scroll/);
    });

    await t.test("viewport clipping is horizontal; document content below the fold is fine", async () => {
      const finding = only(await fixture('<button id="left">Left</button><button id="below">Below</button>', 1000, '#left { position:absolute; inset-inline-start:-12px; } #below { position:absolute; inset-block-start:1200px; }'), "clipped");
      assert.match(finding.detail, /cut 12 px left by viewport/);
      assert.equal(finding.selector, "#left");
    });

    await t.test("clipping tolerates two pixels and overlap tolerates four", async () => {
      assert.deepEqual(await fixture('<div style="inline-size:46px;overflow:clip"><button></button></div><button id="a"></button><button id="b"></button>', 390, '#a,#b { position:absolute; inset-block-start:100px; } #b { inset-inline-start:44px; }'), []);
    });

    await t.test("labels enlarge inputs and outer controls own decorative controls", async () => {
      assert.deepEqual(await fixture('<label style="display:block;inline-size:100px;block-size:48px"><input type="checkbox">Choice</label><label for="external" style="display:block;inline-size:100px;block-size:48px">External</label><input id="external" type="checkbox"><div role="button" style="inline-size:100px;block-size:48px"><span role="button" style="display:inline-block;inline-size:12px;block-size:12px"></span></div>', 390), []);
    });

    await t.test("box containment is not overlap", async () => {
      assert.deepEqual(await fixture('<button id="outer"></button><button id="inner"></button>', 1000, '#outer { inline-size:100px;block-size:100px; } #inner { position:absolute;inset-block-start:10px;inset-inline-start:10px; }'), []);
    });

    await t.test("tap targets at 768, desktop exemption, and a lone inline navigation link", async () => {
      const css = 'button { inline-size:20px;block-size:20px; }';
      only(await fixture('<button></button>', 768, css), "tap-target");
      assert.deepEqual(await fixture('<button></button>', 769, css), []);
      only(await fixture('<nav><a href="#">Go</a></nav>', 390), "tap-target");
      only(await fixture('<nav><a href="#">One</a> <a href="#" style="padding:14px">Two</a></nav>', 390), "tap-target");
      assert.deepEqual(await fixture('<p>Text <span><a href="#">Nested link</a></span></p>', 390), []);
    });

    await t.test("full-page document scroll keeps findings below the fold", async () => {
      const findings = await fixture('<button id="below" style="position:absolute;inset-block-start:1200px;inline-size:20px;block-size:20px"></button><p style="position:absolute;inset-block-start:1300px;color:#eee">Below</p>', 390, 'html { overflow:auto; }');
      assert.deepEqual(findings.map((finding) => finding.kind), ["tap-target", "contrast"]);
    });

    await t.test("modern CSS colours, translucent layers and inherited opacity", async () => {
      only(await fixture('<p>Modern colour</p>', 1000, 'p { color:oklch(0.7 0 none); background:color-mix(in srgb, white 80%, transparent); }'), "contrast");
      const translucent = only(await fixture('<div style="background:#000"><p id="blend">Blended</p></div>', 1000, '#blend { color:#999; background:rgb(255 255 255 / 50%); }'), "contrast");
      assert.match(translucent.detail, /#999999 on #808080/);
      const opacity = only(await fixture('<div style="opacity:.5"><p style="opacity:.5">Faded</p></div>'), "contrast");
      assert.match(opacity.detail, /#bfbfbf on #ffffff/);
      only(await fixture('<p>Alpha colour</p>', 1000, 'p { color:rgb(0 0 0 / 30%); }'), "contrast");
    });

    await t.test("large text threshold and disabled controls", async () => {
      assert.deepEqual(await fixture('<p style="font-size:24px;color:#888">Large</p><p style="font-size:18.66px;font-weight:700;color:#888">Bold</p><button disabled style="color:#eee">Off</button><div role="button" aria-disabled="true" style="color:#eee;inline-size:48px;block-size:48px">Off</div><fieldset disabled><button style="color:#eee">Off</button></fieldset>'), []);
      const finding = only(await fixture('<p style="font-size:24px;color:#aaa">Large</p>'), "contrast");
      assert.match(finding.detail, /needs 3\)/);
    });

    await t.test("background images make contrast unknown until an opaque layer", async () => {
      assert.deepEqual(await fixture('<div class="image"><p style="color:#eee">Unknown</p><p style="color:#000;background:#fff">Known</p></div>', 1000, '.image { background-image:linear-gradient(#fff,#000); }'), []);
      only(await fixture('<div class="image"><p style="color:#eee;background:#fff">Known bad</p></div>', 1000, '.image { background-image:linear-gradient(#fff,#000); }'), "contrast");
    });

    await t.test("dark canvas default and opaque HTML background", async () => {
      assert.deepEqual(await fixture('<p>Dark canvas</p>', 1000, 'html { color-scheme:dark; background:transparent; color:white; }'), []);
      only(await fixture('<p>Unreadable</p>', 1000, 'html { color-scheme:dark; background:transparent; color:black; }'), "contrast");
      assert.deepEqual(await fixture('<p>Explicit light canvas</p>', 1000, 'html { color-scheme:dark; background:white; color:black; }'), []);
    });

    await t.test("preview iframes are excluded", async () => {
      assert.deepEqual(await fixture('<iframe srcdoc="<button style=\'width:4px;height:4px;color:#eee\'>Bad</button>"></iframe>', 390), []);
    });

    await t.test("document order, accessible names, escaped IDs and nth-of-type paths", async () => {
      const findings = await fixture('<span id="name" hidden>A long accessible label with more than forty characters</span><button id="odd:id" aria-labelledby="name"></button><button aria-label="Second" style="inline-size:22px"></button><p style="color:#eee">Third</p>', 390, 'button { inline-size:20px;block-size:20px; }');
      assert.deepEqual(findings.map((finding) => [finding.kind, finding.text]), [["tap-target", "A long accessible label with more than f"], ["tap-target", "Second"], ["contrast", "Third"]]);
      assert.equal(findings[0].selector, "#odd\\:id");
      assert.match(findings[1].selector, /button:nth-of-type\(2\)/);
    });

    await t.test("caps each kind at ten and counts every omitted finding", async () => {
      const html = Array.from({ length: 13 }, (_, index) => `<section style="margin-block:10px"><button id="tiny-${index}" aria-label="Tiny ${index}" style="inline-size:${8 + index}px"></button><p id="muted-${index}">Muted ${index}</p></section>`).join("");
      // Distinct sizes keep the repeats apart, so every button stays its own finding.
      const findings = await fixture(html, 390, 'button { block-size:20px; } p { color:#eee; }');
      for (const kind of ["tap-target", "contrast"] as const) {
        const group = findings.filter((finding) => finding.kind === kind);
        assert.equal(group.length, 11);
        assert.deepEqual(group.at(-1), { kind, selector: "", text: "", detail: "+3 more" });
        assert.match(group[9].selector, /-9$/);
      }
      assert.equal(findings.length, 22);
    });
  } finally { await browser.close(); }
});
