// Each component's variants for get_site, read in the Worker with the shared
// parser: the component's own CSS, the stylesheets the pages link (imports
// expanded) and the attributes the site's scripts set.
import { expandStyleImports } from "../shared/css-imports";
import type { EditorContext } from "../shared/types";
import { scriptSetAttributes, siteVariants, variantsForComponent, type Variant, type VariantWarning } from "../shared/variants";
import type { SiteFiles } from "./site-files";

export interface ComponentVariants { variants: Variant[]; variantWarnings?: VariantWarning[] }

/** Scripts read for the attributes they set, at most. */
const scriptLimit = 100;
/** Rounds of `@import`s the tab did not list (a component's own, or new ones), one level each. */
const importRounds = 10;

export async function componentVariantsOf(files: SiteFiles, site: NonNullable<EditorContext["site"]>): Promise<Map<string, ComponentVariants>> {
  const scripts = (await files.paths())
    .map(({ path }) => path)
    .filter((path) => /\.m?js$/i.test(path) && !path.split("/").includes("node_modules"))
    .slice(0, scriptLimit);
  const roots = site.stylesheets.map(({ file }) => file);
  const componentCss = site.components.flatMap(({ css }) => (css ? [css] : []));
  const asked = new Set([...roots, ...site.stylesheets.flatMap(({ imports }) => imports), ...componentCss, ...scripts]);
  // One read budget for every round, so one call stays within the Worker's subrequests.
  const budget = { singles: 16 };
  const sources = await files.texts(asked, budget);
  const expand = (paths: string[]) => {
    const missing = new Set<string>();
    const sheets = expandStyleImports(paths, (path) => {
      if (!sources.has(path) && !asked.has(path)) missing.add(path);
      return sources.get(path);
    }).sheets;
    return { sheets, missing };
  };
  for (let round = 0; round < importRounds; round++) {
    const missing = [roots, ...componentCss.map((css) => [css])].flatMap((paths) => [...expand(paths).missing]);
    if (!missing.length) break;
    for (const path of missing) asked.add(path);
    for (const [path, text] of await files.texts(missing, budget)) sources.set(path, text);
  }

  const shared = siteVariants(expand(roots).sheets);
  const scriptAttributes = new Set(scripts.flatMap((path) => scriptSetAttributes(sources.get(path) ?? "")));
  const out = new Map<string, ComponentVariants>();
  for (const component of site.components) {
    const css = component.css ? expand([component.css]).sheets.map(({ source }) => source).join("\n") : "";
    const { variants, warnings } = variantsForComponent(component.tag, { css, site: shared, scriptAttributes });
    out.set(component.tag, { variants, ...(warnings.length ? { variantWarnings: warnings } : {}) });
  }
  return out;
}
