import { MEDIA_LIST_LIMIT, textBytes } from "../shared/agent";
import { createMediaByteCache } from "./page-builder/media-byte-cache";
import { planWithPictureSizes } from "./page-builder/improve-images-facts";
import { LEFT_ALONE, improveImagesSession, improveRow, runMaps, type ImproveRowPorts, type KnownSizes, type Measure } from "./page-builder/improve-images-run";
import type { MediaWorkspaceContext } from "./page-builder/media-workspace";

export interface AgentImproveHost {
  context(): Promise<MediaWorkspaceContext>;
  show?(path: string): Promise<void>;
  measure?: Measure;
  url?(): string | undefined;
}
/** Test seams use the same encoders as the screen's row, and the byte cache's dimensions. */
export interface AgentImprovePorts extends ImproveRowPorts {
  sizes?(path: string): Promise<KnownSizes[string]>;
}

/** Only loaded by improve_images. Each row uses a fresh workspace under the run's original proof. */
export async function agentImproveImages(host: AgentImproveHost, row?: string, ports: AgentImprovePorts = {}) {
  const initial = await host.context(); initial.assertLive();
  if (row && !initial.pages.includes(row) && !Object.values(initial.components).includes(row))
    throw new Error(`Unknown Improve images row: ${row}. Choose a page or component template listed by get_site.`);
  const context = async () => {
    initial.assertLive();
    const ctx = await host.context(); initial.assertLive(); ctx.assertLive();
    return ctx;
  };
  const cache = createMediaByteCache({ load: path => initial.blob(path), version: path => initial.assetVersion(path), alive: () => true });
  const known: Record<string, KnownSizes[string]> = {};
  const rows: { file: string; label: string; changed: boolean; notes: string[]; left: { key: string; address: string; reason: string; note?: string }[] }[] = [];
  const failed: { file: string; message: string }[] = [];
  const maps = runMaps(), signal = new AbortController().signal;
  try {
    const plan = await planWithPictureSizes(improveImagesSession(context), known, path => ports.sizes ? ports.sizes(path) : cache.get(path));
    initial.assertLive();
    const selected = row ? plan.rows.filter(item => item.file === row) : plan.rows;
    for (const item of selected) {
      initial.assertLive();
      try {
        if (item.kind === "page") { await host.show?.(item.file); initial.assertLive(); }
        const outcome = await improveRow(await context(), { row: item.file, known, maps, signal, by: "agent", measure: item.kind === "page" ? host.measure : undefined, siteUrl: host.url?.() }, ports);
        initial.assertLive();
        rows.push({ file: outcome.file, label: outcome.label, changed: outcome.changed, notes: outcome.notes, left: outcome.left });
      } catch (error) {
        // A branch or revision change stops the run; ordinary row failures leave later rows available.
        initial.assertLive();
        if (error instanceof DOMException && error.name === "AbortError") throw error;
        failed.push({ file: item.file, message: error instanceof Error ? error.message : String(error) });
      }
    }
    const changed = rows.filter(item => item.changed).length, failureCount = failed.length;
    const leftForLex = rows.reduce((count, item) => count + item.left.filter(picture => picture.reason === "for-lex").length, 0);
    // Pictures the user left alone (everywhere or in one file) are skipped and listed, each once.
    const leftAlone = new Set(rows.flatMap(item => item.left.filter(picture => picture.reason === LEFT_ALONE).map(picture => picture.key))).size;
    const report = { rows, failed, changed, leftForLex, leftAlone, total: selected.length, omittedRows: 0, omittedFailures: 0 };
    const serialize = () => JSON.stringify(report);
    // Whole row reports stay intact; counts describe any details that cannot fit the command response.
    while (textBytes(serialize()) > MEDIA_LIST_LIMIT) {
      if (rows.length) { rows.pop(); report.omittedRows++; }
      else { failed.pop(); report.omittedFailures++; }
    }
    return { message: !changed && !leftForLex && !failureCount ? "Nothing to improve. Nothing was written." : selected.length ? `Improve images: ${changed} rows changed, ${failureCount} failed, unsaved.`
      : row ? `Nothing to improve in ${row}. Nothing was written.` : "Nothing to improve. Nothing was written.", result: { report: serialize() } };
  } finally { cache.dispose(); }
}
