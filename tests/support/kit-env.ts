// This test process's environment without the kit home a launcher or front door filled in. A fixture inheriting
// KIT_HOME_DEFAULT would read a KIT_HOME it set itself as a front door's, and one inheriting a picked KIT_HOME
// (KIT_HOME_PINNED) picks the machine copy again as any fresh command does. A person's KIT_HOME (a kit branch tried
// against this editor) is kept, so every fixture runs that kit.
export function kitEnv(source: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
  const { KIT_HOME: home, KIT_HOME_DEFAULT: filled, KIT_HOME_PINNED: pinned, ...env } = source;
  if (!home || home === filled || home === pinned) return env;
  return pinned === undefined ? { ...env, KIT_HOME: home } : { ...env, KIT_HOME: home, KIT_HOME_PINNED: pinned };
}
