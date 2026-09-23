// Preview-only Astro configuration: the project's own config plus editor annotations.
import base from "../astro.config.mjs";
import annotations from "./annotate.mjs";

export default { ...base, integrations: [...(base.integrations ?? []), annotations()] };
