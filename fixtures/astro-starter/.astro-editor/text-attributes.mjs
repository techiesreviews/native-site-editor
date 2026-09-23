// Dependency-free so the preview integration can embed this exact parser in
// its browser overlay as well as importing it in Node.
export function readTextAttributes(text) {
  const tag = /^<\s*[A-Za-z][\w:-]*/.exec(text);
  if (!tag || text.at(-1) !== ">") return undefined;
  const attrs = [];
  let index = tag[0].length;
  while (index < text.length - 1) {
    while (/\s/.test(text[index])) index++;
    if (text[index] === ">" || (text[index] === "/" && text[index + 1] === ">")) break;
    if (text[index] === "{") return undefined;
    const name = /^[^\s=/>]+/.exec(text.slice(index))?.[0];
    if (!name) return undefined;
    const start = index;
    index += name.length;
    while (/\s/.test(text[index])) index++;
    if (text[index] !== "=") {
      attrs.push({ name: name.toLowerCase(), start, end: index });
      continue;
    }
    index++;
    while (/\s/.test(text[index])) index++;
    const quote = text[index];
    if (quote !== '"' && quote !== "'") return undefined;
    const valueStart = ++index;
    while (index < text.length && text[index] !== quote) index++;
    if (index >= text.length) return undefined;
    attrs.push({
      name: name.toLowerCase(),
      start,
      end: index + 1,
      value: text.slice(valueStart, index),
      valueStart,
      valueEnd: index,
    });
    index++;
  }
  return attrs;
}
