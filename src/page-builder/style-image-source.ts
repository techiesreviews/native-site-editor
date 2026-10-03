import { resolveImportPath, rewriteCssUrls } from "../../shared/css-imports";

/** Accept one authored URL, never a gradient, image-set, or layered background. */
export function singleBackgroundAsset(value: string, declarationPath: string): string | undefined {
  let url: string | undefined;
  let count = 0;
  const rewritten = rewriteCssUrls(value, candidate => { count++; url = candidate; return "__native_focus_asset__"; });
  if (count !== 1 || rewritten.trim() !== 'url("__native_focus_asset__")' || !url) return;
  return nativeImageAsset(declarationPath, url);
}
export function nativeImageAsset(from: string, url: string): string | undefined {
  const path = resolveImportPath(from, url);
  return path && /\.(?:svg|png|jpe?g|gif|webp|avif)$/i.test(path) ? path : undefined;
}
