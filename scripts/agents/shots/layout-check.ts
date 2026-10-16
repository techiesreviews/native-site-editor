import type { Page } from "@playwright/test";

export type LayoutKind = "clipped" | "overlap" | "tap-target" | "contrast" | "overflow";
export type LayoutFinding = { kind: LayoutKind; selector: string; text: string; detail: string };

/** Inspect editor UI only: the site's preview iframe belongs to the user. */
export async function checkLayout(page: Page): Promise<LayoutFinding[]> {
  return page.evaluate(({ viewportWidth = innerWidth }) => {
    type Box = { left: number; right: number; top: number; bottom: number };
    type Colour = [number, number, number, number];
    const controlSelector = 'button,a[href],input:not([type="hidden" i]),select,textarea,summary,[role="button"],[role="link"],[role="tab"],[role="menuitem"],[role="checkbox"],[role="switch"]';
    const elements = [...document.querySelectorAll("*")];
    const order = new Map(elements.map((element, index) => [element, index]));
    const styles = new Map<Element, CSSStyleDeclaration>();
    const boxes = new Map<Element, DOMRect>();
    const findings: { element: Element; finding: LayoutFinding }[] = [];
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 1;
    const context = canvas.getContext("2d", { willReadFrequently: true })!;
    const colours = new Map<string, Colour>();

    // Object methods and inline callbacks stay anonymous under tsx. Named inner
    // functions would acquire __name calls that do not exist in the page.
    const dom = {
      style(element: Element) {
        if (!styles.has(element)) styles.set(element, getComputedStyle(element));
        return styles.get(element)!;
      },
      box(element: Element) {
        if (!boxes.has(element)) boxes.set(element, element.getBoundingClientRect());
        return boxes.get(element)!;
      },
      selector(element: Element) {
        const path: string[] = [];
        for (let node: Element | null = element; node && path.length < 4; node = node.parentElement) {
          if (node.id) { path.unshift(`#${CSS.escape(node.id)}`); break; }
          let part = node.localName + [...node.classList].slice(0, 2).map((name) => `.${CSS.escape(name)}`).join("");
          const siblings = node.parentElement ? [...node.parentElement.children].filter((sibling) => sibling.localName === node!.localName) : [];
          if (siblings.length > 1) part += `:nth-of-type(${siblings.indexOf(node) + 1})`;
          path.unshift(part);
          if (document.querySelectorAll(path.join(" > ")).length === 1) break;
        }
        return path.join(" > ");
      },
      text(element: Element) {
        const labelled = (element.getAttribute("aria-labelledby") ?? "").split(/\s+/).map((id) => document.getElementById(id)?.textContent ?? "").join(" ").trim();
        const labels = element instanceof HTMLInputElement || element instanceof HTMLSelectElement || element instanceof HTMLTextAreaElement ? [...(element.labels ?? [])].map((label) => label.textContent).join(" ") : "";
        return (labelled || element.getAttribute("aria-label") || labels || element.getAttribute("alt") || (element instanceof HTMLInputElement ? element.value : "") || element.textContent || element.getAttribute("title") || "").replace(/\s+/g, " ").trim().slice(0, 40);
      },
      visuallyHidden(element: Element) {
        const box = dom.box(element), style = dom.style(element);
        if (box.width <= 1 && box.height <= 1 && /hidden|clip/.test(`${style.overflowX} ${style.overflowY}`)) return true;
        if (style.clip !== "auto") {
          const values = style.clip.match(/-?[\d.]+/g)?.map(Number);
          if (values?.length === 4 && (values[1] - values[3] <= 1 || values[2] - values[0] <= 1)) return true;
        }
        const inset = /^inset\(([^)]+)\)/.exec(style.clipPath);
        if (inset) {
          const parts = inset[1].split(" round ")[0].trim().split(/\s+/);
          if (parts.every((part) => /^-?[\d.]+(px|%)?$/.test(part))) {
            const [top, right = top, bottom = top, left = right] = parts;
            const offsets = [top, right, bottom, left].map((part, index) => parseFloat(part) * (part.endsWith("%") ? (index % 2 ? box.width : box.height) / 100 : 1));
            if (box.width - offsets[1] - offsets[3] <= 1 || box.height - offsets[0] - offsets[2] <= 1) return true;
          }
        }
        return false;
      },
      visible(element: Element) {
        if (element.closest('[hidden],[inert],[aria-hidden="true"],dialog:not([open]),[popover]:not(:popover-open)')) return false;
        // Covers content-visibility skips too, such as the body of a closed <details>.
        if (!element.checkVisibility()) return false;
        const box = dom.box(element);
        if (box.width <= 0 || box.height <= 0 || !element.getClientRects().length) return false;
        for (let node: Element | null = element; node; node = node.parentElement) {
          const style = dom.style(node);
          if (style.display === "none" || style.visibility !== "visible" || style.contentVisibility === "hidden" || Number(style.opacity) === 0 || dom.visuallyHidden(node)) return false;
        }
        return true;
      },
      frame(element: Element): Box {
        const box = dom.box(element);
        const left = box.left + element.clientLeft, top = box.top + element.clientTop;
        return { left, top, right: left + element.clientWidth, bottom: top + element.clientHeight };
      },
      contains(outer: Box, inner: Box) {
        return outer.left <= inner.left && outer.right >= inner.right && outer.top <= inner.top && outer.bottom >= inner.bottom;
      },
      exposed(element: Element): Box {
        const box: Box = { ...dom.box(element).toJSON() };
        if (element.matches(":modal,:popover-open")) return box;
        for (let node = element.parentElement; node; node = node.parentElement) {
          const style = dom.style(node), frame = dom.frame(node);
          if (style.overflowX !== "visible") { box.left = Math.max(box.left, frame.left); box.right = Math.min(box.right, frame.right); }
          // Full-page shots include the document below the viewport.
          if (node !== document.scrollingElement && style.overflowY !== "visible") { box.top = Math.max(box.top, frame.top); box.bottom = Math.min(box.bottom, frame.bottom); }
          if (node.matches(":modal,:popover-open")) break;
        }
        return box;
      },
      inlineTextLink(element: Element) {
        if (!element.matches("a[href]") || dom.style(element).display !== "inline") return false;
        for (let parent = element.parentElement; parent; parent = parent.parentElement) {
          const walker = document.createTreeWalker(parent, NodeFilter.SHOW_TEXT);
          for (let node = walker.nextNode(); node; node = walker.nextNode()) {
            if (node.textContent?.trim() && !element.contains(node) && node.parentElement && !node.parentElement.closest(controlSelector) && dom.visible(node.parentElement)) return true;
          }
          if (!["inline", "contents"].includes(dom.style(parent).display)) break;
        }
        return false;
      },
      /**
       * False when another layer (a floating panel, a sheet) covers every
       * sampled point of the element's exposed box inside the viewport.
       * Points below the fold cannot be hit-tested and count as shown.
       */
      shown(element: Element) {
        const box = dom.exposed(element);
        if (box.right <= box.left || box.bottom <= box.top) return false;
        const passThrough = dom.style(element).pointerEvents === "none";
        const labels = element instanceof HTMLInputElement || element instanceof HTMLSelectElement || element instanceof HTMLTextAreaElement ? [...(element.labels ?? [])] : [];
        let tested = false;
        for (const [fx, fy] of [[0.5, 0.5], [0.2, 0.2], [0.8, 0.2], [0.2, 0.8], [0.8, 0.8]]) {
          const x = box.left + (box.right - box.left) * fx, y = box.top + (box.bottom - box.top) * fy;
          if (x < 0 || y < 0 || x >= innerWidth || y >= innerHeight) continue;
          tested = true;
          const hit = document.elementFromPoint(x, y);
          if (!hit || element.contains(hit) || labels.some((label) => label.contains(hit)) || (passThrough && hit.contains(element))) return true;
        }
        return !tested;
      },
      /**
       * True when a layer holding `top` (a floating panel or sheet) covers part
       * of `under`: the two sit on different layers, so they do not collide.
       */
      layered(top: Element, under: Element) {
        const box = dom.exposed(under);
        // A 10 x 3 grid finds even a thin strip of the panel's edge.
        for (let point = 0; point < 30; point++) {
          const x = box.left + (box.right - box.left) * ((point % 10) + 0.5) / 10, y = box.top + (box.bottom - box.top) * (Math.floor(point / 10) + 0.5) / 3;
          if (x < 0 || y < 0 || x >= innerWidth || y >= innerHeight) continue;
          const hit = document.elementFromPoint(x, y);
          if (hit && hit !== top && hit.contains(top) && !hit.contains(under)) return true;
        }
        return false;
      },
      /** A short structural key: same-looking repeats (a rail, a list) share it. */
      shape(element: Element) {
        const parts: string[] = [];
        for (let node: Element | null = element; node && parts.length < 3; node = node.parentElement) parts.unshift(node.localName + (node.classList[0] ? `.${node.classList[0]}` : ""));
        return parts.join(">");
      },
      add(kind: LayoutKind, element: Element, detail: string) {
        findings.push({ element, finding: { kind, selector: dom.selector(element), text: dom.text(element), detail } });
      },
      colour(value: string): Colour {
        if (!colours.has(value)) {
          context.clearRect(0, 0, 1, 1);
          context.fillStyle = value;
          context.fillRect(0, 0, 1, 1);
          const pixel = context.getImageData(0, 0, 1, 1).data;
          colours.set(value, [pixel[0], pixel[1], pixel[2], pixel[3] / 255]);
        }
        return colours.get(value)!;
      },
      over(front: Colour, back: Colour): Colour {
        const alpha = front[3] + back[3] * (1 - front[3]);
        return alpha ? [
          (front[0] * front[3] + back[0] * back[3] * (1 - front[3])) / alpha,
          (front[1] * front[3] + back[1] * back[3] * (1 - front[3])) / alpha,
          (front[2] * front[3] + back[2] * back[3] * (1 - front[3])) / alpha,
          alpha,
        ] : [0, 0, 0, 0];
      },
      luminance(colour: Colour) {
        const linear = colour.slice(0, 3).map((channel) => channel / 255).map((channel) => channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4);
        return linear[0] * 0.2126 + linear[1] * 0.7152 + linear[2] * 0.0722;
      },
      hex(colour: Colour) {
        return `#${colour.slice(0, 3).map((channel) => Math.round(channel).toString(16).padStart(2, "0")).join("")}`;
      },
    };

    const modals = elements.filter((element) => element.matches('dialog:modal,[aria-modal="true"]') && dom.visible(element));
    // Native dialogs live above ordinary z-index layers. Focus identifies the
    // last showModal() even when dialogs were opened in reverse document order.
    modals.sort((a, b) => Number(a.matches(":modal")) - Number(b.matches(":modal")) || (parseFloat(dom.style(a).zIndex) || 0) - (parseFloat(dom.style(b).zIndex) || 0) || order.get(a)! - order.get(b)!);
    const nativeFocused = document.activeElement?.closest("dialog:modal");
    const modal = nativeFocused && modals.includes(nativeFocused) ? nativeFocused : modals.at(-1);
    const scoped = elements.filter((element) => (!modal || modal.contains(element)) && dom.visible(element));
    // A control hidden under another layer is not on screen; one cut away
    // entirely by overflow (empty exposed box) still counts as clipped.
    const controls = scoped.filter((element) => {
      if (!element.matches(controlSelector)) return false;
      const box = dom.exposed(element);
      return box.right <= box.left || box.bottom <= box.top || dom.shown(element);
    });
    const outerControls = controls.filter((element) => !controls.some((parent) => parent !== element && parent.contains(element) && dom.contains(dom.box(parent), dom.box(element))));

    for (const element of controls) {
      const box: Box = { ...dom.box(element).toJSON() };
      let cut = "";
      for (let ancestor = element.parentElement; ancestor && !cut; ancestor = ancestor.parentElement) {
        const style = dom.style(ancestor), frame = dom.frame(ancestor);
        for (const axis of ["x", "y"] as const) {
          const overflow = axis === "x" ? style.overflowX : style.overflowY;
          if (overflow === "visible" || (axis === "y" && ancestor === document.scrollingElement)) continue;
          const start = axis === "x" ? "left" : "top", end = axis === "x" ? "right" : "bottom";
          let low = frame[start], high = frame[end];
          const scrollable = overflow === "auto" || overflow === "scroll";
          if (scrollable) {
            if (axis === "x" && style.direction === "rtl") { high -= ancestor.scrollLeft; low = high - ancestor.scrollWidth; }
            else { low -= axis === "x" ? ancestor.scrollLeft : ancestor.scrollTop; high = low + (axis === "x" ? ancestor.scrollWidth : ancestor.scrollHeight); }
          }
          const before = low - box[start], after = box[end] - high;
          if (Math.max(before, after) > 2) {
            cut = `cut ${Math.round(Math.max(before, after))} px ${before > after ? start : end} by ${dom.selector(ancestor)}`;
            break;
          }
          if (scrollable) { box[start] = Math.max(box[start], frame[start]); box[end] = Math.min(box[end], frame[end]); }
        }
        // Content outside a scroll viewport is reachable by scrolling; do not
        // compare that off-screen box with outer clipping ancestors or viewport.
        if (box.right <= box.left || box.bottom <= box.top) break;
        // Top-layer dialogs/popovers escape their DOM ancestors' overflow.
        if (ancestor.matches(":modal,:popover-open")) break;
      }
      if (!cut && box.right > box.left && box.bottom > box.top && (box.left < -2 || box.right > viewportWidth + 2)) {
        cut = `cut ${Math.round(Math.max(-box.left, box.right - viewportWidth))} px ${box.left < -2 ? "left" : "right"} by viewport (${viewportWidth} px)`;
      }
      if (cut) dom.add("clipped", element, cut);
    }

    const small: { element: Element; size: string; neighbour?: Element }[] = [];
    for (let index = 0; index < outerControls.length; index++) {
      const element = outerControls[index], box = dom.box(element), exposed = dom.exposed(element);
      if (exposed.right <= exposed.left || exposed.bottom <= exposed.top) continue;
      for (const other of outerControls.slice(index + 1)) {
        const otherBox = dom.box(other), otherExposed = dom.exposed(other);
        if (element.contains(other) || other.contains(element) || dom.contains(box, otherBox) || dom.contains(otherBox, box)) continue;
        if (dom.layered(element, other) || dom.layered(other, element)) continue;
        const width = Math.min(exposed.right, otherExposed.right) - Math.max(exposed.left, otherExposed.left);
        const height = Math.min(exposed.bottom, otherExposed.bottom) - Math.max(exposed.top, otherExposed.top);
        if (width > 4 && height > 4) dom.add("overlap", element, `overlaps ${dom.selector(other)} by ${Math.round(width)}x${Math.round(height)} px`);
      }
      if (viewportWidth > 768 || (box.width >= 44 && box.height >= 44)) continue;
      if (dom.inlineTextLink(element)) continue;
      const labels = element instanceof HTMLInputElement || element instanceof HTMLSelectElement || element instanceof HTMLTextAreaElement ? [...(element.labels ?? [])] : [];
      const enlarged = labels.some((label) => dom.visible(label) && dom.box(label).width >= 44 && dom.box(label).height >= 44);
      if (enlarged) continue;
      // Under 24 px fails WCAG 2.5.8 outright. From 24 to 44 px a finger only
      // misses when the 44 px zone centred on the target reaches a neighbour.
      const growX = Math.max(0, 44 - box.width) / 2, growY = Math.max(0, 44 - box.height) / 2;
      const zone: Box = { left: box.left - growX, right: box.right + growX, top: box.top - growY, bottom: box.bottom + growY };
      const neighbour = Math.min(box.width, box.height) < 24 ? undefined : outerControls.find((other) => {
        if (other === element || other.contains(element) || element.contains(other) || dom.layered(element, other) || dom.layered(other, element)) return false;
        const near = dom.box(other);
        return Math.min(zone.right, near.right) > Math.max(zone.left, near.left) && Math.min(zone.bottom, near.bottom) > Math.max(zone.top, near.top);
      });
      if (Math.min(box.width, box.height) < 24 || neighbour) small.push({ element, size: `${Math.round(box.width)}x${Math.round(box.height)} px`, neighbour });
    }
    // Same-looking repeats (a rail of icons, rows of a list) become one finding.
    for (let index = 0; index < small.length;) {
      const first = small[index], key = `${first.size}|${dom.shape(first.element)}`;
      let end = index + 1;
      while (end < small.length && `${small[end].size}|${dom.shape(small[end].element)}` === key) end++;
      const group = small.slice(index, end);
      const reason = first.neighbour ? `, crowded by ${dom.selector(first.neighbour)}` : ", under 24 px";
      dom.add("tap-target", first.element, group.length > 1 ? `${first.size} x${group.length} alike${reason}` : `${first.size}${reason}`);
      if (group.length > 1) findings.at(-1)!.finding.text = group.slice(0, 3).map((item) => dom.text(item.element)).join(", ").slice(0, 40) + (group.length > 3 ? "…" : "");
      index = end;
    }

    const scheme = dom.style(document.documentElement).colorScheme;
    const darkCanvas = scheme.includes("dark") && (!scheme.includes("light") || matchMedia("(prefers-color-scheme: dark)").matches);
    const canvasColour: Colour = darkCanvas ? [18, 18, 18, 1] : [255, 255, 255, 1];
    for (const element of scoped) {
      if (![...element.childNodes].some((node) => node.nodeType === Node.TEXT_NODE && node.textContent?.trim()) || element.closest(':disabled,[aria-disabled="true"]')) continue;
      const exposed = dom.exposed(element);
      if (exposed.right <= exposed.left || exposed.bottom <= exposed.top || !dom.shown(element)) continue;
      const style = dom.style(element), text = dom.box(element);
      let foreground = dom.colour(style.color), background: Colour = [0, 0, 0, 0], unknown = false;
      for (let node: Element | null = element; node; node = node.parentElement) {
        const layer = dom.style(node);
        if (background[3] < 1 && layer.backgroundImage !== "none") { unknown = true; break; }
        // Text over a picture, or over a ::before/::after scrim, has no single backdrop colour.
        if (node !== element && [...node.querySelectorAll("img,video,canvas")].some((media) => !media.contains(element) && dom.visible(media) && dom.contains(dom.box(media), { left: (text.left + text.right) / 2, right: (text.left + text.right) / 2, top: (text.top + text.bottom) / 2, bottom: (text.top + text.bottom) / 2 }))) { unknown = true; break; }
        if (["::before", "::after"].some((pseudo) => { const layer = getComputedStyle(node!, pseudo); return layer.content !== "none" && layer.position === "absolute" && (layer.backgroundImage !== "none" || dom.colour(layer.backgroundColor)[3] > 0); })) { unknown = true; break; }
        const colour = dom.colour(layer.backgroundColor);
        foreground = dom.over(foreground, colour);
        background = dom.over(background, colour);
        const opacity = Number(layer.opacity);
        foreground = [foreground[0], foreground[1], foreground[2], foreground[3] * opacity];
        background = [background[0], background[1], background[2], background[3] * opacity];
      }
      if (unknown) continue;
      foreground = dom.over(foreground, canvasColour);
      background = dom.over(background, canvasColour);
      const frontLuminance = dom.luminance(foreground), backLuminance = dom.luminance(background);
      const ratio = (Math.max(frontLuminance, backLuminance) + 0.05) / (Math.min(frontLuminance, backLuminance) + 0.05);
      const size = parseFloat(style.fontSize), weight = parseInt(style.fontWeight, 10);
      const threshold = size >= 24 || (size >= 18.66 && weight >= 700) ? 3 : 4.5;
      if (ratio < threshold) dom.add("contrast", element, `${ratio.toFixed(1)}:1 (${dom.hex(foreground)} on ${dom.hex(background)}, needs ${threshold})`);
    }

    const root = document.documentElement;
    if (viewportWidth <= 390 && root.scrollWidth > root.clientWidth) {
      const protruding = scoped.filter((element) => element !== root && element !== document.body && (dom.box(element).right > root.clientWidth || dom.box(element).left < 0));
      protruding.sort((a, b) => dom.box(b).width - dom.box(a).width || order.get(a)! - order.get(b)!);
      if (!modal || protruding.length) dom.add("overflow", protruding[0] ?? root, `scrollWidth ${root.scrollWidth} > ${root.clientWidth}${protruding.length ? `; widest ${dom.selector(protruding[0])}` : ""}`);
    }

    findings.sort((a, b) => order.get(a.element)! - order.get(b.element)!);
    const counts = new Map<LayoutKind, number>();
    const result: LayoutFinding[] = [];
    for (const { finding } of findings) {
      const count = (counts.get(finding.kind) ?? 0) + 1;
      counts.set(finding.kind, count);
      if (count <= 10) result.push(finding);
    }
    for (const [kind, count] of counts) if (count > 10) result.push({ kind, selector: "", text: "", detail: `+${count - 10} more` });
    return result;
  }, { viewportWidth: page.viewportSize()?.width });
}
