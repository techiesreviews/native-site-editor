/**
 * Applies exact text replacements: each `oldText` must occur exactly once in
 * the text as the earlier replacements left it (or `all` replaces every
 * occurrence). Returns the new text, or why it cannot.
 */
export function applyReplacements(
  text: string,
  replacements: { oldText: string; newText: string; all?: boolean }[],
): { ok: true; text: string } | { ok: false; error: string } {
  let out = text;
  for (const [index, { oldText, newText, all }] of replacements.entries()) {
    const which = replacements.length > 1 ? ` (replacement ${index + 1})` : "";
    if (!oldText) return { ok: false, error: `oldText is empty${which}.` };
    const first = out.indexOf(oldText);
    if (first < 0)
      return { ok: false, error: `oldText was not found${which}. Read the file again and copy the text exactly.` };
    if (all) {
      out = out.split(oldText).join(newText);
      continue;
    }
    if (out.indexOf(oldText, first + 1) >= 0)
      return { ok: false, error: `oldText occurs more than once${which}. Include more surrounding text, or set all.` };
    out = out.slice(0, first) + newText + out.slice(first + oldText.length);
  }
  return { ok: true, text: out };
}

