// Saves through a live room (ticket am-59): the publish menu asks, before it sends, whether a page it saves is typed on
// together, so the room's copy notes the save and the commit names the copy (src/live-text.ts `noteLiveSave`). Live
// text sets `note` once it loads; this stays tiny, as the publish menu loads at boot. `store`: only that draft store's
// share answers (tests run several tabs in one page).
export const liveSaves: { note?: (key: string, text: string, store?: object) => string[] } = {};
