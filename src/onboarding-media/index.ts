// What GitHub looks like (Setup wizard, step 2): a short
// muted loop of GitHub's install page with the cursor on "All repositories",
// then "Install & Authorize". The owner records it separately; to add it,
// drop the files named below into this folder. Until they exist the wizard
// shows a static card describing the two clicks. The files are found when
// the editor is built (nothing is requested for a file that is not there).
//
//   github-install.mp4   H.264, the main source
//   github-install.webm  VP9, optional second source
//   poster.jpg           the first frame; also what reduced motion shows
//   github-install.vtt   captions (a starter file is here already)

import { GITHUB_INSTALL_MEDIA, GITHUB_SCREENSHOTS, VIDEO_REPLACES_SCREENSHOT } from "./names";

export { GITHUB_INSTALL_MEDIA, GITHUB_SCREENSHOTS, VIDEO_REPLACES_SCREENSHOT };

const urls = import.meta.glob("./*.{mp4,webm,jpg,png,webp,vtt}", { eager: true, query: "?url", import: "default" }) as Record<string, string>;

/** The address of one of the media files, when it is in this folder. */
export const mediaUrl = (file: string): string | undefined => urls[`./${file}`];

export interface InstallMedia {
  sources: { src: string; type: string }[];
  poster?: string;
  captions?: { src: string; label: string; lang: string };
}

/** The recording, or nothing while it has not been added. */
export function installMedia(): InstallMedia | undefined {
  const sources = GITHUB_INSTALL_MEDIA.video.flatMap((video) => {
    const src = mediaUrl(video.file);
    return src ? [{ src, type: video.type }] : [];
  });
  if (!sources.length) return undefined;
  const captions = mediaUrl(GITHUB_INSTALL_MEDIA.captions.file);
  return {
    sources,
    poster: mediaUrl(GITHUB_INSTALL_MEDIA.poster),
    ...(captions ? { captions: { src: captions, label: GITHUB_INSTALL_MEDIA.captions.label, lang: GITHUB_INSTALL_MEDIA.captions.lang } } : {}),
  };
}
