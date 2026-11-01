// Snapshot + sync state live in Netlify Blobs (store "clickup"): key "latest" = page data, key "state" = sync bookkeeping.
import { getStore } from "@netlify/blobs";

export const store = () => getStore({ name: "clickup", consistency: "strong" });
export const getState = async () => (await store().get("state", { type: "json" })) || {};
export const setState = async patch => { const s = { ...(await getState()), ...patch }; await store().setJSON("state", s); return s; };

// A sync counts as running for at most 10 minutes, so a crashed run cannot block the next one forever
export const RUN_TTL = 10 * 60e3, COOLDOWN = 2 * 60e3;
export const running = s => !!s.started_at && (!s.finished_at || s.finished_at < s.started_at) && Date.now() - Date.parse(s.started_at) < RUN_TTL;

// Kick the background function (returns 202 immediately; the pull itself takes ~40 s)
export async function kick(reason, base) {
  const s = await getState();
  if (running(s)) return { ok: false, why: "running", state: s };
  base ||= process.env.URL || "http://localhost:8888";
  const r = await fetch(`${base}/.netlify/functions/pull-background`, { method: "POST", headers: { "x-sync-secret": process.env.SYNC_SECRET || "", "content-type": "application/json" }, body: JSON.stringify({ reason }) });
  if (r.status !== 202 && !r.ok) return { ok: false, why: `trigger ${r.status}`, state: s };
  return { ok: true, state: await setState({ started_at: new Date().toISOString(), reason, error: null, progress: 0 }) };
}
