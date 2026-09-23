export function generatedSizeSource(source: string, opening: string, className: string, size: string) {
  return source.replace(opening, opening.replace(/>$/, ` class="${className}">`)) +
    `${source.endsWith('\n') ? '\n' : '\n\n'}<style>\n.${className} { font-size: var(--text-${size}); }\n</style>\n`;
}

export function generatedDefaultSource(source: string, className: string, size: string) {
  return source.replace(
    `.${className} { font-size: var(--text-${size}); }`,
    `.${className} {  }`,
  );
}
