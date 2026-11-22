/** localStorage or sessionStorage, or a store that keeps nothing where the browser refuses it. */
export function storage(kind: "local" | "session"): Pick<Storage, "getItem" | "setItem" | "removeItem" | "key" | "length"> {
  try {
    return kind === "local" ? localStorage : sessionStorage;
  } catch {
    return { getItem: () => null, setItem: () => undefined, removeItem: () => undefined, key: () => null, length: 0 };
  }
}
