import { NATIVE_STARTER_VERSION } from "../../shared/native-starter-version";

/** Vite does not serve public files through raw imports; read the same-origin vendored bytes. */
export async function starterLoader(fetcher: typeof fetch = fetch): Promise<string> {
  const response = await fetcher(`/native-static-starter/${NATIVE_STARTER_VERSION}/files/components/components.js.asset`);
  if (!response.ok) throw new Error("The vendored component loader could not be read.");
  return response.text();
}
