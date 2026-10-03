// CSS owns the palette. Consumers that cannot use CSS variables (Monaco and
// the cross-origin preview overlay) receive resolved sRGB colors from it.
const tokens = ["surface", "text", "muted", "selected", "surface-raised", "focus", "preview-focus", "component"] as const;
type ThemeColors = Record<(typeof tokens)[number], string>;
type Theme = { dark: boolean; colors: ThemeColors };
const preference = matchMedia("(prefers-color-scheme: dark)");
const listeners = new Set<(theme: Theme) => void>();
let current: Theme | undefined;
let pending = false;

function resolveTheme(): Theme {
  const probe = document.createElement("span");
  probe.hidden = true;
  document.documentElement.append(probe);
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 1;
  const context = canvas.getContext("2d", { willReadFrequently: true })!;
  const colors = {} as ThemeColors;
  for (const token of tokens) {
    probe.style.color = `var(--${token})`;
    context.clearRect(0, 0, 1, 1);
    context.fillStyle = getComputedStyle(probe).color;
    context.fillRect(0, 0, 1, 1);
    colors[token] = "#" + [...context.getImageData(0, 0, 1, 1).data]
      .slice(0, 3).map(channel => channel.toString(16).padStart(2, "0")).join("");
  }
  probe.remove();
  return { dark: preference.matches, colors };
}

function update() {
  pending = false;
  const next = resolveTheme();
  if (JSON.stringify(next) === JSON.stringify(current)) return;
  current = next;
  for (const listener of listeners) listener(next);
}

function schedule() {
  if (pending) return;
  pending = true;
  requestAnimationFrame(update);
}

// Root overrides, stylesheet edits (including Vite HMR), and OS mode changes
// all update the same consumers. Comparing colors prevents feedback from
// Monaco's own generated stylesheets.
new MutationObserver(schedule).observe(document.documentElement, { attributes: true, attributeFilter: ["style", "class"] });
new MutationObserver(schedule).observe(document.head, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ["href", "media", "disabled"] });
document.head.addEventListener("load", schedule, true);
preference.addEventListener("change", schedule);

export function watchEditorTheme(listener: (theme: Theme) => void) {
  update();
  listeners.add(listener);
  listener(current!);
  return () => listeners.delete(listener);
}
