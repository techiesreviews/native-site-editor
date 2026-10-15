// Shared address parser for the picker and agent validation.

/** Agents may place again an Online video already in Media; pasting a new address stays with the user. */
export const NEW_ONLINE_VIDEO_REFUSED = "Only the user can add a new online video: ask them to paste its address in Media's picker (Add → Media).";
export interface OnlineVideoKey { service: "youtube" | "vimeo"; id: string }
export interface OnlineVideo extends OnlineVideoKey { hash?: string; start?: number }
const seconds = (value: string | null | undefined) => {
  const match = /^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s?)?$/.exec(value?.trim() ?? "");
  const time = match ? Number(match[1] ?? 0) * 3600 + Number(match[2] ?? 0) * 60 + Number(match[3] ?? 0) : 0;
  return Number.isSafeInteger(time) && time > 0 ? time : undefined;
};
export function parseOnlineVideoAddress(text: string): OnlineVideo | undefined {
  let url: URL;
  try { url = new URL(/^[a-z][a-z\d+.-]*:/i.test(text.trim()) ? text.trim() : `https://${text.trim()}`); } catch { return; }
  if (!["https:", "http:"].includes(url.protocol) || url.username || url.password || url.port) return;
  const host = url.hostname.toLowerCase().replace(/^(?:www|m)\./, ""), parts = url.pathname.split("/").filter(Boolean);
  const start = seconds(url.searchParams.get("t") ?? url.searchParams.get("start") ?? /(?:^|&)t=([^&]+)/.exec(url.hash.slice(1))?.[1]);
  const youtube = (id?: string | null): OnlineVideo | undefined => id && !["videoseries", "live_stream"].includes(id) && /^[\w-]{11}$/.test(id) ? { service: "youtube", id, ...start ? { start } : {} } : undefined;
  if (host === "youtu.be") return youtube(parts[0]);
  if (["youtube.com", "youtube-nocookie.com"].includes(host)) {
    if (parts[0] === "watch") return youtube(url.searchParams.get("v"));
    if (["embed", "shorts", "live", "v"].includes(parts[0])) return youtube(parts[1]);
    return;
  }
  let id: string | undefined, hash: string | null | undefined;
  if (host === "player.vimeo.com" && parts[0] === "video") { id = parts[1]; hash = url.searchParams.get("h"); }
  if (host === "vimeo.com") {
    if (/^\d+$/.test(parts[0] ?? "")) { id = parts[0]; hash = parts[1] ?? url.searchParams.get("h"); }
    else { id = [...parts].reverse().find(part => /^\d+$/.test(part)); hash = url.searchParams.get("h"); }
  }
  if (!id || !/^\d+$/.test(id) || (hash && !/^[\da-f]+$/i.test(hash))) return;
  return { service: "vimeo", id, ...hash ? { hash } : {}, ...start ? { start } : {} };
}
