// A person's KIT_HOME (a kit branch tried against this editor), as the launcher tells it apart: set, and neither a
// front door's own (KIT_HOME_DEFAULT) nor one a launcher picked (KIT_HOME_PINNED).
export function triedKit(source: NodeJS.ProcessEnv = process.env): string | undefined {
  const { KIT_HOME: home, KIT_HOME_DEFAULT: filled, KIT_HOME_PINNED: pinned } = source;
  return home && home !== filled && home !== pinned ? home : undefined;
}

// This test process's environment without the kit home a launcher or front door filled in. A fixture inheriting
// KIT_HOME_DEFAULT would read a KIT_HOME it set itself as a front door's, and one inheriting a picked KIT_HOME
// (KIT_HOME_PINNED) picks the machine copy again as any fresh command does. A person's KIT_HOME is kept, so every
// fixture runs that kit.
export function kitEnv(source: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
  const { KIT_HOME: _home, KIT_HOME_DEFAULT: _filled, KIT_HOME_PINNED: pinned, ...env } = source;
  const home = triedKit(source);
  if (!home) return env;
  return pinned === undefined ? { ...env, KIT_HOME: home } : { ...env, KIT_HOME: home, KIT_HOME_PINNED: pinned };
}
