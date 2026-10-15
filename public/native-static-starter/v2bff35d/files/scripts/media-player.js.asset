// The site's media player: one small, dependency-free ES module. Pages that
// hold a video or a sound clip load it with the player's stylesheet:
//
//   <link rel="stylesheet" href="/styles/media-player.css">
//   <script type="module" src="/scripts/media-player.js"></script>
//
// It turns the plain markup below into players in the site's colours and
// fonts. Without it (no JavaScript, an old browser, a failed load) the
// markup still works: the browser shows its own controls.
//
// Video, still picture until tapped; loads and plays with sound on tap:
//   <video src="/media/clip.mp4" poster="/media/clip.webp" controls
//          preload="none" playsinline width="1280" height="720">
//     <track kind="subtitles" src="/media/clip.vtt" srclang="en" label="English">
//   </video>
// The bar: play/pause, timeline, time, sound on/off, CC (when a subtitles or
// captions track is there), speed, picture-in-picture and full screen.
//
// Looping video, silent, plays by itself while on screen, with one small
// round pause/play button in a corner; starts paused when the visitor's
// device asks for less motion:
//   <video src="/media/loop.mp4" poster="/media/loop.webp" controls muted loop playsinline></video>
// Leave out autoplay: the player starts it, so without JavaScript a visitor
// who asked for less motion still sees the still picture and the browser's
// play button. (autoplay works too; the player pauses it for less motion.)
// Inside a link, leave out controls (a video with controls is not allowed
// there): <a href="/story/"><video src=… muted loop playsinline></video></a>.
// The corner button pauses and plays without following the link; the rest
// of the picture still opens it.
//
// Background video, the first child of a section that it fills; no controls.
// Shows its still for less motion or when the browser asks to save data:
//   <section><video data-background src="/media/bg.mp4" poster="/media/bg.webp"
//          muted loop playsinline preload="none"></video> …the section… </section>
//
// Audio, play/pause, timeline and elapsed/total time; a Transcript button
// under it when a subtitles track is there. data-duration (seconds) shows the
// total time before the file loads:
//   <audio src="/media/talk.m4a" controls preload="none" data-duration="754">
//     <track kind="subtitles" src="/media/talk.vtt" srclang="en" label="English">
//   </audio>
//
// Subtitles tracks are WebVTT (.vtt); browsers read no other kind.
// Name a video or clip with aria-label (or title): the players use it.
// data-player="off" on a <video> or <audio> leaves it to the browser.
// A video or looping video gets a <div class="media-player"> wrapper; a slot
// attribute moves to the wrapper, so it stays in its component's slot. So
// component CSS styles a media slot by its name ([slot="image"]), which
// matches the wrapper; the video fills it and keeps its own object-position.
// Download cards (styles/media-player.css) need no script.
//
// Online video, a YouTube or Vimeo video: a link to it holding its still
// picture, copied into the site. Visitors see the still with a play button;
// YouTube (from youtube-nocookie.com) or Vimeo loads only on tap, then the
// bar above is laid over it (scripts/media-online.js, loaded only by pages
// that have one). Without the script the link opens the video on its site:
//   <a class="online-video" href="https://www.youtube.com/watch?v=aqz-KE-bpKQ">
//     <img src="/media/talk.webp" alt="Big Buck Bunny" width="1280" height="720">
//   </a>
// The href may be any usual YouTube or Vimeo address (watch, youtu.be,
// embed, shorts, vimeo.com/ID or /ID/HASH, player.vimeo.com); a start time
// (t=90, t=1m30s, #t=90s) is kept. If the service cannot be reached (offline,
// or blocked by the browser), the still stays with a link to watch it there.
// data-controls="service" keeps the service's own bar: use it for a Vimeo
// video whose owner's plan cannot hide Vimeo's bar. The still's alt (or the
// link's aria-label) names the video.

const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)");
const enhanced = new WeakSet();
const players = new Set(); // ordinary videos and audio: one plays at a time

const ICONS = {
  play: "M8 5.5v13l10.5-6.5z",
  pause: "M7 5h3.5v14H7zM13.5 5H17v14h-3.5z",
  sound: "M4 9h4l5-4v14l-5-4H4zM16 8.5a5 5 0 0 1 0 7M18.5 6a8.5 8.5 0 0 1 0 12",
  muted: "M4 9h4l5-4v14l-5-4H4zM16 9.5l5 5M21 9.5l-5 5",
  cc: "M3 6h18v12H3zM10.5 10.2a2.4 2.4 0 1 0 0 3.6M17 10.2a2.4 2.4 0 1 0 0 3.6",
  pip: "M3 5h18v14H3zM12 12h7v5h-7z",
  full: "M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5",
  exit: "M9 4v5H4M20 9h-5V4M15 20v-5h5M4 15h5v5",
};

