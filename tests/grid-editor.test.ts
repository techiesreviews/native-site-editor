import { test } from 'node:test';
import assert from 'node:assert/strict';
import { equalTrackCount } from '../src/components/grid-editor.ts';

test('equal tracks recognize only bounded simple authored fractional templates', () => {
  for (const [raw, count] of [['1fr', 1], ['1fr 1fr 1fr', 3], ['repeat(4, minmax(0, 1fr))', 4], ['repeat(24, 1fr)', 24]] as const) assert.equal(equalTrackCount(raw), count);
  for (const raw of ['repeat(25, 1fr)', 'repeat(0, 1fr)', '[start] 1fr [end]', 'subgrid', 'repeat(auto-fit, minmax(100px, 1fr))', 'minmax(0, 1fr) 1fr', '100px 100px', 'none', '']) assert.equal(equalTrackCount(raw), undefined, raw);
});
