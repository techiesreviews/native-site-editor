#!/usr/bin/env node
// Forwarder: `node scripts/agents/tickets.mjs …` (npm run lint, the docs) runs the shared kit's tickets.mjs.
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { kitChildEnv, kitHomeFolder } from "./kit-home.mjs";

let home;
try { home = kitHomeFolder(); } catch (error) { console.log(error.message); process.exit(2); }
const result = spawnSync(process.execPath, [join(home, "tickets.mjs"), ...process.argv.slice(2)], { stdio: "inherit", env: kitChildEnv(home) });
process.exit(result.status ?? 1);
