# Hosted Astro preview: feasibility

Research date: 2026-09-17. Documentation review only; no Cloudflare deployment or runtime experiment performed.

## Verdict

**A browser-only editor with a real Astro preview is technically plausible on Cloudflare, using remote containers. Universal compatibility and exact production equivalence are not established.** Hosting the editor UI/API on Workers and running the user's project in a Sandbox are separate responsibilities. Cloudflare's Sandbox SDK provides Linux containers, command execution, files, background processes, and exposed services on Workers Paid. This supports the proposed architecture; it does not demonstrate that any particular Astro project works. [Sandbox overview](https://developers.cloudflare.com/sandbox/)

The first GitHub/file-tree milestone does not need project execution. Preview should be a subsequent, bounded proof.

## Verified capabilities and comparison

| Approach | What it establishes | Limitation |
| --- | --- | --- |
| Static build preview | Render the actual generated HTML/CSS/JS from `astro build`; rebuild after edits. | Slower feedback; no server runtime. |
| Development-server preview | `astro dev` watches source changes and updates the page. | Development behavior is not the production artifact. |
| Adapter-aware built preview | Build and run the installed adapter's supported preview path. | Must match the deployment runtime, bindings and environment; support varies. |

Astro documents live development updates and explicitly distinguishes them from previewing the last build. The build output normally lives in `dist/`. [Develop and build](https://docs.astro.build/en/develop-and-build/)

Ordinary Workers expose a subset of Node APIs; `node:child_process` is an importable non-functional stub. **Inference:** an ordinary Worker is not a general shell for `npm install` and an arbitrary Astro development server. Use it as the control plane, with Sandbox/Containers for execution. [Workers Node compatibility](https://developers.cloudflare.com/workers/runtime-apis/nodejs/)

Sandbox preview routing supports HTTPS and WebSockets, making a proxied development server with live updates plausible. Production `exposePort()` routing requires a custom domain and wildcard DNS. Quick tunnel URLs lack authentication beyond an unpredictable URL, so they are unsuitable as the sole access control for private project previews. [Preview URLs](https://developers.cloudflare.com/sandbox/concepts/preview-urls/)

For modern Cloudflare-adapter projects, Astro documents `workerd` for both development and built preview. The Astro 6 upgrade section specifies adapter v13 or later and removes that adapter's Cloudflare Pages support. Existing repositories may use older versions: detect installed versions rather than silently upgrading them. This is distinct from serving a static Astro build on Pages. [Cloudflare adapter](https://docs.astro.build/en/guides/integrations-guide/cloudflare/)

## Constraints and recommendations

- **Dependencies and integrations:** preserve the project's lockfile, Node/package-manager version, build command and configuration. Linux execution allows ordinary tooling, but native binaries, private registries, install scripts, external services and custom integrations require individual testing. Do not equate “Astro detected” with “preview supported.” This is a compatibility recommendation based on the execution architecture, not a verified compatibility matrix.
- **Islands and SSR:** serve the real generated scripts and test hydration and interaction, not just screenshots. On-demand rendering needs an appropriate adapter; static assets alone cannot reproduce it. Vercel/VPS deployments need their own runtime checks rather than assuming a Cloudflare preview is equivalent. [Astro deployment guidance](https://docs.astro.build/en/guides/deploy/)
- **Secrets and isolation:** Sandbox isolates containers, but all code inside one sandbox shares its files and processes. Authentication/authorization remain application responsibilities. Use a separate execution context per user/project and a separate preview origin; keep GitHub credentials in the control plane where possible. Values passed to repository processes can be read by that code. Use scoped preview credentials, not production secrets by default. [Sandbox security](https://developers.cloudflare.com/sandbox/concepts/security/)
- **State:** sleeping containers restart fresh and lose local state. Rehydrate committed source from GitHub and persist pending edits outside the container before acknowledging a save. Do not use a preview filesystem as the source of truth. [Sandbox lifecycle](https://developers.cloudflare.com/sandbox/concepts/sandboxes/)
- **Capacity:** current predefined instance types range from 256 MiB/1⁄16 vCPU to 12 GiB/4 vCPU; image and workspace sizes must fit disk limits. Dependency installation and builds need measurement before choosing an instance. [Container limits](https://developers.cloudflare.com/containers/platform/limits/)
- **Cost:** Workers Paid starts at $5/month, with container allowances. Overage rates include $0.0000025/GiB-second memory, $0.000020/active-vCPU-second, and $0.00000007/GB-second disk. Memory/disk billing follows provisioned capacity while running, not just actual usage. Egress, Worker, Durable Object and optional log usage also matter. Budget using measured session duration and concurrency, with sleep/time limits. [Container pricing](https://developers.cloudflare.com/containers/platform/pricing/)

## Bounded next proof

After GitHub browsing works, use one pinned static starter with two routes, a shared stylesheet, an image and one interactive island. No SSR, external APIs, custom integrations or secrets initially.

1. Fetch a known commit into a Sandbox, install locked dependencies, and expose Astro through authenticated routing.
2. Embed the real page in the editor; verify navigation, responsive widths, image loading, island interaction and live updates over WebSockets.
3. Change a heading and shared CSS, build the same revision, and compare dev preview, built preview and deployed output at the same viewport. Identify the displayed source revision and last successfully deployed revision separately.
4. Verify cold start, rebuild time, memory, cost, sleep/recovery, failed builds and rapid successive edits. A failed deployment must not be labelled live.

**Success criterion:** the supported starter renders and behaves consistently, with measured latency/cost and no dependence on editor-specific production rendering. This proves the preview path, not source-to-visual-element mapping or safe source rewriting.

**Still experimental:** running the selected SDK/image and Astro versions together; authenticated iframe/session behavior; HMR proxying; overlay injection without layout changes; native dependency support; and later Cloudflare SSR/workerd execution inside Sandbox. Pin SDK and image versions together: stable and 1.0-preview documentation coexist. [Sandbox deployment guidance](https://developers.cloudflare.com/sandbox/guides/deploy/)

“Looks like publication” should mean the actual site at the same viewport and revision. Domain-dependent URLs, cookies, live data, host redirects and environmental differences prevent a blanket pixel-identical guarantee. Recommendation: use fast dev feedback during editing, then a build/deployment result to confirm publication; automatic publishing must still expose pending and failed states.
