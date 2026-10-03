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
let mounted: ReturnType<typeof mountGridEditor> | ReturnType<typeof mountImageFocalPoint> | undefined;
const expected = { selection: 'fixture', source: 'opaque snapshot' };
const writes: { properties: Record<string, string | null>; sameExpected: boolean }[] = [];
const shared = { expected, isCurrent: () => current, readOnly: () => readOnly, onChange: (properties: Record<string, string | null>, token: unknown) => { writes.push({ properties, sameExpected: token === expected }); } };
const api = {
  writes,
  mount(kind: 'grid' | 'focal', raw?: string, mode: 'object-position' | 'background-position' = 'object-position') {
    mounted?.dispose(); writes.length = 0; current = true; readOnly = false;
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
