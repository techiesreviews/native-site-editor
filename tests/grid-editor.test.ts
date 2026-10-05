import { test } from 'node:test';
import assert from 'node:assert/strict';
import { equalTrackCount } from '../src/components/grid-editor.ts';

test('equal tracks recognize only bounded simple authored fractional templates', () => {
  for (const [raw, count] of [['1fr', 1], ['1fr 1fr 1fr', 3], ['repeat(4, minmax(0, 1fr))', 4], ['repeat(24, 1fr)', 24]] as const) assert.equal(equalTrackCount(raw), count);
  for (const raw of ['repeat(25, 1fr)', 'repeat(0, 1fr)', '[start] 1fr [end]', 'subgrid', 'repeat(auto-fit, minmax(100px, 1fr))', 'minmax(0, 1fr) 1fr', '100px 100px', 'none', '']) assert.equal(equalTrackCount(raw), undefined, raw);
});

test('resolved tracks count current pixels without turning custom authoring into equal tracks', async () => {
  const { resolvedTrackCount } = await import('../src/components/grid-editor.ts');
  assert.equal(equalTrackCount('repeat(auto-fit, minmax(230px, 1fr))'), undefined);
  assert.equal(resolvedTrackCount('240px 240px 240px'), 3);
  assert.equal(resolvedTrackCount('[start] 80px [middle] 200.5px 0px [end]'), 3);
  for (const raw of ['none', '', 'subgrid', 'repeat(3, 1fr)', 'minmax(100px, 1fr) fit-content(200px)', '[start]']) assert.equal(resolvedTrackCount(raw), undefined, raw);
  assert.equal(resolvedTrackCount(Array(25).fill('10px').join(' ')), undefined);
});
