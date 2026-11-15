// Why a GitHub sign-in stopped (TOOLS-263 S1). The Worker sends only a code (`/?error=<code>`) and the sign-in screen
// shows that code's fixed words, so a link cannot make the editor say words of its own.
export const SIGN_IN_ERRORS = {
  setup: "GitHub sign-in has not been configured for this editor yet.",
  expired: "GitHub sign-in expired or could not be verified. Connect again.",
  denied: "GitHub access was not granted. Connect again when ready.",
  quota: "The editor's service has used up today's allowance. It resets at midnight UTC.",
  failed: "GitHub sign-in failed. Try again.",
} as const;
export type SignInError = keyof typeof SIGN_IN_ERRORS;

/** The words for a code from the address: any other code, or words, is the general failure. */
export const signInErrorText = (code: string) => SIGN_IN_ERRORS[Object.hasOwn(SIGN_IN_ERRORS, code) ? code as SignInError : "failed"];
/** The code for the words a failed sign-in carries: any other words are the general failure. */
export const signInErrorCode = (message: string) =>
  (Object.keys(SIGN_IN_ERRORS) as SignInError[]).find(code => SIGN_IN_ERRORS[code] === message) ?? "failed";
