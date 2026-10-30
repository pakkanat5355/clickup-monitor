// GET  /api/clickup → latest snapshot (+ sync state)
// GET  /api/sync    → sync state only (the page polls this while a sync runs)
// POST /api/sync    → start a sync now (2-minute cooldown)
// The edge function already requires the login cookie; checked again here in case /api is reached directly.
import { authed } from "../../lib/auth.mjs";
import { store, getState, kick, running, COOLDOWN } from "../../lib/store.mjs";

const json = (b, status = 200) => Response.json(b, { status, headers: { "cache-control": "no-store" } });

export default async req => {
  if (!await authed(req, process.env.SITE_PASSWORD)) return json({ error: "unauthorized" }, 401);
  const path = new URL(req.url).pathname;
  if (path === "/api/clickup") {
    const [data, state] = await Promise.all([store().get("latest", { type: "json" }), getState()]);
    return json({ data, state: { ...state, running: running(state) } });
  }
  if (req.method === "POST") {
    const s = await getState();
    if (!running(s) && s.started_at && Date.now() - Date.parse(s.started_at) < COOLDOWN) return json({ ok: false, why: "cooldown", state: s }, 429);
    const r = await kick("manual", new URL(req.url).origin);
    return json({ ...r, state: { ...r.state, running: running(r.state) } }, r.ok || r.why === "running" ? 200 : 502);
  }
  const s = await getState();
  return json({ state: { ...s, running: running(s) } });
};

export const config = { path: ["/api/clickup", "/api/sync"] };
