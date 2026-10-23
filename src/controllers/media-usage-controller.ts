import { sitePathPrefix } from "../../shared/site-path-prefix";
import { isMediaFile, isMediaTextFile, mediaOwnOrigins } from "../page-builder/media-mentions";
import { mediaUsageRecords, type MediaUsageRecords } from "../page-builder/media-usage";

export interface MediaUsageCheckPorts {
  key(): string;
  files(): string[];
  media?(): string[];
  pages(): string[];
  components(): Record<string, string>;
  source(path: string): string | undefined;
  read(path: string): Promise<string | undefined>;
  url(): string | undefined;
  settled(): Promise<unknown>;
  changed(records: MediaUsageRecords | undefined): void;
}

/** Deferred, cancellable checks keep their text outside the preview source map. */
export function createMediaUsageController(ports: MediaUsageCheckPorts) {
  // Each refresh or invalidation starts the next check; an older one publishes nothing.
  let checks = 0, scheduled = false, disposed = false;
  let records: MediaUsageRecords | undefined;
  let lastKey = "";
  const listeners = new Set<(records: MediaUsageRecords | undefined) => void>();
  const publish = (value: MediaUsageRecords | undefined) => {
    records = value; ports.changed(value);
    for (const listener of listeners) listener(value);
  };
  async function check(started: number) {
    const key = ports.key();
    const live = () => !disposed && started === checks && key === ports.key();
    if (!key) { publish(undefined); return; }
    // Old records stay on show while the same site is checked again; another site starts empty.
    if (key !== lastKey) { lastKey = key; if (records) publish(undefined); }
    try { await ports.settled(); } catch { if (live()) publish(undefined); return; }
    if (!live()) return;
    const files = ports.files(), text = files.filter(isMediaTextFile);
    const sources: Record<string, string | undefined> = {};
    for (const file of text) {
      const source = ports.source(file);
      // No private cache: the host holds unchanged text, and an uploaded or moved file is read
      // again on every check, so a replaced one is never judged by its old bytes.
      if (source !== undefined) sources[file] = source;
    }
    const emit = () => publish(mediaUsageRecords({ media: ports.media?.() ?? files.filter(isMediaFile), files: text, sources,
      pages: ports.pages(), components: ports.components(), site: { prefix: sitePathPrefix(ports.url()), origins: mediaOwnOrigins(ports.url(), sources.CNAME) } }));
    emit();
    const pending = text.filter(file => !Object.hasOwn(sources, file));
    for (let index = 0; index < pending.length; index += 12) {
      const values = await Promise.all(pending.slice(index, index + 12).map(async file => {
        try { return [file, await ports.read(file)] as const; } catch { return [file, undefined] as const; }
      }));
      if (!live()) return;
      for (const [file, source] of values) sources[file] = ports.source(file) ?? source;
      emit();
    }
  }
  function refresh() {
    if (disposed) return;
    checks++;
    if (scheduled) return;
    scheduled = true;
    queueMicrotask(() => { scheduled = false; if (!disposed) void check(checks); });
  }
  /** Stops in-flight reads from publishing: their captured sources may be out of date. */
  function invalidate() { if (!disposed) checks++; }
  return { refresh, invalidate, usageRecords: () => records,
    onUsageChange(listener: (records: MediaUsageRecords | undefined) => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    dispose() { disposed = true; checks++; listeners.clear(); publish(undefined); } };
}
