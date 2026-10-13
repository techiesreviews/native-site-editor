---
title: Research browser support for opening and watching folders
type: research (AFK)
status: open
assignee: claude (research subagent)
blocked_by: []
---

## Question

What can the File System Access API do in current browsers (October 2026), for a web app that opens a site's folder read/write and keeps it open across visits? For desktop Chrome, Edge, Opera, Brave, Arc, Android Chrome, Firefox and Safari: is `showDirectoryPicker` with `mode: "readwrite"` available; can `FileSystemDirectoryHandle`s be stored in IndexedDB; what do `queryPermission`/`requestPermission` return on a later visit and which need a user gesture; how does Chrome's persistent permission ("Allow on every visit") behave and what triggers it; what happens when the folder was moved, renamed or deleted. Is `FileSystemObserver` shipped (versions, flags, which change kinds it reports, whether it reports changes made by other programs, its cost on a folder of a few thousand files)? Without it, what does polling `getFile().lastModified` cost per file and per thousand files, and how precise is `lastModified`? How do writes behave (`createWritable`, swap-file then rename on close, `keepExistingData`, `move()`/`remove()` support), and what does another program see mid-write? Which folders does the picker refuse (home, system folders)? Measure where possible in headless Chromium (OPFS or a real directory) and say which facts are measured and which are from documentation.
