// The preview frame's document (srcdoc), apart from the editor's preview so a synced session's guest page
// (src/live-guest.ts, slice 30) draws the same frame without loading the editor.
//
// The runtime (native-preview-runtime.js) is bundled with the rules it imports
// into one classic script (vite-preview-runtime.ts): served readable in dev
// and the test server, minified with a source map under a content-hashed
// /assets/ URL in the build, cached as immutable.
// The URL is absolute so the about:srcdoc frame needs no base URL.
const RUNTIME_URL = new URL("./native-preview-runtime.js", import.meta.url).href;
// The page picture (src/agent-picture.ts), bundled the same way; only a picture's measuring frame loads it.
const PICTURE_URL = new URL("../agent-picture.ts", import.meta.url).href;
const RUNTIME_DOC = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="ase-frame-load" content="__FRAME_LOAD__" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Native preview</title>
<script src="${RUNTIME_URL}" data-picture="${PICTURE_URL}" defer></script>
</head>
<body><div id="root" data-key="root"><div id="page" data-key="page"></div></div></body>
</html>`;
/** The frame document; `load` numbers it, so a fresh one really navigates and its `ready` says which it is. */
export const runtimeDoc = (load: number) => RUNTIME_DOC.replace("__FRAME_LOAD__", String(load));
