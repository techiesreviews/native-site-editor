// An element's kind as a small icon (Phosphor, like the Add panel's), for
// rows that already say what they hold: the page structure shows the icon
// with the kind as its tooltip and accessible name instead of the word.

import textT from "@phosphor-icons/core/regular/text-t.svg?raw";
import textH from "@phosphor-icons/core/regular/text-h.svg?raw";
import image from "@phosphor-icons/core/regular/image.svg?raw";
import link from "@phosphor-icons/core/regular/link-simple.svg?raw";
import cursorClick from "@phosphor-icons/core/regular/cursor-click.svg?raw";
import listBullets from "@phosphor-icons/core/regular/list-bullets.svg?raw";
import listNumbers from "@phosphor-icons/core/regular/list-numbers.svg?raw";
import dotOutline from "@phosphor-icons/core/regular/dot-outline.svg?raw";
import rows from "@phosphor-icons/core/regular/rows.svg?raw";
import square from "@phosphor-icons/core/regular/square.svg?raw";
import article from "@phosphor-icons/core/regular/article.svg?raw";
import browser from "@phosphor-icons/core/regular/browser.svg?raw";
import tray from "@phosphor-icons/core/regular/tray.svg?raw";
import compass from "@phosphor-icons/core/regular/compass.svg?raw";
import frameCorners from "@phosphor-icons/core/regular/frame-corners.svg?raw";
import sidebar from "@phosphor-icons/core/regular/sidebar-simple.svg?raw";
import quotes from "@phosphor-icons/core/regular/quotes.svg?raw";
import video from "@phosphor-icons/core/regular/video.svg?raw";
import table from "@phosphor-icons/core/regular/table.svg?raw";
import textbox from "@phosphor-icons/core/regular/textbox.svg?raw";
import textAa from "@phosphor-icons/core/regular/text-aa.svg?raw";
import textB from "@phosphor-icons/core/regular/text-b.svg?raw";
import textItalic from "@phosphor-icons/core/regular/text-italic.svg?raw";
import brackets from "@phosphor-icons/core/regular/brackets-angle.svg?raw";
import code from "@phosphor-icons/core/regular/code-simple.svg?raw";

const byTag: Record<string, string> = {
  p: textT, text: textT, a: link, button: cursorClick, img: image, picture: image, video,
  ul: listBullets, ol: listNumbers, li: dotOutline, section: rows, div: square, article,
  header: browser, footer: tray, nav: compass, main: frameCorners, aside: sidebar, figure: image,
  blockquote: quotes, table, form: textbox, span: textAa, strong: textB, b: textB, em: textItalic, i: textItalic,
  slot: brackets,
};

/** The icon for an element's tag (a heading's for h1–h6, code brackets for anything unnamed), hidden from assistive technology. */
export function elementIcon(tag: string, size = 14) {
  const raw = /^h[1-6]$/.test(tag) ? textH : byTag[tag] ?? code;
  const template = document.createElement("template");
  template.innerHTML = raw.replace("<svg ", `<svg class="icon element-icon" width="${size}" height="${size}" aria-hidden="true" focusable="false" `);
  return template.content.firstElementChild as SVGSVGElement;
}
