// What GitHub looks like on the trip the Setup wizard's Connect GitHub step
// explains (step 2): two real screenshots, each a WebP with a PNG fallback,
// and a recording of the two clicks (a short muted loop of GitHub's install
// page with the cursor on "All repositories", then "Install & Authorize").
// The owner records the video separately; to add it, drop the files named
// below into this folder. When github-install.mp4 exists it replaces the
// install screenshot (the second card); until then the screenshots show. The
// files are found when the editor is built (nothing is requested for a file
// that is not there).
//
//   github-install.mp4   H.264, the main source
//   github-install.webm  VP9, optional second source
//   poster.jpg           the first frame; also what reduced motion shows
//   github-install.vtt   captions (a starter file is here already)

export const GITHUB_INSTALL_MEDIA = {
  video: [
    { file: "github-install.mp4", type: "video/mp4" },
    { file: "github-install.webm", type: "video/webm" },
  ],
  poster: "poster.jpg",
  captions: { file: "github-install.vtt", label: "English", lang: "en" },
  /** What the recording shows, for the video's label and the placeholder card. */
  description: "Choose All repositories, then Install & Authorize.",
} as const;

/** The screenshots of GitHub's pages, in the order the wizard shows them. */
export const GITHUB_SCREENSHOTS = [
  {
    id: "signin",
    png: "github-signin.png",
    webp: "github-signin.webp",
    width: 440,
    height: 580,
    caption: "If GitHub asks you to sign in",
    alt: "GitHub's sign-in page, asking for your username and password.",
  },
  {
    id: "install",
    png: "github-install.png",
    webp: "github-install.webp",
    width: 640,
    height: 730,
    caption: "Choose All repositories, then click Install & Authorize",
    alt: "GitHub's install page for Native Site Editor, with All repositories chosen and the Install & Authorize button outlined in orange.",
  },
] as const;

/** The screenshot the recording replaces once github-install.mp4 is in this folder: the one constant that decides. */
export const VIDEO_REPLACES_SCREENSHOT = "install";
