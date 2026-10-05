/** Native, host-independent grid controls. Import grid-editor.css in the editor host. */
export interface GridEditorOptions<T> {
  authored: Record<string, string | undefined>;
  computed?: Record<string, string | undefined>;
  readOnly?: boolean | (() => boolean);
  expected: T;
  isCurrent: (expected: T) => boolean;
  onChange: (properties: Record<string, string | null>, expected: T) => void | Promise<void>;
  onError?: (error: unknown) => void;
  makeGrid?: () => void;
}
export const MAX_GRID_TRACKS = 24;
let gridErrorId = 0;
/** Only explicit equal fractional tracks are editable as counts. Computed pixels are custom. */
export function equalTrackCount(raw: string): number | undefined {
  const value = raw.trim();
  const repeat = /^repeat\(\s*(\d+)\s*,\s*(?:1fr|minmax\(\s*0\s*,\s*1fr\s*\))\s*\)$/i.exec(value);
  const count = repeat ? Number(repeat[1]) : /^(?:1fr\s+)*1fr$/i.test(value) ? value.split(/\s+/).length : 0;
  return count >= 1 && count <= MAX_GRID_TRACKS ? count : undefined;
}
/** Resolved browser tracks only: unresolved functions and subgrid cannot give a current count. */
export function resolvedTrackCount(raw: string): number | undefined {
  const value = raw.replace(/\[[^\[\]]*\]/g, ' ').trim();
  const tracks = value ? value.split(/\s+/) : [];
  return tracks.length >= 1 && tracks.length <= MAX_GRID_TRACKS &&
    tracks.every(track => /^(?:\d+(?:\.\d+)?|\.\d+)px$/i.test(track)) ? tracks.length : undefined;
}
export function mountGridEditor<T>(container: HTMLElement, options: GridEditorOptions<T>) {
  const root = document.createElement('section'); root.className = 'grid-editor'; root.setAttribute('aria-label', 'Grid layout');
  const expected = options.expected;
  const events = new AbortController(); let disposed = false; let busy = false;
  const allowed = () => !disposed && !(typeof options.readOnly === 'function' ? options.readOnly() : options.readOnly) && options.isCurrent(expected);
  const emit = async (properties: Record<string, string | null>, accepted: () => void) => {
    if (!allowed() || busy) return;
    busy = true; refresh();
    try {
      await options.onChange(properties, expected);
      if (allowed()) accepted();
    } catch (error) { if (allowed()) options.onError?.(error); }
    finally { busy = false; if (!disposed) refresh(); }
  };
  const preview = document.createElement('div'); preview.className = 'grid-editor__preview'; preview.setAttribute('role', 'img'); root.append(preview);
  let computed: Readonly<Record<string, string | undefined>> | undefined = options.computed;
  const customStatuses: Record<string, { status: HTMLParagraphElement; description: string }> = {};
  const counts: Record<string, number | undefined> = {};
  const resolved: Record<string, number | undefined> = {};
  function renderPreview() {
    const columns = counts.columns ?? resolved.columns, rows = counts.rows ?? resolved.rows;
    const equal = Boolean(counts.columns && counts.rows);
    preview.replaceChildren();
    preview.dataset.custom = String(!equal);
    preview.style.height = columns || rows ? '' : 'auto';
    if (!columns && !rows) {
      preview.setAttribute('aria-label', 'Grid track preview unavailable: current tracks could not be resolved');
      preview.textContent = 'Current track count unavailable';
      return;
    }
    preview.setAttribute('aria-label', equal ? `Equal grid preview: ${columns} columns, ${rows} rows`
      : `Current grid track count at this width: ${columns ? `${columns} columns` : 'columns unresolved'}, ${rows ? `${rows} rows` : 'rows unresolved'}. Track sizes are schematic.`);
    preview.style.gridTemplateColumns = `repeat(${columns ?? 1}, minmax(0, 1fr))`;
    preview.style.gridTemplateRows = `repeat(${rows ?? 1}, minmax(0, 1fr))`;
    for (let i = 0; i < (columns ?? 1) * (rows ?? 1); i++) preview.append(document.createElement('span'));
  }
  for (const axis of ['columns', 'rows']) {
    const property = `grid-template-${axis}`, authored = options.authored[property];
    const raw = authored ?? options.computed?.[property] ?? '';
    counts[axis] = equalTrackCount(raw);
    resolved[axis] = resolvedTrackCount(options.computed?.[property] ?? '');
    const label = document.createElement('label'); label.className = 'grid-editor__field'; label.append(axis === 'columns' ? 'Columns' : 'Rows');
    const input = document.createElement('input'); input.type = 'number'; input.min = '1'; input.max = String(MAX_GRID_TRACKS); input.step = '1'; input.value = counts[axis] ? String(counts[axis]) : ''; label.append(input);
    const status = document.createElement('p'); status.className = 'grid-editor__status';
    status.textContent = counts[axis] ? `${counts[axis]} equal tracks${authored === undefined ? ' · computed' : ''}` : `${authored === undefined && raw ? 'Computed' : 'Custom'} ${axis}: ${raw || 'default / implicit tracks'}`;
    if (!counts[axis]) customStatuses[axis] = { status, description: status.textContent };
    const button = document.createElement('button'); button.type = 'button'; const updateButton = () => { button.textContent = 'Apply'; button.setAttribute('aria-label', `Apply: replace with ${input.value || 'N'} equal ${axis}`); button.title = button.getAttribute('aria-label')!; };
    updateButton(); input.addEventListener('input', updateButton, { signal: events.signal });
    const error = document.createElement('p'); error.className = 'grid-editor__error'; error.hidden = true;
    error.id = `grid-count-error-${++gridErrorId}`; input.setAttribute('aria-describedby', error.id);
    let invalidValue: string | undefined;
    button.addEventListener('click', () => {
      if (!allowed() || busy || !input.value.trim()) return;
      const count = Number(input.value);
      if (!Number.isInteger(count) || count < 1 || count > MAX_GRID_TRACKS) {
        const message = `Enter a whole number from 1 to ${MAX_GRID_TRACKS}.`;
        input.setAttribute('aria-invalid', 'true'); error.textContent = message; error.hidden = false;
        if (invalidValue !== input.value) options.onError?.(new Error(message));
        invalidValue = input.value; return;
      }
      invalidValue = undefined; input.removeAttribute('aria-invalid'); error.hidden = true; error.textContent = '';
      void emit({ [property]: `repeat(${count}, minmax(0, 1fr))` }, () => { counts[axis] = count; status.textContent = `${count} equal tracks`; renderPreview(); });
    }, { signal: events.signal });
    root.append(label, button, error, status);
  }
  for (const property of ['gap', 'column-gap', 'row-gap']) {
    const label = document.createElement('label'); label.className = 'grid-editor__field'; label.append(property === 'gap' ? 'Gap' : property === 'column-gap' ? 'Column gap' : 'Row gap');
    const input = document.createElement('input'); input.type = 'text'; input.value = options.authored[property] ?? ''; input.placeholder = options.computed?.[property] ?? 'Default'; label.append(input);
    const error = document.createElement('p'); error.className = 'grid-editor__error'; error.hidden = true;
    error.id = `grid-gap-error-${++gridErrorId}`; input.setAttribute('aria-describedby', error.id);
    let last = input.value, invalidValue: string | undefined;
    const commit = () => {
      const value = input.value.trim();
      if (!allowed() || busy) return;
      if (value && !CSS.supports(property, value)) {
        const message = `Enter a valid ${property.replaceAll('-', ' ')}.`;
        input.setAttribute('aria-invalid', 'true'); error.textContent = message; error.hidden = false;
        if (invalidValue !== value) options.onError?.(new Error(message));
        invalidValue = value; return;
      }
      invalidValue = undefined; input.removeAttribute('aria-invalid'); error.hidden = true; error.textContent = '';
      if (value === last) return;
      void emit({ [property]: value || null }, () => { last = value; });
    };
    input.addEventListener('change', commit, { signal: events.signal });
    input.addEventListener('keydown', event => { if (event.key === 'Enter') { event.preventDefault(); commit(); } }, { signal: events.signal });
    root.append(label, error);
  }
  if (options.makeGrid) {
    const button = document.createElement('button'); button.type = 'button'; button.textContent = 'Make grid';
    button.addEventListener('click', () => { if (allowed() && !busy) options.makeGrid?.(); }, { signal: events.signal }); root.append(button);
  }
  function refresh(currentComputed?: Readonly<Record<string, string | undefined>>) {
    if (currentComputed) computed = currentComputed;
    for (const axis of ['columns', 'rows']) {
      resolved[axis] = resolvedTrackCount(computed?.[`grid-template-${axis}`] ?? '');
      const custom = customStatuses[axis];
      const collapsed = /(?:^|\s)0(?:\.0+)?px(?:\s|$)/.test(computed?.[`grid-template-${axis}`] ?? '');
      const caption = resolved[axis] ? ` · Currently ${resolved[axis]} ${axis} at this width${collapsed ? ' (includes collapsed tracks)' : ''}`
        : ' · Current track count unavailable';
      if (custom && !counts[axis]) custom.status.textContent = custom.description + caption;
    }
    renderPreview();
    root.setAttribute('aria-busy', String(busy));
    for (const control of root.querySelectorAll<HTMLInputElement | HTMLButtonElement>('input,button')) {
      const blocked = busy || !allowed();
      // Preserve native keyboard focus through pending and stale completion.
      control.disabled = !allowed() && !busy && document.activeElement !== control;
      control.setAttribute('aria-disabled', String(blocked));
      if (control instanceof HTMLInputElement) control.readOnly = blocked;
    }
  }
  refresh(); container.append(root);
  return { element: root, refresh, dispose() { if (disposed) return; disposed = true; events.abort(); root.remove(); } };
}