function icon(name) {
  const filled = name === "play" || name === "pause";
  return `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="${ICONS[name]}"${
    filled ? "" : ' fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"'
  }/></svg>`;
}

function button(className, label, iconName) {
  const el = document.createElement("button");
  el.type = "button";
  el.className = className;
  el.setAttribute("aria-label", label);
  if (iconName) el.innerHTML = icon(iconName);
  return el;
}

function setIcon(el, name) {
  if (el.dataset.icon !== name) {
    el.dataset.icon = name;
    el.innerHTML = icon(name);
  }
}

/** 75.4 → "1:15"; 3725 → "1:02:05"; anything unknown → "--:--". */
export function formatTime(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) return "--:--";
  const s = Math.floor(seconds);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = String(s % 60).padStart(2, "0");
  return h ? `${h}:${String(m).padStart(2, "0")}:${ss}` : `${m}:${ss}`;
}

const ENTITIES = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", lrm: "", rlm: "" };

/** The spoken text of a WebVTT (or SRT) file, one string per cue, without
    timings, tags or repeats: what the Transcript shows. */
export function cueText(source) {
  const out = [];
  for (const block of String(source).replace(/\r\n?/g, "\n").split(/\n\s*\n/)) {
    const rows = block.split("\n");
    const at = rows.findIndex((row) => row.includes("-->"));
    if (at < 0) continue; // the WEBVTT header, NOTE, STYLE and REGION blocks
    const text = rows
      .slice(at + 1)
      .join(" ")
      .replace(/<v(?:\.[^ >]*)? ([^>]+)>/g, "$1: ")
      .replace(/<[^>]*>/g, "")
      .replace(/&(#\d+|[a-z]+);/gi, (all, name) =>
        name[0] === "#" ? String.fromCodePoint(Number(name.slice(1))) : (ENTITIES[name.toLowerCase()] ?? all))
      .replace(/\s+/g, " ")
      .trim();
    if (text && text !== out[out.length - 1]) out.push(text);
  }
  return out;
}

function nameOf(media) {
  return (media.getAttribute("aria-label") || media.title || "").trim();
}

// The wrapper the controls sit in. It takes over the media's slot, so a
// video slotted into a component stays in that slot.
function wrap(media, kind) {
  const box = document.createElement("div");
  box.className = "media-player";
  box.dataset.kind = kind;
  const slot = media.getAttribute("slot");
  if (slot !== null) {
    box.setAttribute("slot", slot);
    media.removeAttribute("slot");
  }
  media.before(box);
  box.append(media);
  return box;
}

function play(media) {
  const result = media.play();
  if (result) result.catch(() => {});
}

// Timeline and time: a range input (arrow keys and screen readers work as
// for any slider) between the elapsed and total time.
function timeline(media) {
  const elapsed = document.createElement("span");
  const total = document.createElement("span");
  elapsed.className = "media-time";
  total.className = "media-time";
  const range = document.createElement("input");
  range.type = "range";
  range.className = "media-timeline";
  range.min = "0";
  range.step = "any";
  range.value = "0";
  range.setAttribute("aria-label", "Seek");
  let dragging = false;
  const duration = () =>
    Number.isFinite(media.duration) && media.duration > 0 ? media.duration : Number(media.dataset?.duration) || 0;
  const sync = () => {
    const d = duration();
    const now = dragging ? Number(range.value) : media.currentTime;
    range.max = String(d || 1);
    range.disabled = !d;
    if (!dragging) range.value = String(now);
    range.style.setProperty("--media-progress", `${d ? Math.min(100, (now / d) * 100) : 0}%`);
    range.setAttribute("aria-valuetext", `${formatTime(now)} of ${d ? formatTime(d) : "unknown"}`);
    elapsed.textContent = formatTime(now);
    total.textContent = d ? formatTime(d) : "--:--";
  };
  range.addEventListener("input", () => {
    dragging = true;
    media.currentTime = Number(range.value);
    sync();
  });
  range.addEventListener("change", () => {
    dragging = false;
    sync();
  });
  for (const type of ["timeupdate", "durationchange", "loadedmetadata", "seeked", "emptied"]) {
    media.addEventListener(type, sync);
  }
  sync();
  return [elapsed, range, total];
}

function playToggle(media, className) {
  const toggle = button(className, "Play", "play");
  const sync = () => {
    toggle.setAttribute("aria-label", media.paused ? "Play" : "Pause");
    setIcon(toggle, media.paused ? "play" : "pause");
  };
  toggle.addEventListener("click", () => (media.paused ? play(media) : media.pause()));
  media.addEventListener("play", sync);
  media.addEventListener("pause", sync);
  sync();
  return toggle;
}

// One ordinary player at a time: starting one pauses the others.
function joinPlayers(media) {
  players.add(media);
  media.addEventListener("play", () => {
    for (const other of players) if (other !== media && !other.paused) other.pause();
  });
}

// If the browser cannot play the file, hand it back to the browser's own
// controls so the visitor sees what the browser says.
function fallBack(media, box, parts) {
  media.addEventListener("error", () => {
    for (const part of parts) part.remove();
    delete box.dataset.started;
    media.controls = true;
  });
}

// The still's large play button, shared with Online videos.
function startButton(name) {
  const start = button("media-start", name ? `Play video: ${name}` : "Play video");
  start.innerHTML = `<span class="media-start-disc">${icon("play")}</span>`;
  return start;
}

// CC for a video's own subtitles or captions track.
function trackSwitch(video) {
  const trackEl = video.querySelector('track[kind="subtitles"], track[kind="captions"]');
  const track = trackEl?.track;
  if (!track) return null;
  track.mode = trackEl.default ? "showing" : "disabled";
  return {
    isOn: () => track.mode === "showing",
    toggle: () => {
      track.mode = track.mode === "showing" ? "disabled" : "showing";
    },
    // The browser's own full screen (an iPhone) can switch subtitles too.
    watch: (callback) => video.textTracks.addEventListener?.("change", callback),
  };
}

// Picture-in-picture where the browser has it (Safari's presentation mode too).
function pipSwitch(video) {
  const webkitPip =
    typeof video.webkitSetPresentationMode === "function" &&
    typeof video.webkitSupportsPresentationMode === "function" &&
    video.webkitSupportsPresentationMode("picture-in-picture");
  if (!((document.pictureInPictureEnabled && !video.disablePictureInPicture) || webkitPip)) return null;
  const isOn = () =>
    document.pictureInPictureElement === video || video.webkitPresentationMode === "picture-in-picture";
  return {
    isOn,
    toggle: () => {
      if (document.pictureInPictureEnabled) {
        const done = isOn() ? document.exitPictureInPicture() : video.requestPictureInPicture();
        done.catch(() => {});
      } else {
        video.webkitSetPresentationMode(isOn() ? "inline" : "picture-in-picture");
      }
    },
    watch: (callback) => {
      for (const type of ["enterpictureinpicture", "leavepictureinpicture", "webkitpresentationmodechanged"]) {
        video.addEventListener(type, callback);
      }
    },
  };
}

// Subtitles clear the bar while it shows and drop back when it hides. The
// browser draws them in lines of about 5% of the picture's smaller side,
// counted up from the bottom, and a cue's first line sits on its line
// number, so a cue goes up by the bar's height plus its own lines (its line
// breaks, and a guess at wrapping that errs high); with the bar hidden, just
// its own lines, which is where the browser puts it by itself. Chrome
// redraws a cue on screen only when it is added again, so a moved one is.
// A cue the subtitles file places itself keeps its own line.
function liftSubtitles(box, video, bar) {
  const trackEl = video.querySelector('track[kind="subtitles"], track[kind="captions"]');
  const track = trackEl?.track;
  if (!track) return;
  const ours = new WeakSet();
  const place = () => {
    const picture = video.getBoundingClientRect();
    const font = Math.min(picture.width, picture.height) * 0.05;
    if (!font) return; // not laid out yet
    const shows = bar.isConnected && !bar.hidden && !("idle" in box.dataset) && !video.webkitDisplayingFullscreen;
    const lift = shows ? Math.max(0, Math.ceil((picture.bottom - bar.getBoundingClientRect().top) / font)) : 0;
    const fits = picture.width / (0.6 * font); // a low guess at the characters a line holds
    const onScreen = new Set(track.activeCues ?? []);
    for (const cue of [...(track.cues ?? [])]) {
      if (cue.line === "auto") ours.add(cue);
      const rows = cue.text.replace(/<[^>]*>/g, "").split("\n").reduce((n, row) => n + Math.max(1, Math.ceil(row.length / fits)), 0);
      if (!ours.has(cue) || cue.line === -lift - rows) continue;
      cue.line = -lift - rows;
      if (onScreen.has(cue)) {
        track.removeCue(cue);
        track.addCue(cue);
      }
    }
  };
  const watch = { attributes: true, attributeFilter: ["hidden", "data-idle", "data-started", "data-narrow"] };
  const changes = new MutationObserver(place);
  changes.observe(box, watch);
  changes.observe(bar, watch);
  if (typeof ResizeObserver === "function") new ResizeObserver(place).observe(box);
  trackEl.addEventListener("load", place);
  for (const type of ["webkitbeginfullscreen", "webkitendfullscreen"]) video.addEventListener(type, place);
}

/** The bar of a video, shared by the site's own videos and Online videos
    (enhance() hands it to scripts/media-online.js). media is a <video> or
    an object shaped like one: paused, currentTime, duration, muted,
    playbackRate, play(), pause() and the same events; canChangeSpeed false
    hides the speed button.
    Optional parts:
      start       the still's play button: on first play it hides, the bar shows
      surface     the picture: a click plays or pauses, a double click goes full screen
      cc, pip     { isOn(), toggle(), watch(callback) }, when the video has them
      nativeFull  full screen where the wrapper cannot go full screen (an iPhone)
    Returns the bar. */
function videoBar(box, media, { start, surface, cc, pip, nativeFull } = {}) {
  const bar = document.createElement("div");
  bar.className = "media-bar";
  bar.hidden = true;
  const toggle = playToggle(media, "media-toggle");
  bar.append(toggle, ...timeline(media));

  const mute = button("media-mute", "Mute");
  const syncMute = () => {
    mute.setAttribute("aria-pressed", String(media.muted));
    setIcon(mute, media.muted ? "muted" : "sound");
  };
  mute.addEventListener("click", () => {
    media.muted = !media.muted;
    syncMute();
  });
  media.addEventListener("volumechange", syncMute);
  syncMute();
  bar.append(mute);

  let ccButton = null;
  if (cc) {
    ccButton = button("media-cc", "Subtitles", "cc");
    const syncCc = () => ccButton.setAttribute("aria-pressed", String(cc.isOn()));
    ccButton.addEventListener("click", () => {
      cc.toggle();
      syncCc();
    });
    cc.watch(syncCc);
    syncCc();
    bar.append(ccButton);
  }

  const speeds = [1, 1.25, 1.5, 2, 0.75];
  const speed = button("media-speed", "Speed 1×");
  const syncSpeed = () => {
    speed.textContent = `${media.playbackRate}×`;
    speed.setAttribute("aria-label", `Speed ${media.playbackRate}×`);
    speed.hidden = media.canChangeSpeed === false;
  };
  speed.addEventListener("click", () => {
    const at = speeds.indexOf(media.playbackRate);
    media.playbackRate = speeds[(at + 1) % speeds.length];
    syncSpeed();
  });
  media.addEventListener("ratechange", syncSpeed);
  syncSpeed();
  bar.append(speed);

  if (pip) {
    const pipButton = button("media-pip", "Picture in picture", "pip");
    const syncPip = () => pipButton.setAttribute("aria-pressed", String(pip.isOn()));
    pipButton.addEventListener("click", () => pip.toggle());
    pip.watch(syncPip);
    syncPip();
    bar.append(pipButton);
  }

  // Full screen: the wrapper, so the bar comes along; an iPhone has only the
  // video's own full screen, with the system's controls.
  const elementFull = (document.fullscreenEnabled || document.webkitFullscreenEnabled) &&
    (box.requestFullscreen || box.webkitRequestFullscreen);
  let full = null;
  if (elementFull || nativeFull) {
    full = button("media-full", "Full screen", "full");
    const isFull = () => (document.fullscreenElement || document.webkitFullscreenElement) === box;
    const syncFull = () => {
      full.setAttribute("aria-pressed", String(isFull()));
      setIcon(full, isFull() ? "exit" : "full");
    };
    full.addEventListener("click", () => {
      if (isFull()) {
        (document.exitFullscreen || document.webkitExitFullscreen).call(document);
      } else if (elementFull) {
        const done = (box.requestFullscreen || box.webkitRequestFullscreen).call(box);
        if (done) done.catch(() => {});
      } else {
        nativeFull();
      }
    });
    document.addEventListener("fullscreenchange", syncFull);
    document.addEventListener("webkitfullscreenchange", syncFull);
    syncFull();
    bar.append(full);
    surface?.addEventListener("dblclick", () => full.click());
  }

  box.append(bar);
  joinPlayers(media);

  media.addEventListener("play", () => {
    if ("started" in box.dataset) return;
    const hadFocus = document.activeElement === start;
    box.dataset.started = "";
    if (start) start.hidden = true;
    bar.hidden = false;
    if (hadFocus) toggle.focus();
  });

  // The bar hides while the video plays and nobody moves, then comes back.
  let idleTimer = 0;
  const wake = () => {
    delete box.dataset.idle;
    clearTimeout(idleTimer);
    idleTimer = setTimeout(() => {
      if (!media.paused && !box.contains(document.activeElement) && !bar.matches(":hover")) {
        box.dataset.idle = "";
      }
    }, 2500);
  };
  box.addEventListener("pointermove", wake);
  box.addEventListener("focusin", wake);
  media.addEventListener("pause", wake);
  media.addEventListener("play", wake);

  // A tap on the picture shows the bar if it was hidden; otherwise a click
  // plays or pauses.
  let wasIdle = false;
  surface?.addEventListener("pointerdown", (event) => {
    wasIdle = event.pointerType !== "mouse" && "idle" in box.dataset;
  });
  surface?.addEventListener("click", () => {
    if (!("started" in box.dataset)) return;
    if (wasIdle) wake();
    else if (media.paused) play(media);
    else media.pause();
  });

  // Keys while focus is in the player: k play/pause, m sound, c subtitles,
  // f full screen, arrows jump five seconds (the timeline's own arrows step).
  box.addEventListener("keydown", (event) => {
    if (event.altKey || event.ctrlKey || event.metaKey || !("started" in box.dataset)) return;
    const onRange = event.target.matches?.(".media-timeline");
    const key = event.key.toLowerCase();
    const press = (el) => el && (el.click(), true);
    let handled = false;
    if (key === "k" || (key === " " && onRange)) handled = press(toggle);
    else if (key === "m") handled = press(mute);
    else if (key === "c") handled = press(ccButton);
    else if (key === "f") handled = press(full);
    else if (!onRange && (key === "arrowleft" || key === "arrowright")) {
      media.currentTime = Math.max(0, media.currentTime + (key === "arrowleft" ? -5 : 5));
      handled = true;
    }
    if (handled) event.preventDefault();
  });

  if (typeof ResizeObserver === "function") {
    new ResizeObserver(([entry]) => {
      box.toggleAttribute("data-narrow", entry.contentRect.width < 480);
    }).observe(box);
  }
  return bar;
}

function enhanceVideo(video) {
  const box = wrap(video, "video");
  video.controls = false;
  video.playsInline = true;
  const name = nameOf(video);
  box.setAttribute("role", "group");
  box.setAttribute("aria-label", name ? `Video: ${name}` : "Video");
  const start = startButton(name);
  box.append(start);
  const bar = videoBar(box, video, {
    start,
    surface: video,
    cc: trackSwitch(video),
    pip: pipSwitch(video),
    nativeFull: typeof video.webkitEnterFullscreen === "function" ? () => video.webkitEnterFullscreen() : null,
  });
  fallBack(video, box, [start, bar]);
  liftSubtitles(box, video, bar);

  // Tapping the still starts the video: it loads only now.
  start.addEventListener("click", () => {
    video.preload = "auto";
    play(video);
  });
}

function enhanceLooping(video) {
  const background = video.hasAttribute("data-background");
  const autoplay = video.autoplay;
  video.muted = true;
  video.loop = true;
  video.playsInline = true;
  video.autoplay = false;
  video.controls = false;
  const corner = button("media-corner", "Pause video", "pause");
  let box = null;
  if (background) {
    video.after(corner);
  } else {
    box = wrap(video, "loop");
    box.append(corner);
    // Inside a link, the link is named from its content: a named group gives
    // it the video's name (or "Looping video" for an unnamed one) instead of
    // the corner button's changing "Pause video".
    if (box.closest("a[href]")) {
      box.setAttribute("role", "group");
      box.setAttribute("aria-label", nameOf(video) || "Looping video");
    }
  }

  const calm = () => reduceMotion.matches || (background && navigator.connection?.saveData === true);
  let wanted = !calm(); // the visitor's choice; the corner button changes it
  let onScreen = false;
  const apply = () => (wanted && onScreen ? play(video) : video.pause());
  if (!wanted && autoplay) video.pause();

  const sync = () => {
    corner.setAttribute("aria-label", video.paused ? "Play video" : "Pause video");
    setIcon(corner, video.paused ? "play" : "pause");
  };
  video.addEventListener("play", sync);
  video.addEventListener("pause", sync);
  sync();
  // The corner may sit inside a link (a looping video made from a linked GIF)
  // or a clickable card: pressing it pauses or plays, and nothing else; a
  // middle click on it opens no tab. The rest of the link still follows it.
  const own = (event) => {
    event.preventDefault();
    event.stopPropagation();
  };
  corner.addEventListener("auxclick", own);
  corner.addEventListener("click", (event) => {
    own(event);
    wanted = video.paused;
    if (wanted) video.preload = "auto";
    if (wanted) play(video);
    else video.pause();
  });
  reduceMotion.addEventListener?.("change", () => {
    if (reduceMotion.matches) {
      wanted = false;
      apply();
    }
  });

  // Play only while on screen, which also spares the battery.
  if (typeof IntersectionObserver === "function") {
    new IntersectionObserver(([entry]) => {
      onScreen = entry.isIntersecting;
      apply();
    }).observe(video);
  } else {
    onScreen = true;
    apply();
  }

  video.addEventListener("error", () => {
    corner.remove();
    if (!background) video.controls = true;
  });
}

function enhanceAudio(audio) {
  const box = wrap(audio, "audio");
  audio.controls = false;
  const name = nameOf(audio);
  box.setAttribute("role", "group");
  box.setAttribute("aria-label", name ? `Audio: ${name}` : "Audio");
  const bar = document.createElement("div");
  bar.className = "media-bar";
  bar.append(playToggle(audio, "media-toggle"), ...timeline(audio));
  box.append(bar);
  const parts = [bar];

  const trackEl = audio.querySelector('track[kind="subtitles"], track[kind="captions"]');
  if (trackEl && trackEl.getAttribute("src")) {
    const panel = document.createElement("div");
    panel.className = "media-transcript";
    panel.id = `media-transcript-${Math.random().toString(36).slice(2, 9)}`;
    panel.hidden = true;
    // A long transcript scrolls inside the panel, so keyboard users can focus it.
    panel.tabIndex = 0;
    panel.setAttribute("role", "region");
    panel.setAttribute("aria-label", name ? `Transcript: ${name}` : "Transcript");
    const open = document.createElement("button");
    open.type = "button";
    open.className = "media-transcript-toggle";
    open.textContent = "Transcript";
    open.setAttribute("aria-expanded", "false");
    open.setAttribute("aria-controls", panel.id);
    let loaded = false;
    open.addEventListener("click", async () => {
      const show = panel.hidden;
      panel.hidden = !show;
      open.setAttribute("aria-expanded", String(show));
      if (!show || loaded) return;
      loaded = true;
      panel.textContent = "Loading…";
      try {
        const response = await fetch(trackEl.src);
        if (!response.ok) throw new Error(String(response.status));
        const lines = cueText(await response.text());
        panel.replaceChildren(
          ...lines.map((line) => Object.assign(document.createElement("p"), { textContent: line })),
        );
      } catch {
        loaded = false;
        const link = Object.assign(document.createElement("a"), { href: trackEl.src, textContent: "Open the transcript file" });
        panel.replaceChildren("The transcript could not be loaded. ", link);
      }
    });
    box.append(open, panel);
    parts.push(open, panel);
  }

  joinPlayers(audio);
  fallBack(audio, box, parts);
}

/** Turns every video and audio element under root into a player, and each
    Online video into a still with a play button. Safe to call again for
    media added later; each element is done once. */
export function enhance(root = document) {
  if (root.querySelector("a.online-video")) {
    import("./media-online.js").then(
      (online) => online.enhanceOnline(root, { wrap, nameOf, play, startButton, videoBar }),
      () => {}, // without the layer the link still opens the video on its site
    );
  }
  for (const media of root.querySelectorAll("video, audio")) {
    if (enhanced.has(media) || media.dataset.player === "off") continue;
    const looping = media.localName === "video" && (media.hasAttribute("data-background") || (media.hasAttribute("loop") && media.hasAttribute("muted")));
    if (!looping && !media.hasAttribute("controls")) continue;
    enhanced.add(media);
    if (looping) enhanceLooping(media);
    else if (media.localName === "video") enhanceVideo(media);
    else enhanceAudio(media);
  }
}

enhance();
