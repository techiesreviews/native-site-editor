// The fixed block vocabulary; arbitrary containers and links keep their own classes.
import { startTagAttribute, type StartTag } from "../../shared/html-source";

// Class tokens split on ASCII whitespace only, as HTML does (a no-break space is part of a token).
const SPACE = /[\t\n\f\r ]+/;

export function blockLayout(source: string, tag: StartTag): "flow" | "cards" | undefined {
  if (tag.name !== "div") return undefined;
  const tokens = (startTagAttribute(source, tag, "class")?.value ?? "").split(SPACE);
  return tokens.includes("flow") ? "flow" : tokens.includes("cards") ? "cards" : undefined;
}

/** Replace the first layout token in place, removing any other layout tokens. */
export function blockLayoutEdit(source: string, tag: StartTag, next: string) {
  if (!blockLayout(source, tag) || next !== "flow" && next !== "cards") return undefined;
  const attribute = startTagAttribute(source, tag, "class")!;
  let written = false;
  const tokens = attribute.value.split(SPACE).filter(Boolean).flatMap((token) => {
    if (token !== "flow" && token !== "cards") return [token];
    if (written) return [];
    written = true;
    return [next];
  });
  // Keep the original delimiter and entity spelling of unrelated class tokens.
  return { start: attribute.valueStart, end: attribute.valueEnd, text: tokens.join(" ") };
}

export function isButtonBlock(tag: string, attributes: readonly { name: string; value: string }[]) {
  return tag === "a" && (attributes.find((item) => item.name === "class")?.value ?? "").split(SPACE).includes("btn");
}
