// One preview load per picture at a time (media slice 109): the Social image's thumbnail and the
// share card ask for one picture together, and a second load of the editor's assets would leave
// the first without its picture. Kept per settings dialog's handlers; a settled load is not kept.
type PreviewSource = { imageUrl(value: string): Promise<string | undefined> };

const previewLoads = new WeakMap<PreviewSource, Map<string, Promise<string | undefined>>>();

export function previewUrl(handlers: PreviewSource, value: string) {
  const loading = previewLoads.get(handlers) ?? new Map<string, Promise<string | undefined>>();
  previewLoads.set(handlers, loading);
  const key = value.trim(), now = loading.get(key);
  if (now) return now;
  const next = handlers.imageUrl(value).finally(() => loading.delete(key));
  loading.set(key, next);
  return next;
}
