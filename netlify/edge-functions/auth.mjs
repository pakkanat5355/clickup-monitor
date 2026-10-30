// Gate every page behind the team password (env SITE_PASSWORD). POST /login sets the cookie; /logout clears it.
import { COOKIE, sign, authed } from "../../lib/auth.mjs";

const page = (msg = "") => `<!doctype html><html lang="th"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>ClickUp Monitor</title><meta name="robots" content="noindex">
<style>
:root{--bg:#f3f4f7;--panel:#fff;--line:#d9dce5;--fg:#1b1f2c;--muted:#5d6477;--accent:#2f4fd1;--crit:#c2362f}
@media (prefers-color-scheme:dark){:root{--bg:#12141b;--panel:#1b1e28;--line:#2d3240;--fg:#e8eaf0;--muted:#9aa1b3;--accent:#7d93ff;--crit:#ff7a72}}
body{margin:0;min-height:100vh;display:grid;place-items:center;background:var(--bg);color:var(--fg);font:15px/1.5 system-ui,"IBM Plex Sans Thai",sans-serif;padding:16px;box-sizing:border-box}
form{background:var(--panel);border:1px solid var(--line);border-radius:12px;padding:28px;width:100%;max-width:340px;display:grid;gap:14px}
h1{margin:0;font-size:20px}p{margin:0;color:var(--muted);font-size:13px}
input{font:inherit;padding:10px 12px;border:1px solid var(--line);border-radius:8px;background:transparent;color:inherit}
button{font:inherit;font-weight:600;padding:10px;border:0;border-radius:8px;background:var(--accent);color:#fff;cursor:pointer}
.err{color:var(--crit)}
</style></head><body><form method="post" action="/login"><h1>ClickUp Monitor</h1><p>BSS team · ใส่รหัสผ่านของทีม</p>
<input type="password" name="password" autocomplete="current-password" required autofocus aria-label="รหัสผ่าน">
${msg ? `<p class="err">${msg}</p>` : ""}<button type="submit">เข้าสู่ระบบ</button></form></body></html>`;
const html = (body, status) => new Response(body, { status, headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } });

export default async (req, context) => {
  const pw = Netlify.env.get("SITE_PASSWORD");
  const url = new URL(req.url);
  if (!pw) return html(page("ยังไม่ได้ตั้ง SITE_PASSWORD ใน Netlify"), 503);
  if (url.pathname === "/logout") return new Response(null, { status: 302, headers: { location: "/", "set-cookie": `${COOKIE}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax` } });
  if (url.pathname === "/login" && req.method === "POST") {
    const form = await req.formData();
    if (String(form.get("password") || "") !== pw) return html(page("รหัสผ่านไม่ถูกต้อง"), 401);
    return new Response(null, { status: 302, headers: { location: "/", "set-cookie": `${COOKIE}=${await sign(pw)}; Path=/; Max-Age=2592000; HttpOnly; Secure; SameSite=Lax` } });
  }
  if (await authed(req, pw)) return url.pathname === "/login" ? Response.redirect(new URL("/", url), 302) : context.next();
  if (url.pathname.startsWith("/api/")) return Response.json({ error: "unauthorized" }, { status: 401 });
  return html(page(), 401);
};

export const config = { path: "/*", excludedPath: ["/.netlify/*"] };
