// Each component's Variants for get_site: the site's one Variant lookup
// (shared/variant-lookup.ts), as the editor's code pane has them, over the
// files the tab shows (SiteFiles: GitHub at the tab's commit, drafts applied),
// read in batched rounds.
import type { EditorContext } from "../shared/types";
import { readVariants } from "../shared/variant-lookup";
import type { Variant, VariantWarning } from "../shared/variants";
import type { SiteFiles } from "./site-files";

export interface ComponentVariants { variants: Variant[]; variantWarnings?: VariantWarning[] }

export async function componentVariantsOf(files: SiteFiles, context: EditorContext): Promise<Map<string, ComponentVariants>> {
  const components = context.site?.components ?? [];
  const site = {
    pages: (context.pages ?? []).flatMap(({ file }) => (file ? [file] : [])),
    components: Object.fromEntries(components.map(({ tag, file }) => [tag, file])),
  };
  // One read budget for every round, so one call stays within the Worker's subrequests.
  const budget = { singles: 16 };
  // The stylesheets the tab says the pages link are read with the pages.
  const likely = (context.site?.stylesheets ?? []).flatMap(({ file, imports }) => [file, ...imports]);
  return readVariants(site, (paths) => files.texts(paths, budget), (lookup) => new Map(components.map(({ tag }) => {
    const { variants, warnings } = lookup.forTag(tag) ?? { variants: [], warnings: [] };
    return [tag, { variants, ...(warnings.length ? { variantWarnings: warnings } : {}) }];
  })), likely);
}
