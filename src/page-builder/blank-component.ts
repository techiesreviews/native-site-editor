/** A blank section's template, styles and draft paths. */
export function blankComponentFiles(tag: string) {
  return [
    { path: `components/${tag}/${tag}.html`, content: `<section>
  <slot name="title"><h2>New section</h2></slot>
  <slot></slot>
</section>
` },
    { path: `components/${tag}/${tag}.css`, content: `:host {
  display: block;
}

/* Slots are display: contents, so the section spaces its slotted children with a gap. */
section {
  display: flex;
  flex-direction: column;
  gap: var(--space-m);
}
` },
  ];
}
