import type { ImproveImagesSession, KnownSizes } from "./improve-images-run";

/** The listing lacks widths: both the screen and agents read the same missing picture facts. */
export async function planWithPictureSizes(
  session: Pick<ImproveImagesSession, "plan">,
  known: Record<string, KnownSizes[string]>,
  read: (path: string) => Promise<KnownSizes[string]>,
  progress?: (done: number, total: number) => void,
) {
  const first = await session.plan(known);
  const missing = first.missingFacts.filter(path => !known[path]);
  let done = 0;
  const load = async (path: string) => {
    try { const bytes = await read(path); known[path] = { width: bytes.width, height: bytes.height }; }
    catch { known[path] = {}; }
    progress?.(++done, missing.length);
  };
  for (let index = 0; index < missing.length; index += 4) await Promise.all(missing.slice(index, index + 4).map(load));
  return missing.length ? session.plan(known) : first;
}
