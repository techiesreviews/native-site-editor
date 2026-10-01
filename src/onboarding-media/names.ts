// The recording of what to click on GitHub (Setup wizard, step 1): a short
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
