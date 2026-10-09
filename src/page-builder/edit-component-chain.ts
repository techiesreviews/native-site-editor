/** A level's instance is addressed in the preceding level's template. */
export interface EditComponentLevel {
  tag: string;
  templatePath: string;
  node: readonly number[];
}

/** Reopening a tag already in the chain returns to it instead of recursing. */
export function drillChain(chain: readonly EditComponentLevel[], step: EditComponentLevel): EditComponentLevel[] {
  const index = chain.findIndex((level) => level.tag === step.tag);
  return index < 0 ? [...chain, { ...step, node: [...step.node] }] : backChain(chain, index);
}

export function backChain(chain: readonly EditComponentLevel[], index: number): EditComponentLevel[] {
  if (!Number.isInteger(index) || index < 0 || index >= chain.length) return [...chain];
  return chain.slice(0, index + 1);
}
