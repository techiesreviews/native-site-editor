// The real Style panel with a controlled image-asset boundary: focalAsset
// resolves only when the test says so. Each write is recorded, then applied to
// the harness CSS the way a host would apply it.
import { createStylePanel, type StylePanelContext } from '../../src/components/style-panel';

const canvas = document.createElement('canvas'); canvas.width = 400; canvas.height = 200;
canvas.getContext('2d')!.fillRect(0, 0, 400, 200);
const asset = { dataURL: canvas.toDataURL('image/png') };
const css = (position: string) => `.hero { object-position: ${position}; }\n.card { object-position: 70% 80%; }\n`;
let context: StylePanelContext = { key: 'hero', tag: 'img', className: 'hero', classes: ['hero'], target: { path: 'site.css', selector: '.hero', start: 0 },
  files: { 'site.css': css('20% 30%') }, computed: { 'object-position': '20% 30%' }, assetRevision: 'a1' };
const pending: { revision?: string; key: string; resolve(): void }[] = [];
const writes: { properties: Record<string, string | null>; state: string; key?: string; revision?: string; source?: string }[] = [];
const errors: string[] = [];
const workspace = document.querySelector<HTMLElement>('#workspace')!;
const view = createStylePanel({
  context: () => context,
  // A write is recorded, then applied to the rule's source as the host would.
  write: async (properties, _breakpoint, state, expected) => {
    writes.push({ properties, state, key: expected?.key, revision: expected?.assetRevision, source: expected?.files['site.css'] });
    const position = properties['object-position'];
    if (position && !state && expected?.key === 'hero') api.setPosition(position);
  },
  variable: async () => {}, selectClass: () => {}, addClass: async () => {}, showCode: async () => {}, history: () => {},
  error: message => { errors.push(message); },
  focalAsset: expected => new Promise(resolve => pending.push({ revision: expected.assetRevision, key: expected.key, resolve: () => resolve({ mode: 'object-position', asset }) })),
}, workspace);
workspace.append(view.root);
const api: { [name: string]: any } = {
  writes, errors,
  pending: () => pending.map(item => `${item.key}@${item.revision}`),
  /** Resolves every pending asset request, oldest first. */
  resolveAll() { while (pending.length) pending.shift()!.resolve(); },
  bumpAsset(revision: string) { context = { ...context, assetRevision: revision }; view.update(); },
  /** Newer CSS for the same rule (an agent, code or Undo edit), same target. */
  setPosition(position: string) { context = { ...context, files: { 'site.css': css(position) }, computed: { 'object-position': position } }; view.update(); },
  selectCard() { context = { ...context, key: 'card', className: 'card', classes: ['card'], target: { path: 'site.css', selector: '.card', start: css('20% 30%').indexOf('.card') }, computed: { 'object-position': '70% 80%' } }; view.update(); },
};
Object.assign(window, { panel: api });
