---
title: Research browser support for opening and watching folders
type: research (AFK)
status: closed
assignee: claude (research subagent)
blocked_by: []
---

## Question

What can the File System Access API do in current browsers (October 2026), for a web app that opens a site's folder read/write and keeps it open across visits? For desktop Chrome, Edge, Opera, Brave, Arc, Android Chrome, Firefox and Safari: is `showDirectoryPicker` with `mode: "readwrite"` available; can `FileSystemDirectoryHandle`s be stored in IndexedDB; what do `queryPermission`/`requestPermission` return on a later visit and which need a user gesture; how does Chrome's persistent permission ("Allow on every visit") behave and what triggers it; what happens when the folder was moved, renamed or deleted. Is `FileSystemObserver` shipped (versions, flags, which change kinds it reports, whether it reports changes made by other programs, its cost on a folder of a few thousand files)? Without it, what does polling `getFile().lastModified` cost per file and per thousand files, and how precise is `lastModified`? How do writes behave (`createWritable`, swap-file then rename on close, `keepExistingData`, `move()`/`remove()` support), and what does another program see mid-write? Which folders does the picker refuse (home, system folders)? Measure where possible in headless Chromium (OPFS or a real directory) and say which facts are measured and which are from documentation.

## Resolution (2026-10-13)

Full findings: branch `research/lf-01-browser-support` (commit e1f8bd80), file `docs/wayfinder/local-folders/research/01-browser-support.md`. Measured in headless Chromium 153 on real folders (brought in by simulated drag and drop, write access by a test-only setting, since headless cannot use the picker or answer prompts); Safari and Firefox from documentation only.

1. **Who has it:** desktop Chrome and Edge (86+) and Opera (72+) open folders read/write. Brave switches it off by default. Arc is undocumented (Chromium-based, maintenance only since May 2025). Android Chrome has it since 132, but remembers nothing between visits, cannot watch and does not write atomically. Firefox (negative position) and Safari (opposed) have none.
2. **Coming back:** stored handles survive in IndexedDB; on a later visit permission is "prompt" and asking without a click throws, so a "Reopen <folder>" button is needed. With "Allow on every visit" (Chrome 122+) or the editor installed as an app, it is "granted" at once, no click.
3. **Watching:** `FileSystemObserver` ships in Chrome and Edge 133 and Opera 118. Other programs' changes arrived in 1–33 ms as added, changed, deleted or moved; it also reports the editor's own saves; moving or deleting the folder ends the watch.
4. **Watch cost:** the first watch in a browser session takes about 2 s whatever the size; after that about 25 ms for 10,000 files.
5. **Polling fallback:** about 60 ms per 1,000 files per check. `lastModified` has whole-millisecond precision and missed 7–34% of quick same-size rewrites, so a content fingerprint is needed to be sure.
6. **Saving:** Chrome writes `name.crswap` and swaps it in, so other programs never see half a file; it does not check for changes meanwhile (last writer wins), and a crash leaves the `.crswap` behind.
7. **Moves and links:** file `move()` works and silently overwrites an existing target; folders cannot be moved; symbolic links are invisible.
8. **Refused folders:** home, Desktop, Documents and Downloads themselves, system folders, `~/.ssh`, `~/.config`; writes inside `.git/hooks` are refused, opening a git clone is fine.
9. **To check in real Chrome:** a reload lost access to a dragged-in folder even with another tab open; a folder chosen with the picker may differ.
