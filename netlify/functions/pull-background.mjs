// Background function (up to 15 min): pull ClickUp and save the snapshot. Only callable with SYNC_SECRET.
import { pull } from "../../lib/pull.mjs";
import { store, setState } from "../../lib/store.mjs";

export default async req => {
  if (!process.env.SYNC_SECRET || req.headers.get("x-sync-secret") !== process.env.SYNC_SECRET) return new Response("forbidden", { status: 403 });
  const { reason = "?" } = await req.json().catch(() => ({}));
  const t = Date.now();
  await setState({ started_at: new Date().toISOString(), reason, error: null });
  try {
    const prev = await store().get("latest", { type: "json" }).catch(() => null);
    const out = await pull(process.env.CLICKUP_TOKEN, m => console.log(m), prev);
    await store().setJSON("latest", out);
    await setState({ finished_at: new Date().toISOString(), pulled_at: out.pulled_at, seconds: +((Date.now() - t) / 1000).toFixed(1), calls: out.calls, error: null });
  } catch (e) {
    console.error(e);
    await setState({ finished_at: new Date().toISOString(), error: String(e.message || e) });
  }
};
