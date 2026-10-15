// The shared Use this moment encoder, loaded only for video stills.
/** A frame of the details player as the still's WebP, at the video's own size. */
export async function momentPicture(video: HTMLVideoElement): Promise<Blob> {
  video.pause();
  if (video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
    // Nothing drawn yet (only the length is loaded): load the frame at the current moment.
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("The video did not load. Play it, pause at the moment you want, then try again.")), 10_000);
      video.addEventListener("seeked", () => { clearTimeout(timer); resolve(); }, { once: true });
      video.currentTime = video.currentTime;
    });
  }
  if (!video.videoWidth || !video.videoHeight) throw new Error("The video did not load. Play it, pause at the moment you want, then try again.");
  const canvas = new OffscreenCanvas(video.videoWidth, video.videoHeight);
  canvas.getContext("2d")!.drawImage(video, 0, 0);
  const { createMediaEncoder } = await import("./media-encoders");
  return createMediaEncoder()(canvas, "image/webp", 80);
}

/** Seek a file in the open tab, then use the details player's encoder. */
export async function videoMoment(blob: Blob, seconds: number): Promise<Blob> {
  const video = document.createElement("video"), url = URL.createObjectURL(blob);
  video.preload = "auto"; video.muted = true;
  const wait = (event: "loadedmetadata" | "seeked" | "loadeddata", start: () => void) => new Promise<void>((resolve, reject) => {
    const clean = () => { clearTimeout(timer); video.removeEventListener(event, ready); video.removeEventListener("error", fail); };
    const ready = () => { clean(); resolve(); };
    const fail = () => { clean(); reject(new Error("The video could not load this moment. Choose a picture from Media instead.")); };
    const timer = setTimeout(fail, 10_000);
    video.addEventListener(event, ready, { once: true }); video.addEventListener("error", fail, { once: true });
    start();
  });
  try {
    await wait("loadedmetadata", () => { video.src = url; });
    if (!Number.isFinite(seconds) || seconds < 0 || !Number.isFinite(video.duration) || seconds > video.duration) throw new Error("The moment is beyond the video's duration.");
    if (seconds !== video.currentTime) await wait("seeked", () => { video.currentTime = seconds; });
    else if (video.readyState < 2) await wait("loadeddata", () => { video.load(); });
    return await momentPicture(video);
  } finally {
    video.pause(); video.removeAttribute("src"); video.load(); URL.revokeObjectURL(url);
  }
}
