import { MEDIA_ADDING_VALUES, MEDIA_RECORDS_PATH, parseMediaRecords, type AddingSettings, type MediaRecords } from "../../shared/media-records";

/** Adding settings (media-manager ticket 07): one quality choice per kind and Keep original. */
export interface MediaAddingChoices {
  image: NonNullable<AddingSettings["image"]>;
  video: NonNullable<AddingSettings["video"]>;
  audio: NonNullable<AddingSettings["audio"]>;
  keepOriginal: boolean;
}
export type MediaAddingKind = "image" | "video" | "audio";

/** Balanced everywhere and Keep original off. */
export const MEDIA_ADDING_DEFAULTS: Readonly<MediaAddingChoices> = Object.freeze({ image: "balanced", video: "balanced", audio: "balanced", keepOriginal: false });

/** The choices per kind, in the order shown, with a short plain hint. AVIF is images only; Speech is audio only. */
export const MEDIA_ADDING_CHOICES = {
  image: [
    [MEDIA_ADDING_VALUES.image[0], "Smaller files", "Up to 1,600 pixels wide"],
    [MEDIA_ADDING_VALUES.image[1], "Balanced", "Up to 2,400 pixels wide. Recommended"],
    [MEDIA_ADDING_VALUES.image[2], "Higher quality", "Full size, gentler compression"],
    [MEDIA_ADDING_VALUES.image[3], "Smallest files (slower)", "Takes longer to prepare"],
  ],
  video: [
    [MEDIA_ADDING_VALUES.video[0], "Smaller files", "Up to 720p"],
    [MEDIA_ADDING_VALUES.video[1], "Balanced", "Up to 1080p. Recommended"],
    [MEDIA_ADDING_VALUES.video[2], "Higher quality", "Full size, gentler compression"],
  ],
  audio: [
    [MEDIA_ADDING_VALUES.audio[0], "Balanced", "About 0.7 MB a minute. Recommended"],
    [MEDIA_ADDING_VALUES.audio[1], "Higher quality", "About 1 MB a minute"],
    [MEDIA_ADDING_VALUES.audio[2], "Speech", "About 0.5 MB a minute, in mono"],
  ],
} as const satisfies Record<MediaAddingKind, readonly (readonly [string, string, string])[]>;

const known = (kind: MediaAddingKind, value: unknown) => MEDIA_ADDING_CHOICES[kind].some(([choice]) => choice === value);

/** The site's choices: what it remembers, over the defaults. */
export function mediaAddingSettings(adding: AddingSettings | undefined): MediaAddingChoices {
  const out = { ...MEDIA_ADDING_DEFAULTS };
  for (const kind of ["image", "video", "audio"] as const) if (known(kind, adding?.[kind])) Object.assign(out, { [kind]: adding![kind] });
  if (adding?.keepOriginal === true) out.keepOriginal = true;
  return out;
}

export const mediaAddingIsDefault = (choices: MediaAddingChoices) =>
  (Object.keys(MEDIA_ADDING_DEFAULTS) as (keyof MediaAddingChoices)[]).every(key => choices[key] === MEDIA_ADDING_DEFAULTS[key]);

/** Only changed choices are remembered: a choice back at its default leaves the file, so Reset and
 * the defaults read the same. Other keys an older or newer editor wrote stay. */
function remember(records: MediaRecords, adding: Record<string, unknown>): MediaRecords {
  const { adding: _old, ...rest } = records;
  return Object.keys(adding).length ? { ...rest, adding: adding as AddingSettings } : rest as MediaRecords;
}
export function setMediaAddingSettings(records: MediaRecords, change: Partial<MediaAddingChoices>): MediaRecords {
  const adding: Record<string, unknown> = { ...records.adding };
  for (const [key, value] of Object.entries(change) as [keyof MediaAddingChoices, unknown][]) {
    if (key === "keepOriginal" ? typeof value !== "boolean" : !known(key, value)) throw new Error(`${String(value)} is not an adding choice for ${key}.`);
    if (value === MEDIA_ADDING_DEFAULTS[key]) delete adding[key]; else adding[key] = value;
  }
  return remember(records, adding);
}
export function resetMediaAddingSettings(records: MediaRecords): MediaRecords {
  const adding: Record<string, unknown> = { ...records.adding };
  for (const key of Object.keys(MEDIA_ADDING_DEFAULTS)) delete adding[key];
  return remember(records, adding);
}

/** The site's choices read from its records; unreadable records give the defaults (adding still
 * refuses to save over them later, as every records change does). */
export async function readMediaAddingSettings(read: (path: string) => Promise<string | undefined>): Promise<MediaAddingChoices> {
  const source = await read(MEDIA_RECORDS_PATH);
  try { return mediaAddingSettings(parseMediaRecords(source).adding); }
  catch { return { ...MEDIA_ADDING_DEFAULTS }; }
}
