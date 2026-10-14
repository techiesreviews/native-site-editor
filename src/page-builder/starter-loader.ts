import { NATIVE_STARTER_VERSION } from "../../shared/native-starter-version";
import type { StarterPlayerFiles } from "./player-markup";

/** Vite does not serve public files through raw imports; read the same-origin vendored bytes. */
export async function starterLoader(fetcher: typeof fetch = fetch): Promise<string> {
  const response = await fetcher(`/native-static-starter/${NATIVE_STARTER_VERSION}/files/components/components.js.asset`);
  if (!response.ok) throw new Error("The vendored component loader could not be read.");
  return response.text();
}

/** Read only after a media player plan identifies missing site files. */
export async function starterPlayerFiles(fetcher: typeof fetch = fetch): Promise<StarterPlayerFiles> {
  const paths = ["styles/media-player.css", "scripts/media-player.js", "scripts/media-online.js"];
  return Object.fromEntries(await Promise.all(paths.map(async path => {
    const response = await fetcher(`/native-static-starter/${NATIVE_STARTER_VERSION}/files/${path}.asset`);
    if (!response.ok) throw new Error(`The vendored media player file ${path} could not be read.`);
    return [path, await response.text()];
  })));
}
