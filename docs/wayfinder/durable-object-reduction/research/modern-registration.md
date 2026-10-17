# Modern registration compatibility

Verified 2026-10-17 against primary documentation and current local source. Research only: no client login, connector mutation, credential access or application changes. The dirty working tree includes uncommitted OAuth/WebMCP changes; this is not a deployment attestation.

## Established client support

| Client | Documented support and limits |
| --- | --- |
| Claude web / Desktop remote connectors | CIMD and DCR are supported. Claude chooses CIMD when authorization metadata advertises `client_id_metadata_document_supported: true` and token authentication includes `none`; otherwise it falls back to DCR. Hosted callbacks use `https://claude.ai/api/mcp/auth_callback`. Code uses a separate local flow. [Claude authentication](https://claude.com/docs/connectors/building/authentication) |
| Claude Code | Official CLI docs explicitly support automatic CIMD discovery and DCR, plus configured client IDs. `/mcp` offers Clear authentication; this is a user action, not evidence of automatic expired-registration repair. [Code MCP](https://code.claude.com/docs/en/mcp) |
| Codex local clients | Official OpenAI documentation confirms CIMD/DCR. Auto selects CIMD when advertised, `none` is supported and callback shape is supported; otherwise DCR when available. A configured client ID bypasses registration. CLI login can force `cimd` or `dcr` for one login. [Codex MCP](https://learn.chatgpt.com/docs/extend/mcp?surface=cli) |

Claude's custom-connector interface separately offers published identity, automatic registration and own-client choices. Desktop remote connectors originate from Anthropic's cloud; local desktop extensions are a different mechanism. [Connector setup](https://support.claude.com/en/articles/11175166-get-started-with-custom-connectors-using-remote-mcp)

Codex uses `https://chatgpt.com/oauth/codex/client.json` with valid issuer-bound responses, otherwise `https://chatgpt.com/oauth/codex/<callback_id>/client.json`. The latter binds a callback-specific loopback path. Custom callback hosts/paths/query parameters require DCR or configured identity. Missing or mismatched advertised `iss` fails authentication. These are documented capabilities, not tests of the locally installed build. [Codex MCP](https://learn.chatgpt.com/docs/extend/mcp?surface=cli)

Claude Code's documented CIMD is `https://claude.ai/oauth/claude-code-client-metadata`; the document itself could not be fetched by this research tool. Documentation says it declares portless `localhost` and `127.0.0.1` callbacks and requires port-agnostic matching for both. Hosted and local flows must be tested independently. [Claude callback requirements](https://claude.com/docs/connectors/building/authentication#callback-urls)

## Expiry and recovery boundary

**Unknown:** none of the checked client documentation establishes that an expired/deleted DCR client automatically triggers re-registration, or that a failed CIMD fetch automatically switches to DCR. Capability-selection fallback is not failure recovery.

OpenAI's plugin authentication guide warns that expiring/deleting registered clients can produce `invalid_client`; it recommends keeping registrations valid while connections remain in use. This guide includes hosted plugin surfaces and must not be substituted for Codex CLI retry behavior. [OpenAI authentication](https://developers.openai.com/plugins/build/auth)

**Design inference:** server-controlled options include accepting a valid CIMD again without a stored DCR record, maintaining valid registrations, publishing accurate discovery, and providing actionable errors. The server cannot silently replace an unknown client ID while preserving its redirect trust or modify a third-party client's credential cache. Automatic retries/re-registration, reconnect UI and configured-client replacement remain client-controlled and require observed compatibility tests. Registration lifetime and any migration policy remain Lex's decisions.

## Current implementation seam

[worker/oauth.ts](../../../../worker/oauth.ts) manually owns discovery, DCR, authorization, codes and token exchange. It advertises DCR, `none`, S256 and issuer responses, but no CIMD flag. Authorization only resolves `mcp_<32 hex>` IDs from DO records; registrations expire after 180 days. Unknown/expired IDs produce an HTML error instructing removal/re-addition. Redirects use exact array membership; token exchange binds the original client ID, redirect and PKCE. There are no refresh tokens.

The installed `@modelcontextprotocol/server` is 2.2.0. [worker/mcp.ts](../../../../worker/mcp.ts) uses its `createMcpHandler` for protocol transport; that does not replace the manual authorization server. Inspected SDK metadata helpers serve discovery documents rather than making this application's client resolver CIMD-aware. Adding the discovery flag alone would send supported clients into the existing unknown-app path.

## Validation and fetch requirements

The current MCP registration specification recommends CIMD and retains DCR for compatibility. Advertise CIMD only after URL resolution works; keep `registration_endpoint` for the intended fallback. Require JSON fields `client_id`, `client_name`, `redirect_uris`; compare document ID to the original identifier exactly and validate authorized redirects. [MCP registration](https://modelcontextprotocol.io/specification/2026-07-28/basic/authorization/client-registration)

The latest published CIMD draft is **-02**, still work in progress; MCP's page links the older -00. -02 requires HTTPS, a path, no userinfo/fragment/dot segments, exact identifier comparison, 200 JSON, and no automatic redirects. It recommends a 5 KB read limit; errors/malformed documents must not be cached. [CIMD draft-02](https://datatracker.ietf.org/doc/html/draft-ietf-oauth-client-id-metadata-document-02)

Separate metadata fetching from browser redirects: never fetch a loopback redirect URI. Preserve exact HTTPS redirect matching; allow only a narrowly implemented native-loopback port exception, retaining scheme, host, path and query. RFC 8252 requires variable ports for loopback IP literals; Claude additionally documents `localhost` compatibility. Do not generalize this into wildcard hosts or paths. [RFC 8252](https://www.rfc-editor.org/rfc/rfc8252.html#section-7.3)

**Proposed bounds, not accepted product decisions:** one GET per cache miss; zero redirects/retries; five-second total timeout including body; streaming 5 KB cap regardless of Content-Length; no cookies/authorization forwarding or secondary logo/JWKS fetch for a public-client-only implementation. Cache only validated success by exact URL, respecting no-store and HTTP freshness with a proposed one-hour upper TTL; cap at 100 entries/500 KB and coalesce concurrent misses. Rate-limit distinct misses without caching invalid documents.

**Design requirement inferred from the security rules:** SSRF protection must cover resolved destinations, not hostname regex alone: reject special-use IPv4/IPv6, mapped/encoded addresses, private DNS answers and rebinding; block redirect chains and parser-normalization bypasses. Enforce destination policy at connection time, or constrain lookup to reviewed exact metadata URLs. A DNS precheck followed by an independent fetch is insufficient evidence. Worker-runtime enforcement needs a prototype before claiming arbitrary URL safety. Display verified identifier/redirect hostnames; metadata names do not authenticate public-client software. [MCP security](https://modelcontextprotocol.io/specification/2026-07-28/basic/authorization/security-considerations), [draft SSRF rules](https://datatracker.ietf.org/doc/html/draft-ietf-oauth-client-id-metadata-document-02#section-8.6)

## Acceptance evidence before implementation approval

Use an isolated server and later explicitly authorized test accounts. Record exact client versions and sanitized request traces for: each Claude surface and Codex auto/CIMD/DCR; fresh and cached registration; absent CIMD flag; malformed/unreachable metadata; expired DCR ID with/without existing tokens; reconnect and explicit credential reset. Assert issuer/PKCE/resource binding, HTTPS exact redirects and loopback-port-only differences. Inject redirect/private-IP/rebinding cases, oversized/chunked bodies, slow bodies and miss floods; assert bounded fetch/cache resources and no internal network access. A passing generic SDK/Inspector flow does not prove real-client recovery. No such client tests were performed here.
