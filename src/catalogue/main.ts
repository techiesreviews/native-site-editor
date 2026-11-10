// The catalogue page (catalogue.html), built only for the preview editor (CATALOGUE=1, vite.config.ts): the board,
// or one frame of it when the address names a part or mock-up. It never starts the editor and adds nothing to the
// editor's boot. The editor's stylesheets load in the editor's order, so parts look exactly as they do there.
import "../utilities.css";
import "../style.css";
import "../theme.css";
import "./board.css";
import { frameOf, ownQuery, startFrame } from "./frame";

const shown = frameOf(ownQuery());
if (shown) void startFrame(shown);
else void import("./board").then(({ startBoard }) => startBoard(document.getElementById("catalogue")!));
