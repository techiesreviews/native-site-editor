// The preview Worker's entry (wrangler.preview-host.jsonc `main`; slice 35): its default handler and nothing else, as
// the Workers runtime takes every export of the entry module for a handler. The Worker itself is worker/preview-host.ts.
import { previewHost, type PreviewHostEnv } from "./preview-host";

export default {
  fetch: (request: Request, env: PreviewHostEnv) => previewHost(request, env),
};
