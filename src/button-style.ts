export type ButtonStyleValue = "primary" | "secondary" | "outline" | "link";

export interface ButtonStyleMapping {
  value: ButtonStyleValue;
  baseClass: string;
  variants: Record<ButtonStyleValue, string>;
  classAttr: { start: number; end: number };
  classValue: { start: number; end: number };
}

export function buttonStyleOptions(mapping?: ButtonStyleMapping): ButtonStyleValue[] {
  if (!mapping) return [];
  return (["primary", "secondary", "outline", "link"] as const).filter((value) =>
    value === "primary" || Boolean(mapping.variants[value]),
  );
}

function classTokenRanges(value: string) {
  return [...value.matchAll(/\S+/g)].map((match) => ({
    value: match[0],
    start: match.index ?? 0,
    end: (match.index ?? 0) + match[0].length,
  }));
}

function validMappingTokens(mapping: ButtonStyleMapping) {
  const token = (value: string, allowEmpty = false) => (allowEmpty && value === "") || /^[A-Za-z_][\w-]*$/.test(value);
  if (!token(mapping.baseClass)) return false;
  const seen = new Set<string>();
  for (const value of Object.values(mapping.variants)) {
    if (!token(value, true)) return false;
    if (!value) continue;
    if (value === mapping.baseClass || seen.has(value)) return false;
    seen.add(value);
  }
  return true;
}

export function replaceButtonStyleClass(
  source: string,
  mapping: ButtonStyleMapping,
  next: ButtonStyleValue,
): { start: number; end: number; expected: string; text: string } | undefined {
  if (!validMappingTokens(mapping)) return undefined;
  if (!buttonStyleOptions(mapping).includes(next)) return undefined;
  if (!Number.isSafeInteger(mapping.classAttr.start) || !Number.isSafeInteger(mapping.classAttr.end) ||
      !Number.isSafeInteger(mapping.classValue.start) || !Number.isSafeInteger(mapping.classValue.end) ||
      mapping.classAttr.start < 0 || mapping.classAttr.end > source.length ||
      mapping.classValue.start < mapping.classAttr.start || mapping.classValue.end > mapping.classAttr.end ||
      mapping.classAttr.start >= mapping.classAttr.end || mapping.classValue.start > mapping.classValue.end)
    return undefined;
  const attr = source.slice(mapping.classAttr.start, mapping.classAttr.end);
  const currentValue = source.slice(mapping.classValue.start, mapping.classValue.end);
  if (!/^\s*class\s*=\s*(["'])[\s\S]*\1\s*$/i.test(attr)) return undefined;
  if (currentValue !== attr.replace(/^\s*class\s*=\s*(["'])([\s\S]*)\1\s*$/i, "$2")) return undefined;
  const ranges = classTokenRanges(currentValue);
  const classes = ranges.map((range) => range.value);
  if (!classes.includes(mapping.baseClass)) return undefined;
  const variantTokens = Object.values(mapping.variants).filter(Boolean);
  const present = classes.filter((name) => variantTokens.includes(name));
  if (present.length > 1) return undefined;
  const current =
    (Object.entries(mapping.variants) as [ButtonStyleValue, string][])
      .find(([, className]) => className && present[0] === className)?.[0] ?? "primary";
  if (current === next) return { start: mapping.classValue.start, end: mapping.classValue.end, expected: currentValue, text: currentValue };
  const nextToken = mapping.variants[next];
  let nextValue = currentValue;
  const currentRange = present[0] ? ranges.find((range) => range.value === present[0]) : undefined;
  if (currentRange && nextToken) {
    nextValue = currentValue.slice(0, currentRange.start) + nextToken + currentValue.slice(currentRange.end);
  } else if (currentRange && !nextToken) {
    let start = currentRange.start;
    let end = currentRange.end;
    if (/\s/.test(nextValue[end] ?? "")) while (end < nextValue.length && /\s/.test(nextValue[end])) end++;
    else while (start > 0 && /\s/.test(nextValue[start - 1])) start--;
    nextValue = currentValue.slice(0, start) + currentValue.slice(end);
  } else if (nextToken) {
    const baseRange = ranges.find((range) => range.value === mapping.baseClass);
    if (!baseRange) return undefined;
    const after = currentValue.slice(baseRange.end);
    nextValue = currentValue.slice(0, baseRange.end) + " " + nextToken + after;
  }
  return {
    start: mapping.classValue.start,
    end: mapping.classValue.end,
    expected: currentValue,
    text: nextValue,
  };
}
