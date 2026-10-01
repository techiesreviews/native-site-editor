import { button, node } from "../ui/dom";
import { icon } from "../icons";
import { GITHUB_INSTALL_MEDIA, GITHUB_SCREENSHOTS, VIDEO_REPLACES_SCREENSHOT, installMedia, mediaUrl } from "../onboarding-media";
import "./github-trip.css";

// What GitHub shows on the trip that installs the editor and signs the user
// in: real screenshots with captions, in a row of two cards on wide screens
// and stacked on narrow ones, each opening larger in a lightbox. Used by the
// sign-in screen's "What happens next?" and the wizard's Connect GitHub step.
// When github-install.mp4 is in src/onboarding-media/ the recording replaces
// the install screenshot (VIDEO_REPLACES_SCREENSHOT decides which one).

const reducedMotion = () => typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;

let open: HTMLDialogElement | undefined;

/** Shows a screenshot large; Escape, the Close button or a click outside close it. */
export function openLightbox(shot: (typeof GITHUB_SCREENSHOTS)[number]) {
  closeLightbox();
  const dialog = node("dialog", "lightbox");
  dialog.setAttribute("aria-label", shot.caption);
  const close = button("", () => dialog.close(), "lightbox__close");
  close.setAttribute("aria-label", "Close");
  close.append(icon("x", 16));
  const figure = node("figure", "lightbox__figure");
  figure.append(picture(shot, "lightbox__image"), node("figcaption", "lightbox__caption", shot.caption));
  dialog.append(close, figure);
  // A click on the backdrop (the dialog itself, outside its content) closes it.
  dialog.addEventListener("click", (event) => {
    if (event.target === dialog) dialog.close();
  });
  dialog.addEventListener("close", () => {
    dialog.remove();
    if (open === dialog) open = undefined;
  });
  document.body.append(dialog);
  open = dialog;
  dialog.showModal();
}

export function closeLightbox() {
  open?.close();
}

function picture(shot: (typeof GITHUB_SCREENSHOTS)[number], className: string) {
  const wrap = node("picture");
  const webp = mediaUrl(shot.webp);
  if (webp) {
    const source = node("source");
    source.type = "image/webp";
    source.srcset = webp;
    wrap.append(source);
  }
  const image = node("img", className);
  image.src = mediaUrl(shot.png) ?? "";
  image.alt = shot.alt;
  image.width = shot.width;
  image.height = shot.height;
  image.decoding = "async";
  wrap.append(image);
  return wrap;
}

function screenshotCard(shot: (typeof GITHUB_SCREENSHOTS)[number], number: number) {
  const card = node("li", "trip__card");
  card.dataset.shot = shot.id;
  const head = node("div", "trip__head");
  head.append(node("span", "trip__number", String(number)), node("span", "trip__caption", shot.caption));
  const figure = node("figure", "trip__figure");
  const recording = shot.id === VIDEO_REPLACES_SCREENSHOT ? recordingFigure() : undefined;
  if (recording) {
    figure.append(recording);
  } else {
    const zoom = button("", () => openLightbox(shot), "trip__zoom");
    zoom.setAttribute("aria-label", `Enlarge: ${shot.caption}`);
    zoom.append(picture(shot, "trip__image"), node("span", "trip__zoom-hint", "Click to enlarge"));
    figure.append(zoom);
  }
  card.append(head, figure);
  return card;
}

/** The recording of the two clicks, when it has been added; nothing before. */
function recordingFigure() {
  const media = installMedia();
  if (!media) return undefined;
  const video = node("video", "trip__video");
  video.muted = true;
  video.defaultMuted = true;
  video.loop = true;
  video.playsInline = true;
  video.preload = "metadata";
  video.setAttribute("aria-label", `What to click on GitHub. ${GITHUB_INSTALL_MEDIA.description}`);
  if (media.poster) video.poster = media.poster;
  for (const source of media.sources) {
    const element = node("source");
    element.src = source.src;
    element.type = source.type;
    video.append(element);
  }
  if (media.captions) {
    const track = node("track");
    track.kind = "captions";
    track.src = media.captions.src;
    track.label = media.captions.label;
    track.srclang = media.captions.lang;
    track.default = true;
    video.append(track);
  }
  const wrap = node("div", "trip__recording");
  wrap.append(video);
  if (reducedMotion()) {
    // Reduced motion: the poster, and a button to play it.
    const play = button("", () => {
      play.remove();
      video.controls = true;
      void video.play().catch(() => undefined);
    }, "trip__play");
    play.setAttribute("aria-label", "Play the recording");
    play.append(icon("play", 22), node("span", "", "Play"));
    wrap.append(play);
  } else {
    video.autoplay = true;
    void video.play().catch(() => undefined);
  }
  return wrap;
}

/** The numbered screenshots with their captions, and the line that says it is one trip. */
export function createGithubTrip(options: { note: string }) {
  const root = node("div", "trip");
  const cards = node("ol", "trip__cards");
  GITHUB_SCREENSHOTS.forEach((shot, index) => cards.append(screenshotCard(shot, index + 1)));
  root.append(cards, node("p", "trip__note", options.note));
  return root;
}
