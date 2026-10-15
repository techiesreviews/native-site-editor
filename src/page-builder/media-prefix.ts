import { NATIVE_CONFIG_PATH, nativeSitePrefix } from "../../shared/native-project";
import type { MediaWorkspaceContext } from "./media-workspace";

/** Capture the address through the operation's reader and prove it at the write. */
export async function readMediaPrefix(ctx: MediaWorkspaceContext, expected: Map<string, string | undefined>) {
  const config = ctx.paths.includes(NATIVE_CONFIG_PATH) ? await ctx.read(NATIVE_CONFIG_PATH) : undefined;
  ctx.assertLive();
  if (expected.has(NATIVE_CONFIG_PATH) && expected.get(NATIVE_CONFIG_PATH) !== config)
    throw new Error("The site address changed. Try again.");
  expected.set(NATIVE_CONFIG_PATH, config);
  return nativeSitePrefix(config);
}
