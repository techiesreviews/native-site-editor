// What a search found, for a screen reader: written to `region` (a polite live region) once the typing rests, so one
// result is said, not one for every key. An empty search says nothing, at once.
const resting = new WeakMap<HTMLElement, ReturnType<typeof setTimeout>>();

export function sayFound(region: HTMLElement, text: string) {
  clearTimeout(resting.get(region));
  if (!text) region.textContent = "";
  else resting.set(region, setTimeout(() => { if (region.textContent !== text) region.textContent = text; }, 400));
}

/** "3 pages found", "1 file found"; with no `noun`, "3 found". */
export const foundCount = (count: number, noun?: string) => `${count} ${noun ? `${noun}${count === 1 ? "" : "s"} ` : ""}found`;
