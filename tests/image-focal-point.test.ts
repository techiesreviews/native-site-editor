import { test } from 'node:test';
import assert from 'node:assert/strict';
import { clampFocus, containedImageRect, parseFocusPosition, trustedPreviewURL } from '../src/components/image-focal-point.ts';

test('percentages and native keyword positions normalize without inventing custom coordinates', () => {
  for (const [raw, point] of [['25% 75%', { x: 25, y: 75 }], ['top right', { x: 100, y: 0 }], ['center bottom', { x: 50, y: 100 }], ['left', { x: 0, y: 50 }], ['top', { x: 50, y: 0 }], ['120% -2%', { x: 100, y: 0 }]] as const) assert.deepEqual(parseFocusPosition(raw), point);
  for (const raw of ['10px 20px', 'calc(50% + 1px) center', 'right 10px bottom 20px', 'left right', 'top bottom', 'center, center', '']) assert.equal(parseFocusPosition(raw), undefined, raw);
  assert.equal(clampFocus(-1), 0); assert.equal(clampFocus(101), 100);
});
test('contain geometry excludes letterboxes for landscape and portrait images', () => {
  assert.deepEqual(containedImageRect({ left: 10, top: 20, width: 200, height: 200 }, 400, 200), { left: 10, top: 70, width: 200, height: 100 });
  assert.deepEqual(containedImageRect({ left: 10, top: 20, width: 200, height: 200 }, 200, 400), { left: 60, top: 20, width: 100, height: 200 });
  assert.equal(containedImageRect({ left: 0, top: 0, width: 0, height: 100 }, 1, 1), undefined);
});
test('only raster bytes or explicitly trusted host blobs can be previews', () => {
  assert.equal(trustedPreviewURL({ dataURL: 'data:image/png;base64,AAAA' }), 'data:image/png;base64,AAAA');
  assert.equal(trustedPreviewURL({ blobURL: 'blob:http://localhost/id', hostTrusted: true }), 'blob:http://localhost/id');
  for (const dataURL of ['https://example.com/image.png', 'data:image/svg+xml;base64,AAAA', 'data:text/html;base64,AAAA', 'data:image/png;base64,']) assert.throws(() => trustedPreviewURL({ dataURL }));
  assert.throws(() => trustedPreviewURL({ blobURL: 'https://example.com/a', hostTrusted: true }));
});
