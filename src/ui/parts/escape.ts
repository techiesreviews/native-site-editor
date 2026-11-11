// Text for markup strings: the parts' option modules turn words into HTML text, so every word passes through here.

/** Words as HTML text or an attribute value: the five characters that could end either. */
export function escapeWords(words: string): string {
  return words.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}
