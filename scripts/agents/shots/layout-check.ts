import type { Page } from "@playwright/test";

export type LayoutFinding = { message: string; selector?: string };

/** Ticket 07 supplies layout checks. */
export async function checkLayout(_page: Page): Promise<LayoutFinding[]> {
  return [];
}
