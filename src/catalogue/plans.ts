// The planning mock-ups on the catalogue board: every mock-up of the mock-ups page (vite-mockups.ts, `/mockups/list/`) as a
// card, one area per map like the page. The preview build writes them to `/mockups/board.json`; a board served without
// them (the dev server, a build without MOCKUPS=1) simply has no such areas. A card shows its label, its picture when it
// has one, and a link that opens the mock-up. Cards move like every other card; they are not parts, so they are not approved.
import type { Control, Values } from "./parts";

/** The labels the page gives, from vite-mockups.ts `SHIPPING_LABELS`. */
export const PLAN_LABELS = ["live", "preview", "building", "planned", "idea"] as const;
export type PlanLabel = (typeof PLAN_LABELS)[number];

/** One map's area: `plan:<map>`. */
export type PlanAreaId = `plan:${string}`;
export interface PlanArea { id: PlanAreaId; name: string }

/** A mock-up's card. It has no options and is made of nothing, so the board treats it as a part with neither. */
export interface PlanMockup {
  id: string;
  area: PlanAreaId;
  name: string;
  /** The mock-up's own file. */
  files: readonly string[];
  defaults: Values;
  controls: readonly Control[];
  label: PlanLabel;
  labelName: string;
  /** The tickets it came from: `tickets 21, 22`; empty for none. */
  tickets: string;
  /** Where "Open mock-up" leads. */
  href: string;
  /** Its agreed picture, for a released mock-up that has one. */
  picture?: string;
}

export interface Plans { areas: PlanArea[]; mockups: PlanMockup[] }

export const isPlan = (entry: { area: string }): entry is PlanMockup => entry.area.startsWith("plan:");

/** A text is an address on the site's own mock-ups. */
const ownAddress = (value: unknown): value is string => typeof value === "string" && value.startsWith("/mockups/") && !value.includes("//");
const text = (value: unknown): value is string => typeof value === "string" && value !== "";

/** The areas and cards from `/mockups/board.json`; anything that is not as the build writes it is left out. */
export function parsePlans(source: string): Plans {
  const plans: Plans = { areas: [], mockups: [] };
  let data: unknown;
  try { data = JSON.parse(source); } catch { return plans; }
  const maps = (data as { maps?: unknown } | null)?.maps;
  if (!Array.isArray(maps)) return plans;
  for (const entry of maps) {
    const { map, mockups } = (entry ?? {}) as { map?: unknown; mockups?: unknown };
    if (!text(map) || !Array.isArray(mockups)) continue;
    const area: PlanAreaId = `plan:${map}`;
    const cards: PlanMockup[] = [];
    for (const item of mockups) {
      const card = (item ?? {}) as Record<string, unknown>;
      const { file, title, label, labelName, tickets, href, picture } = card;
      if (!text(file) || !text(title) || !PLAN_LABELS.includes(label as PlanLabel) || !text(labelName) || typeof tickets !== "string" || !ownAddress(href)) continue;
      cards.push({
        id: `plan:${map}/${file}`, area, name: title, files: [`docs/wayfinder/${map}/prototypes/${file}`], defaults: {}, controls: [],
        label: label as PlanLabel, labelName, tickets, href, ...(ownAddress(picture) ? { picture } : {}),
      });
    }
    if (!cards.length || plans.areas.some((item) => item.id === area)) continue;
    plans.areas.push({ id: area, name: map });
    plans.mockups.push(...cards);
  }
  return plans;
}

/** The build's list of mock-ups; none where there is no list (the dev server answers with its own page). */
export async function loadPlans(): Promise<Plans> {
  try {
    const response = await fetch("/mockups/board.json");
    return response.ok ? parsePlans(await response.text()) : { areas: [], mockups: [] };
  } catch {
    return { areas: [], mockups: [] };
  }
}
