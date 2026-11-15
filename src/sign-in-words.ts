// Words the sign-in screen shows only when sign-in cannot go ahead, loaded then so the boot does not carry them: a
// failed sign-in's fixed words for its code (shared/sign-in-error.ts) and an unconfigured editor's owner setup help.
export { SIGN_IN_ERRORS, signInErrorText } from "../shared/sign-in-error";

export const OWNER_SETUP_HELP = "Is this your editor? In its GitHub repository, set OWNER_GITHUB in wrangler.jsonc to your GitHub username and commit. Cloudflare deploys it again within a minute or two; then reload this page. (An editor with an OWNER_SETUP_TOKEN uses its private setup link instead.)";
