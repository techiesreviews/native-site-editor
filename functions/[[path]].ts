// Cloudflare Pages Functions adapter. Every request that `_routes.json` routes
// to Functions (only `/api/*`, `/auth/*`, `/mcp`, `/.well-known/*`) is delegated to the existing
// Worker request handler in `worker/app.ts`, unchanged. Static assets are served
// directly by Pages and never reach this Function.
//
// `context.env` provides the SessionStore Durable Object binding (SESSIONS, from
// the separate `native-site-editor-sessions` Worker) and, for any fall-through,
// the Pages `ASSETS` fetcher.
import { handle, type Env } from "../worker/app";

export const onRequest: PagesFunction<Env> = (context) =>
  handle(context.request, context.env);
