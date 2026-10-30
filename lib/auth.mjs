// Shared-password auth. The cookie holds HMAC(SITE_PASSWORD, "clickup-monitor"), so changing the password logs everyone out.
export const COOKIE = "cm_auth";

export async function sign(password) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode("clickup-monitor"));
  return [...new Uint8Array(mac)].map(b => b.toString(16).padStart(2, "0")).join("");
}

export function cookieOf(req, name = COOKIE) {
  const m = (req.headers.get("cookie") || "").match(new RegExp(`(?:^|;\\s*)${name}=([^;]+)`));
  return m ? m[1] : null;
}

export async function authed(req, password) {
  if (!password) return false;
  const c = cookieOf(req);
  return !!c && c === await sign(password);
}
