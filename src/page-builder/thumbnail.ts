// A live thumbnail: a thumbnail document (thumbnail-doc.ts) rendered at the
// canvas's own width in an iframe sandboxed without `allow-scripts`, scaled
// down to the thumbnail's width and cropped to the section it shows. The
// frame keeps `allow-same-origin` only so the editor can measure the
// section's height; nothing in it can run.

import { node } from "../ui/dom";

// The tallest stretch of a section a thumbnail shows, in canvas pixels.
const MAX_HEIGHT = 1000;
const MIN_HEIGHT = 300;

/**
 * A thumbnail; with `aspect` (height over width) it keeps that shape and
 * shows the middle of the section, else it is as tall as the section.
 */
export function createThumbnail(className = "", aspect?: number) {
  const root = node("span", `pb-thumb ${className}`.trim());
  root.setAttribute("aria-hidden", "true");
  const frame = document.createElement("iframe");
  frame.className = "pb-thumb__frame";
  frame.setAttribute("sandbox", "allow-same-origin");
  frame.tabIndex = -1;
  frame.title = "";
  frame.setAttribute("aria-hidden", "true");
  frame.referrerPolicy = "no-referrer";
  root.append(frame);
  let doc = "";
  let canvasWidth = 1200;
  // The section's place in the frame's document, once measured.
  let measured: { top: number; height: number } | undefined;
  let timer = 0;

  function fit() {
    const width = root.clientWidth;
    if (!width) return;
    const scale = width / canvasWidth;
    const own = Math.min(MAX_HEIGHT, measured?.height ?? canvasWidth * 0.5);
    // A short section sits in the middle of a little of the page around it.
    const height = aspect ? canvasWidth * aspect : Math.max(MIN_HEIGHT, own);
    const top = Math.max(0, (measured?.top ?? 0) - (height - own) / 2);
    frame.style.width = `${canvasWidth}px`;
    frame.style.height = `${top + height}px`;
    frame.style.transform = `scale(${scale}) translateY(${-top}px)`;
    root.style.height = `${Math.round(height * scale)}px`;
  }

  function measure() {
    let body: Document | null = null;
    try {
      body = frame.contentDocument;
    } catch {
      body = null;
    }
    const section = body?.querySelector("main")?.firstElementChild ?? body?.body?.firstElementChild;
    if (section && body) {
      const rect = section.getBoundingClientRect();
      const scrollY = body.defaultView?.scrollY ?? 0;
      measured = { top: Math.max(0, rect.top + scrollY), height: rect.height };
      root.classList.toggle("is-blank", rect.height < 2);
    }
    root.classList.add("is-ready");
    fit();
  }

  frame.addEventListener("load", () => {
    measure();
    // Web fonts and late layout move it a little.
    void frame.contentDocument?.fonts?.ready.then(measure);
    clearTimeout(timer);
    timer = window.setTimeout(measure, 400);
  });
  // Only a new width refits (fitting sets the height), on the next frame.
  let fittedWidth = 0;
  const resize = new ResizeObserver(() => {
    if (root.clientWidth === fittedWidth) return;
    fittedWidth = root.clientWidth;
    requestAnimationFrame(fit);
  });
  resize.observe(root);

  return {
    root,
    /** Show `next` (a thumbnail document) as if the canvas were `width` wide. */
    render(next: string, width: number) {
      const widthChanged = Math.round(width) !== canvasWidth;
      canvasWidth = Math.max(640, Math.round(width));
      if (next === doc) {
        if (widthChanged) {
          frame.style.width = `${canvasWidth}px`;
          window.setTimeout(measure, 0);
        }
        return;
      }
      doc = next;
      root.classList.remove("is-ready");
      frame.style.width = `${canvasWidth}px`;
      frame.srcdoc = next;
    },
    destroy() {
      clearTimeout(timer);
      resize.disconnect();
      root.remove();
    },
  };
}

export type Thumbnail = ReturnType<typeof createThumbnail>;
