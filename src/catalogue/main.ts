// The catalogue page (catalogue.html), built only for the preview editor (CATALOGUE=1, vite.config.ts): the board,
// or one frame of it when the address names a part or mock-up. It never starts the editor and adds nothing to the
// editor's boot. The editor's stylesheets load in the editor's order, so parts look exactly as they do there.
import "../utilities.css";
import "../style.css";
import "../theme.css";
import "./board.css";
import { loadComponentStyles } from "./component-css";
import { frameOf, ownQuery, startFrame } from "./frame";
import { loadPlans } from "./plans";

// Component files load as styles of their own (component-css.ts), so a live cell can leave its part's file out.
loadComponentStyles();
const shown = frameOf(ownQuery());
if (shown) void startFrame(shown);
// The board opens once the build's planning mock-ups (none on the dev server) have been read.
else void Promise.all([import("./board"), loadPlans()]).then(([{ startBoard }, plans]) => startBoard(document.getElementById("catalogue")!, plans));
