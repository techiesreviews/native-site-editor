// How a person shows on a chip (slice 30): their name as shown and its initial. Shared by the editor's Share to edit
// items, the synced session and the guest page, so none of them pulls in another's code.

/** A person's name as shown, whatever their presence sends: trimmed, at most 40 characters, else "Guest". */
export const personName = (name: string) => name.trim().slice(0, 40) || "Guest";
/** The one letter or digit on a person's chip: the first of their name, as a capital (one character, so "ß" stays one). */
export function initialOf(name: string) {
  const first = name.trim().match(/\p{L}|\p{N}/u)?.[0];
  return first ? [...first.toLocaleUpperCase()][0] : "·";
}
