import starterSVG from '../../fixtures/native-starter/images/studio-desk.svg?raw';
import { mountGridEditor } from '../../src/components/grid-editor';
import { mountImageFocalPoint } from '../../src/components/image-focal-point';
import '../../src/components/grid-editor.css';
import '../../src/components/image-focal-point.css';

const fixture = document.querySelector<HTMLElement>('#fixture')!;
const canvas = document.createElement('canvas'); canvas.width = 400; canvas.height = 200;
const context = canvas.getContext('2d')!; context.fillStyle = '#2870b5'; context.fillRect(0, 0, 400, 200);
context.fillStyle = '#ffe5a0'; context.fillRect(100, 40, 200, 120);
const asset = { dataURL: canvas.toDataURL('image/png') };
let current = true, readOnly = false;
let fail = false, pending: ((reject?: boolean) => void) | undefined; const errors: string[] = []; let defer = false;
let mounted: ReturnType<typeof mountGridEditor> | ReturnType<typeof mountImageFocalPoint> | undefined;
const expected = { selection: 'fixture', source: 'opaque snapshot' };
const writes: { properties: Record<string, string | null>; sameExpected: boolean }[] = [];
const shared = { onError: (error: unknown) => errors.push(String(error)), expected, isCurrent: () => current, readOnly: () => readOnly, onChange: (properties: Record<string, string | null>, token: unknown) => { if (fail) { fail = false; return Promise.reject(new Error('Write failed')); }
    if (defer) return new Promise<void>((resolve, reject) => { pending = (failed) => { if (failed) reject(new Error('Write failed')); else { writes.push({ properties, sameExpected: token === expected }); resolve(); } }; });
    writes.push({ properties, sameExpected: token === expected }); } };
const api = {
  writes, errors,
  failNext() { fail = true; },
  deferNext() { defer = true; },
  resolve() { defer = false; pending?.(); pending = undefined; },
  reject() { defer = false; pending?.(true); pending = undefined; },
  implicitGrid() { mounted?.dispose(); mounted = mountGridEditor(fixture, { ...shared, authored: {} }); },
  computedGrid() { mounted?.dispose(); writes.length = 0; mounted = mountGridEditor(fixture, { ...shared, authored: {}, computed: { 'grid-template-columns': '120px 120px' } }); },
  svg(trusted = true) { mounted?.dispose(); writes.length = 0; const previewAsset = { dataURL: `data:image/svg+xml;base64,${btoa(starterSVG)}`, hostTrusted: trusted }; try { mounted = mountImageFocalPoint(fixture, { ...shared, mode: 'object-position', previewAsset, authored: '25% 75%' }); return true; } catch { return false; } },
  mount(kind: 'grid' | 'focal', raw?: string, mode: 'object-position' | 'background-position' = 'object-position') {
    mounted?.dispose(); writes.length = 0; current = true; readOnly = false; errors.length = 0; fail = false; defer = false;
    mounted = kind === 'grid' ? mountGridEditor(fixture, { ...shared, authored: { 'grid-template-columns': raw ?? '[start] 1fr [end]', 'grid-template-rows': 'repeat(2, 1fr)', gap: '8px' }, computed: { 'column-gap': '8px' } })
      : mountImageFocalPoint(fixture, { ...shared, mode, previewAsset: asset, authored: raw ?? '25% 75%', fit: 'cover', size: 'cover' });
  },
  stale(refresh = true) { current = false; if (refresh) mounted?.refresh(); },
  lock(refresh = true) { readOnly = true; if (refresh) mounted?.refresh(); },
  dispose() { mounted?.dispose(); },
  rejectURL() { try { mountImageFocalPoint(fixture, { ...shared, mode: 'object-position', previewAsset: { dataURL: 'https://example.com/untrusted.png' } }); return false; } catch { return true; } },
};
Object.assign(window, { widgets: api });
api.mount('grid');
