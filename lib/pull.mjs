// Pulls the central ClickUp list + team time entries + today's activity into one JSON snapshot.
// Read-only against ClickUp. Used by the Netlify background function and by scripts/pull-local.mjs.
export const TEAM = "9018393930", LIST = "901819768715", SINCE = "2026-10-01", PROJ_SINCE = "2025-06-01";
const SPACES = ["90181356086", "901813008639"], MD_H = 8; // project estimate: hours per manday
export const MEMBERS = { 3632940: "Tai", 60831178: "Pe", 3633460: "DREAM", 89665083: "Yut", 101511085: "Ing", 3845209: "Bank" };

const day = ms => ms ? new Date(+ms).toLocaleDateString("sv-SE", { timeZone: "Asia/Bangkok" }) : null;
const hm = ms => new Date(+ms).toLocaleTimeString("sv-SE", { timeZone: "Asia/Bangkok" }).slice(0, 5);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const fieldVal = f => {
  if (f.value == null || f.value === "") return null;
  if (f.type === "drop_down") return (f.type_config.options.find(o => o.orderindex === +f.value || o.id === f.value) || {}).name || null;
  return typeof f.value === "object" ? null : String(f.value).trim();
};

export async function pull(token, log = () => {}) {
  let calls = 0;
  // ClickUp allows ~100 requests/min per token: back off on 429 using the reset header
  const get = async p => {
    for (let i = 0; ; i++) {
      calls++;
      const r = await fetch("https://api.clickup.com/api/v2" + p, { headers: { Authorization: token } });
      if (r.status === 429 && i < 5) { const reset = +r.headers.get("x-ratelimit-reset") * 1000; await sleep(Math.max(2000, Math.min(60000, reset - Date.now()))); continue; }
      if (!r.ok) throw new Error(p.split("?")[0] + " " + r.status);
      return r.json();
    }
  };
  const pages = async p => { const out = []; for (let i = 0; ; i++) { const r = await get(`${p}&page=${i}`); out.push(...r.tasks); if (r.last_page !== false || !r.tasks.length) return out; } };

  const meta = await get(`/list/${LIST}`);
  const raw = await pages(`/list/${LIST}/task?include_closed=true&subtasks=true`);
  const tasks = raw.map(t => {
    const f = Object.fromEntries((t.custom_fields || []).map(x => [x.name.trim(), fieldVal(x)]));
    return {
      id: t.id, name: t.name.trim(), url: t.url, status: t.status.status, status_type: t.status.type, status_order: t.status.orderindex, status_color: t.status.color,
      who: t.assignees.map(a => MEMBERS[a.id] || a.username), due: day(t.due_date), start: day(t.start_date),
      created: day(t.date_created), updated: day(t.date_updated), closed: day(t.date_closed),
      customer: f["Customer"] || null, ref: f["Job ID / Ticket ID"] || null, work_type: f["Work Type"] || null,
      est_h: t.time_estimate ? +(t.time_estimate / 3.6e6).toFixed(2) : null, spent_h: +((t.time_spent || 0) / 3.6e6).toFixed(2),
      tags: t.tags.map(x => x.name), parent: t.parent || null,
    };
  });
  log(`list tasks ${tasks.length}`);
  const ids = Object.keys(MEMBERS).join(","), end = Date.now(), start = Date.parse(SINCE + "T00:00:00+07:00");
  const teAll = (await get(`/team/${TEAM}/time_entries?start_date=${Date.parse(PROJ_SINCE + "T00:00:00+07:00")}&end_date=${end}&assignee=${ids}&include_location_names=true`)).data || [];
  const te = teAll.filter(e => +e.start >= start);
  const inList = new Set(tasks.map(t => t.id));
  log(`time entries ${teAll.length}`);

  // Projects: central-list tasks with Work Type "Project", grouped by Job ID. Time = team entries on those tasks
  // plus entries on any task in a list whose name carries the Job ID (customer project folders).
  const lists = [];
  for (const sp of SPACES) {
    for (const fo of (await get(`/space/${sp}/folder?archived=false`)).folders) for (const l of fo.lists) lists.push({ id: l.id, name: l.name });
    for (const l of (await get(`/space/${sp}/list?archived=false`)).lists) lists.push({ id: l.id, name: l.name });
  }
  const groups = {};
  for (const t of tasks.filter(t => /project/i.test(t.work_type || ""))) {
    const code = t.ref && /^TB[A-Z]\d/.test(t.ref) ? t.ref.split("/")[0] : null;
    const key = code || t.ref || t.name;
    (groups[key] ||= { key, code, tasks: [] }).tasks.push(t);
  }
  const projects = [];
  for (const g of Object.values(groups)) {
    // list names sometimes write the code with a slash (TBP25121_BGRI/01 vs TBP25121_BGRI01)
    const pl = g.code ? lists.filter(l => l.name.replace(/\//g, "").includes(g.code.replace(/\//g, ""))) : [];
    let listEst = 0, listMd = 0;
    for (const l of pl) for (const t of await pages(`/list/${l.id}/task?include_closed=true&subtasks=true`)) {
      listEst += (t.time_estimate || 0) / 3.6e6;
      const m = (t.custom_fields || []).find(x => /manday/i.test(x.name)); if (m && m.value != null && !isNaN(+m.value)) listMd += +m.value;
    }
    const tIds = new Set(g.tasks.map(t => t.id)), lIds = new Set(pl.map(l => l.id));
    const es = teAll.filter(e => +e.duration > 0 && (tIds.has(e.task?.id) || lIds.has(e.task_location?.list_id)));
    const byP = {};
    for (const e of es) {
      const w = MEMBERS[e.user.id] || e.user.username, h = e.duration / 3.6e6, tn = e.task?.name || "(ไม่ระบุ task)";
      const p = (byP[w] ||= { h: 0, tasks: {} }); p.h += h; p.tasks[tn] = (p.tasks[tn] || 0) + h;
    }
    const by_person = Object.entries(byP).map(([who, p]) => ({ who, h: +p.h.toFixed(2),
      est_h: +g.tasks.filter(t => t.who.includes(who)).reduce((a, t) => a + (t.est_h || 0), 0).toFixed(2) || null,
      tasks: Object.entries(p.tasks).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([name, h]) => ({ name, h: +h.toFixed(2) })) })).sort((a, b) => b.h - a.h);
    const centralEst = g.tasks.reduce((a, t) => a + (t.est_h || 0), 0);
    const est = centralEst ? { h: centralEst, src: "Time Estimate ใน list กลาง" } : listEst ? { h: listEst, src: "Time Estimate ใน list โปรเจกต์" } : listMd ? { h: listMd * MD_H, src: `Manday ${+listMd.toFixed(2)} MD × ${MD_H} ชม.` } : null;
    const days = es.map(e => day(e.start)).sort();
    projects.push({ key: g.key, code: g.code, name: g.tasks.map(t => t.name).join(" / "), customer: g.tasks[0].customer,
      open: g.tasks.some(t => t.status_type !== "closed"), who: [...new Set(g.tasks.flatMap(t => t.who))],
      tasks: g.tasks.map(t => ({ id: t.id, name: t.name, url: t.url, status: t.status, status_type: t.status_type, who: t.who, due: t.due, est_h: t.est_h })),
      lists: pl.map(l => l.name), est_h: est ? +est.h.toFixed(2) : null, est_src: est?.src || null,
      tracked_h: +es.reduce((a, e) => a + e.duration / 3.6e6, 0).toFixed(2), first_log: days[0] || null, last_log: days.at(-1) || null, by_person });
  }
  projects.sort((a, b) => (b.open - a.open) || b.tracked_h - a.tracked_h);
  log(`projects ${projects.length}`);
  const time = te.filter(e => +e.duration > 0).map(e => ({
    who: MEMBERS[e.user.id] || e.user.username, date: day(e.start), h: +(e.duration / 3.6e6).toFixed(2),
    task: e.task?.id || null, task_name: e.task?.name || e.description || "(ไม่ระบุ task)", in_list: inList.has(e.task?.id),
    list: e.task_location?.list_name || null, status: e.task?.status?.status || null,
    at: hm(e.start), end: e.end ? hm(e.end) : null, note: e.description || null,
  }));

  // Today's activity (Bangkok day), all lists. Time entries / comments / created are done by that person;
  // "closed" and "touched" are tasks they are assigned to that changed today (API v2 has no per-user audit log).
  const today = day(Date.now()), t0 = Date.parse(today + "T00:00:00+07:00");
  const upd = [], seen = new Set();
  for (const t of await pages(`/team/${TEAM}/task?date_updated_gt=${t0}&include_closed=true&subtasks=true&` + Object.keys(MEMBERS).map(i => `assignees[]=${i}`).join("&")))
    if (!seen.has(t.id)) { seen.add(t.id); upd.push(t); }
  const ev = Object.fromEntries(Object.values(MEMBERS).map(w => [w, []]));
  const push = (w, x) => ev[w] && ev[w].push(x);
  const tref = t => ({ task: t.id, task_name: t.name.trim(), url: t.url, status: t.status?.status || null, list: t.list?.name || null });
  for (const e of teAll) if (+e.at >= t0 && +e.duration > 0)
    push(MEMBERS[e.user.id], { type: "time", time: hm(e.at), task: e.task?.id || null, task_name: e.task?.name || e.description || "(ไม่ระบุ task)",
      url: e.task?.id ? `https://app.clickup.com/t/${e.task.id}` : null, status: e.task?.status?.status || null, list: e.task_location?.list_name || null,
      h: +(e.duration / 3.6e6).toFixed(2), for_date: day(e.start), note: e.description || null });
  for (const t of upd) {
    const as = t.assignees.map(a => MEMBERS[a.id]).filter(Boolean), done = new Set();
    if (+t.date_created >= t0 && MEMBERS[t.creator?.id]) { push(MEMBERS[t.creator.id], { type: "created", time: hm(t.date_created), ...tref(t) }); done.add(MEMBERS[t.creator.id]); }
    for (const c of ((await get(`/task/${t.id}/comment`)).comments || []).filter(c => +c.date >= t0 && MEMBERS[c.user?.id])) {
      push(MEMBERS[c.user.id], { type: "comment", time: hm(c.date), ...tref(t), note: (c.comment_text || "").trim().slice(0, 140) || null }); done.add(MEMBERS[c.user.id]);
    }
    for (const w of as) {
      if (t.date_closed && +t.date_closed >= t0) push(w, { type: "closed", time: hm(t.date_closed), ...tref(t) });
      else if (!done.has(w)) push(w, { type: "touched", time: hm(t.date_updated), ...tref(t) });
    }
  }
  for (const w in ev) ev[w].sort((a, b) => b.time.localeCompare(a.time));
  const lastAt = {}; for (const e of teAll) { const w = MEMBERS[e.user.id]; if (w && (!lastAt[w] || +e.at > lastAt[w])) lastAt[w] = +e.at; }
  const activity = { date: today, people: Object.entries(ev).map(([who, events]) => ({ who, events,
    last_time_log: lastAt[who] ? new Date(lastAt[who]).toLocaleString("sv-SE", { timeZone: "Asia/Bangkok" }).slice(0, 16) : null })) };
  log(`activity tasks ${upd.length} · ClickUp calls ${calls}`);

  return { list: { id: LIST, name: meta.name, url: `https://app.clickup.com/${TEAM}/v/li/${LIST}`, statuses: meta.statuses.map(s => ({ status: s.status, type: s.type, color: s.color, order: s.orderindex })) },
    pulled_at: new Date().toISOString(), since: SINCE, proj_since: PROJ_SINCE, md_h: MD_H, tasks, time, projects, activity, calls };
}
