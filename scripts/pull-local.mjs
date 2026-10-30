// Local test: node scripts/pull-local.mjs  → writes public/clickup.json (git-ignored) using the token in
// $CLICKUP_TOKEN or %USERPROFILE%\.clickup-token. Lets the page run without Netlify (it falls back to clickup.json).
import fs from "node:fs";
import { pull } from "../lib/pull.mjs";

const token = process.env.CLICKUP_TOKEN || fs.readFileSync((process.env.USERPROFILE || process.env.HOME) + "/.clickup-token", "utf8").trim();
const t = Date.now();
const out = await pull(token, m => console.log(m));
fs.writeFileSync(new URL("../public/clickup.json", import.meta.url), JSON.stringify(out));
console.log(`done in ${((Date.now() - t) / 1000).toFixed(1)}s`);
