// Local preview without Netlify: serves public/ (the page falls back to public/clickup.json from `npm run pull`).
import http from "node:http";
import fs from "node:fs";
import path from "node:path";

const root = new URL("../public/", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
const types = { ".html": "text/html; charset=utf-8", ".json": "application/json", ".js": "text/javascript" };
const port = +process.env.PORT || 8787;
http.createServer((req, res) => {
  const p = decodeURIComponent(new URL(req.url, "http://x").pathname);
  const f = path.join(root, p === "/" ? "index.html" : p);
  if (!f.startsWith(path.normalize(root)) || !fs.existsSync(f)) { res.writeHead(404); return res.end("not found"); }
  res.writeHead(200, { "content-type": types[path.extname(f)] || "application/octet-stream", "cache-control": "no-store" });
  fs.createReadStream(f).pipe(res);
}).listen(port, () => console.log(`http://localhost:${port}`));
