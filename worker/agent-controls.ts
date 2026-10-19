/** All Worker switch reads live here; malformed values always pause a feature. */
export interface AgentControlEnv {
  AGENT_RELAY?: string;
  AGENT_WATCH?: string;
  AGENT_LIFECYCLE_CLEANUP?: string;
  AGENT_LEGACY_MAINTENANCE?: string;
  AGENT_MODERN_REGISTRATION?: string;
}

const enabled = (value: string | undefined, fallback: boolean) =>
  value === undefined ? fallback : typeof value === "string" && value.trim().toLowerCase() === "on";

export function agentControls(env: AgentControlEnv) {
  const controls = {
    relay: enabled(env.AGENT_RELAY, true),
    watch: enabled(env.AGENT_WATCH, true),
    lifecycleCleanup: enabled(env.AGENT_LIFECYCLE_CLEANUP, true),
    legacyMaintenance: enabled(env.AGENT_LEGACY_MAINTENANCE, false),
    modernRegistration: enabled(env.AGENT_MODERN_REGISTRATION, false),
  };
  // Modern registration is not implemented. Even an explicit "on" stays off.
  controls.modernRegistration = false;
  return controls;
}

export const AGENTS_PAUSED = "Remote agents are paused by the site owner.";
export const WATCH_PAUSED = "Watch is paused by the site owner. Agents still get requests when they ask.";

export function agentsPaused(headers: Record<string, string> = {}) {
  return Response.json({ error: AGENTS_PAUSED, code: "agents-paused" }, {
    status: 403, headers: { "Cache-Control": "no-store", ...headers },
  });
}
