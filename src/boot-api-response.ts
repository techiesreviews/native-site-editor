import type { BootResponse } from "./boot-reads";
export type ApiReceipt<T> = BootResponse<T> & { onboarding?: "install" | "create" };
/** Preserve correlation and onboarding alongside JSON; adoption is the host's decision. */
export async function readApiReceipt<T>(response: Response, error: (status: number, message: string) => Error): Promise<ApiReceipt<T>> {
  const data = await response.json() as T & { error?: string };
  if (!response.ok) throw error(response.status, data.error || "Could not load GitHub data.");
  const hint = response.headers.get("X-Repository-Onboarding");
  return { value: data, sessionTag: response.headers.get("X-Editor-Session"),
    onboarding: hint === "install" || hint === "create" ? hint : undefined };
}
export function repositoryReceipt<T>(receipt: ApiReceipt<T>): BootResponse<{ repositories: T; onboarding?: "install" | "create" }> {
  return { sessionTag: receipt.sessionTag, value: { repositories: receipt.value, onboarding: receipt.onboarding } };
}
