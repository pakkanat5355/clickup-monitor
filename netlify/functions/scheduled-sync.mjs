// Auto sync every 30 minutes, 07:00–23:30 Bangkok (00:00–16:30 UTC), Mon–Sat.
import { kick } from "../../lib/store.mjs";

export default async (req, context) => {
  const r = await kick("schedule", context?.site?.url);
  console.log("scheduled sync", r.ok ? "started" : r.why);
};

export const config = { schedule: "*/30 0-16 * * 1-6" };
