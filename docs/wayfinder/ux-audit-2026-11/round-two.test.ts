import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = join(dirname(fileURLToPath(import.meta.url)), 'prototypes');
for (const file of readdirSync(root).filter(f => /^\d\d-.*\.html$/.test(f))) {
  test(`${file}: uses the catalogue shell and guided comparison`, () => {
    const html=readFileSync(join(root,file),'utf8');
    assert.ok(html.includes('ps-row') && html.includes('page-structure__row'), 'real catalogue row anatomy');
    assert.ok(html.includes('Play a step (these buttons are not part of the editor)'), 'mock controls identified');
    assert.ok(html.includes('data-theme-set="light dark"'), 'System / Light / Dark');
    assert.ok(html.includes('data-node="footer"'), 'complete site context');
  });
}
