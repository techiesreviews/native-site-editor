/** Native focus-position control. The host resolves preview bytes; this leaf never fetches assets. */
export type FocalPreviewAsset = { dataURL: string; hostTrusted?: boolean } | { blobURL: string; hostTrusted: true };
export interface ImageFocalPointOptions<T> {
  mode: 'object-position' | 'background-position';
  previewAsset: FocalPreviewAsset;
  authored?: string;
  computed?: string;
  fit?: string;
  size?: string;
  readOnly?: boolean | (() => boolean);
  expected: T;
  isCurrent: (expected: T) => boolean;
  onChange: (properties: Record<string, string | null>, expected: T) => void | Promise<void>;
  onError?: (error: unknown) => void;
}
let focusStatusId = 0;
export interface FocusPoint { x: number; y: number }
export function clampFocus(value: number) { return Math.min(100, Math.max(0, value)); }
/** Deliberately excludes lengths, calc(), edge offsets, and multi-layer backgrounds. */
export function parseFocusPosition(raw: string): FocusPoint | undefined {
  const tokens = raw.trim().toLowerCase().split(/\s+/);
  if (!raw.trim() || tokens.length > 2) return;
  const percent = (value: string) => /^[-+]?(?:\d+\.?\d*|\.\d+)%$/.test(value) ? clampFocus(Number(value.slice(0, -1))) : undefined;
  const horizontal = (value: string) => value === 'left' ? 0 : value === 'right' ? 100 : value === 'center' ? 50 : percent(value);
  const vertical = (value: string) => value === 'top' ? 0 : value === 'bottom' ? 100 : value === 'center' ? 50 : percent(value);
  if (tokens.length === 1) {
    if (tokens[0] === 'top' || tokens[0] === 'bottom') return { x: 50, y: vertical(tokens[0])! };
    const x = horizontal(tokens[0]); return x === undefined ? undefined : { x, y: 50 };
  }
  if ((tokens[0] === 'top' || tokens[0] === 'bottom') || (tokens[1] === 'left' || tokens[1] === 'right')) tokens.reverse();
  const x = horizontal(tokens[0]), y = vertical(tokens[1]);
  return x === undefined || y === undefined ? undefined : { x, y };
}
export function trustedPreviewURL(asset: FocalPreviewAsset): string {
  if ('dataURL' in asset && /^data:image\/(?:png|jpeg|gif|webp|avif);base64,[A-Za-z0-9+/]+={0,2}$/i.test(asset.dataURL)) return asset.dataURL;
  if ('dataURL' in asset && asset.hostTrusted === true && /^data:image\/svg\+xml(?:;charset=utf-8)?(?:;base64)?,.+$/i.test(asset.dataURL)) return asset.dataURL;
  if ('blobURL' in asset && asset.hostTrusted === true && /^blob:https?:\/\//i.test(asset.blobURL)) return asset.blobURL;
  throw new Error('Focus preview requires raster image bytes or explicitly host-trusted SVG bytes / blob URL.');
}
/** Full image coordinates inside an object-fit:contain box, excluding letterbox space. */
export function containedImageRect(box: { left: number; top: number; width: number; height: number }, width: number, height: number) {
  if (width <= 0 || height <= 0 || box.width <= 0 || box.height <= 0) return undefined;
  const scale = Math.min(box.width / width, box.height / height), w = width * scale, h = height * scale;
  return { left: box.left + (box.width - w) / 2, top: box.top + (box.height - h) / 2, width: w, height: h };
}
export function mountImageFocalPoint<T>(container: HTMLElement, options: ImageFocalPointOptions<T>) {
  const url = trustedPreviewURL(options.previewAsset);
  const expected = options.expected;
  const events = new AbortController(); let disposed = false;
  const allowed = () => !disposed && !(typeof options.readOnly === 'function' ? options.readOnly() : options.readOnly) && options.isCurrent(expected);
  const root = document.createElement('section'); root.className = 'image-focal-point'; root.setAttribute('aria-label', 'Image focus');
  const preview = document.createElement('div'); preview.className = 'image-focal-point__preview'; preview.tabIndex = 0; preview.setAttribute('role', 'group'); preview.setAttribute('aria-label', 'Full image focus preview. Use arrow keys to set focus; Shift moves ten percent.');
  const image = document.createElement('img'); image.alt = ''; image.draggable = false; image.src = url;
  const marker = document.createElement('span'); marker.className = 'image-focal-point__marker'; marker.setAttribute('aria-hidden', 'true'); preview.append(image, marker);
  const status = document.createElement('p'); status.className = 'image-focal-point__status'; status.setAttribute('aria-live', 'polite');
  status.id = `image-focus-status-${++focusStatusId}`; preview.setAttribute('aria-describedby', status.id);
  const context = document.createElement('p'); context.className = 'image-focal-point__context'; context.textContent = `Full image; crop depends on container and ${options.mode === 'object-position' ? `object-fit: ${options.fit ?? 'default'}` : `background-size: ${options.size ?? 'default'}`}.`;
  const raw = options.authored ?? options.computed ?? '';
  let point = parseFocusPosition(raw), committed = point ? { ...point } : undefined;
  const clampedRaw = raw.split(/\s+/).some(token => /^[-+]?(?:\d+\.?\d*|\.\d+)%$/.test(token) && (Number.parseFloat(token) < 0 || Number.parseFloat(token) > 100));
  let edited = false, acceptedEdit = false, writeVersion = 0;
  let pendingValue: string | undefined;
  let drag: { id: number; before?: FocusPoint } | undefined;
  const inputs: HTMLInputElement[] = [];
  root.append(preview);
  for (const axis of ['x', 'y'] as const) {
    const label = document.createElement('label'); label.append(`${axis.toUpperCase()} (%)`);
    const input = document.createElement('input'); input.type = 'number'; input.min = '0'; input.max = '100'; input.step = '1'; input.placeholder = 'Custom'; label.append(input); root.append(label); inputs.push(input);
    // Text typed but not yet committed is the user's: redraws (image load,
    // resize, refresh) leave it in place while the field has focus.
    input.addEventListener('input', () => { input.dataset.focalDraft = 'true'; }, { signal: events.signal });
    input.addEventListener('blur', () => { delete input.dataset.focalDraft; }, { signal: events.signal });
    const commit = () => {
      if (drag || !allowed() || input.value.trim() === '' || !Number.isFinite(Number(input.value))) return;
      delete input.dataset.focalDraft;
      const next = { ...(point ?? { x: 50, y: 50 }), [axis]: clampFocus(Number(input.value)) }; publish(next);
    };
    input.addEventListener('change', commit, { signal: events.signal });
    input.addEventListener('keydown', event => {
      if (event.key === 'Enter') { event.preventDefault(); commit(); }
      if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
        event.preventDefault(); if (drag || !allowed()) return;
        publish({ ...(point ?? { x: 50, y: 50 }), [axis]: clampFocus((point?.[axis] ?? 50) + (event.key === 'ArrowUp' ? 1 : -1) * (event.shiftKey ? 10 : 1)) });
      }
    }, { signal: events.signal });
  }
  root.append(status, context);
  function draw() {
    inputs.forEach((input, index) => {
      if (input.dataset.focalDraft && document.activeElement === input) return;
      input.value = point ? String(index ? point.y : point.x) : '';
    });
    marker.hidden = !point;
    const box = image.getBoundingClientRect(), rect = containedImageRect(box, image.naturalWidth, image.naturalHeight);
    if (point && rect) { marker.style.left = `${rect.left - box.left + rect.width * point.x / 100}px`; marker.style.top = `${rect.top - box.top + rect.height * point.y / 100}px`; }
    status.textContent = point && clampedRaw && !edited && !drag ? `${options.authored === undefined ? 'Computed' : 'Authored'} position: ${raw}. Editing marker clamped to ${point.x}% ${point.y}%; source unchanged.` : point ? `${point.x}% ${point.y}%${options.authored === undefined && !edited && !drag ? ' · computed' : ''}` : `Custom position: ${raw || 'default'}. Set percentages to replace it.`;
  }
  function publish(next: FocusPoint) {
    if (!allowed()) return;
    next = { x: Math.round(clampFocus(next.x) * 100) / 100, y: Math.round(clampFocus(next.y) * 100) / 100 };
    const replaceClampedSource = clampedRaw && !acceptedEdit;
    edited = true; point = next; draw();
    const value = `${next.x}% ${next.y}%`;
    if (pendingValue === value || (!replaceClampedSource && committed?.x === next.x && committed.y === next.y)) return;
    const version = ++writeVersion; pendingValue = value;
    const accepted = { ...next };
    const succeed = () => { if (allowed() && version === writeVersion) { committed = accepted; acceptedEdit = true; } };
    const fail = (error: unknown) => { if (version === writeVersion) { point = committed && { ...committed }; draw(); if (!disposed) options.onError?.(error); } };
    const finish = () => { if (version === writeVersion) pendingValue = undefined; };
    try {
      const result = options.onChange({ [options.mode]: value }, expected);
      if (result) void Promise.resolve(result).then(succeed, fail).finally(finish);
      else { succeed(); finish(); }
    } catch (error) { fail(error); finish(); }
  }
  function cancel() {
    if (!drag) return;
    const current = drag; drag = undefined; point = current.before; draw();
    if (preview.hasPointerCapture(current.id)) preview.releasePointerCapture(current.id);
  }
  function locate(event: PointerEvent) {
    const rect = containedImageRect(image.getBoundingClientRect(), image.naturalWidth, image.naturalHeight);
    if (!rect) return undefined;
    return { x: clampFocus((event.clientX - rect.left) / rect.width * 100), y: clampFocus((event.clientY - rect.top) / rect.height * 100) };
  }
  preview.addEventListener('pointerdown', event => {
    if (event.button !== 0 || drag || !allowed()) return;
    const next = locate(event); if (!next) return;
    event.preventDefault(); preview.focus(); drag = { id: event.pointerId, before: point ? { ...point } : undefined }; preview.setPointerCapture(event.pointerId); point = next; draw();
  }, { signal: events.signal });
  preview.addEventListener('pointermove', event => {
    if (drag?.id !== event.pointerId) return;
    if (!allowed()) { cancel(); return; } point = locate(event) ?? point; draw();
  }, { signal: events.signal });
  preview.addEventListener('pointerup', event => {
    if (drag?.id !== event.pointerId) return;
    if (!allowed()) { cancel(); return; }
    const next = locate(event) ?? point, id = drag.id; drag = undefined;
    if (preview.hasPointerCapture(id)) preview.releasePointerCapture(id);
    if (next) publish(next);
  }, { signal: events.signal });
  preview.addEventListener('pointercancel', event => { if (drag?.id === event.pointerId) cancel(); }, { signal: events.signal });
  preview.addEventListener('lostpointercapture', cancel, { signal: events.signal });
  root.addEventListener('keydown', event => {
    if (event.key === 'Escape' && drag) { event.preventDefault(); event.stopPropagation(); cancel(); return; }
    if (event.target !== preview || !['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return;
    event.preventDefault(); if (drag || !allowed()) return;
    const next = { ...(point ?? { x: 50, y: 50 }) }, step = event.shiftKey ? 10 : 1;
    if (event.key === 'ArrowLeft') next.x -= step; if (event.key === 'ArrowRight') next.x += step;
    if (event.key === 'ArrowUp') next.y -= step; if (event.key === 'ArrowDown') next.y += step;
    publish(next);
  }, { signal: events.signal });
  image.addEventListener('load', draw, { signal: events.signal });
  const observer = new ResizeObserver(draw); observer.observe(preview);
  function refresh() { if (!allowed()) cancel(); for (const input of inputs) input.disabled = !allowed(); preview.setAttribute('aria-disabled', String(!allowed())); draw(); }
  container.append(root); refresh();
  return { element: root, refresh, dispose() { if (disposed) return; cancel(); disposed = true; events.abort(); observer.disconnect(); image.removeAttribute('src'); root.remove(); } };
}
