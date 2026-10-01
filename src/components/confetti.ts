import "./confetti.css";

// A short confetti burst for the wizard's last page, in the editor's accent
// palette. Plain DOM and CSS animation, no library, loaded only on that page
// (setup-wizard.ts imports it when the page opens, and not at all under
// prefers-reduced-motion).

const COLOURS = [
  "var(--color-primary)",
  "var(--color-primary-light)",
  "var(--color-primary-dark)",
  "var(--color-warning)",
  "var(--color-success)",
];
const PIECES = 36;
/** The burst lasts about this long, in ms, then removes itself. */
const DURATION = 1200;

/** Throws confetti from the middle of `origin`; the returned handle removes it early. */
export function burst(origin: Element): { remove: () => void } {
  const box = origin.getBoundingClientRect();
  const layer = document.createElement("div");
  layer.className = "confetti";
  layer.setAttribute("aria-hidden", "true");
  layer.style.left = `${box.left + box.width / 2}px`;
  layer.style.top = `${box.top + box.height / 2}px`;
  for (let index = 0; index < PIECES; index++) {
    const piece = document.createElement("i");
    const angle = (Math.PI * 2 * index) / PIECES + Math.random() * 0.3;
    const reach = 90 + Math.random() * 200;
    piece.style.setProperty("--dx", `${Math.cos(angle) * reach}px`);
    piece.style.setProperty("--rise", `${Math.sin(angle) * reach - 60}px`);
    piece.style.setProperty("--fall", `${Math.sin(angle) * reach * 0.4 + 140 + Math.random() * 80}px`);
    piece.style.setProperty("--turn", `${(Math.random() - 0.5) * 900}deg`);
    piece.style.setProperty("--colour", COLOURS[index % COLOURS.length]);
    piece.style.setProperty("--length", `${DURATION - 200}ms`);
    piece.style.animationDelay = `${Math.random() * 120}ms`;
    if (index % 3 === 0) piece.classList.add("is-round");
    layer.append(piece);
  }
  document.body.append(layer);
  const timer = setTimeout(() => layer.remove(), DURATION + 200);
  return {
    remove() {
      clearTimeout(timer);
      layer.remove();
    },
  };
}
