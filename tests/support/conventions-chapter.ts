/** A chapter from its `## <title>` line to the next `## ` heading, trimmed. */
export function conventionsChapter(markdown: string, title: string) {
  const lines = markdown.split("\n");
  const start = lines.indexOf(`## ${title}`);
  if (start < 0) return undefined;
  const next = lines.findIndex((line, index) => index > start && line.startsWith("## "));
  return lines.slice(start, next < 0 ? undefined : next).join("\n").trim();
}

