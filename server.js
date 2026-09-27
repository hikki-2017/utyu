import http from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { fetchForecast, nowIndex } from "./web/forecast.js";
import { assessSeries, assessHour, level } from "./web/model.js";
import { LOCATIONS } from "./web/locations.js";

const ROOT = resolve(fileURLToPath(new URL("./web", import.meta.url)));
const PORT = process.env.PORT || 8080;
const MIME = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css", ".png": "image/png", ".svg": "image/svg+xml", ".map": "application/json", ".webmanifest": "application/manifest+json", ".json": "application/json" };

const json = (res, code, body) => {
  res.writeHead(code, { "content-type": "application/json; charset=utf-8", "access-control-allow-origin": "*" });
  res.end(JSON.stringify(body));
};

const cache = new Map();
async function risk(lat, lon) {
  const key = `${lat.toFixed(2)},${lon.toFixed(2)}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < 30 * 60e3) return hit.v;
  const [h] = await fetchForecast([{ lat, lon }]);
  const t0 = nowIndex(h.time);
  const s = assessSeries(h, t0, 72);
  const v = {
    location: { lat, lon },
    generatedAt: new Date().toISOString(),
    hours: s.fire.map((_, i) => ({
      time: h.time[t0 + i],
      fire: round(s.fire[i]), flood: round(s.flood[i]), heat: round(s.heat[i]),
      level: { fire: level(s.fire[i]).label, flood: level(s.flood[i]).label, heat: level(s.heat[i]).label },
    })),
    now: assessHour(h, t0),
    disclaimer: "参考値です。公的な警報ではありません。",
  };
  cache.set(key, { at: Date.now(), v });
  return v;
}
const round = (x) => Math.round(x * 10) / 10;

http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://x");
  try {
    if (url.pathname === "/healthz") return json(res, 200, { ok: true });
    if (url.pathname === "/api/locations") return json(res, 200, LOCATIONS);
    if (url.pathname === "/api/risk") {
      const lat = Number(url.searchParams.get("lat")), lon = Number(url.searchParams.get("lon"));
      if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180)
        return json(res, 400, { error: "lat と lon を指定してください" });
      return json(res, 200, await risk(lat, lon));
    }
    const rel = normalize(decodeURIComponent(url.pathname)).replace(/^([/\\])+/, "");
    const file = resolve(join(ROOT, rel === "" ? "index.html" : rel));
    if (!file.startsWith(ROOT)) { res.writeHead(403); return res.end(); }
    const body = await readFile(file);
    res.writeHead(200, { "content-type": MIME[extname(file)] || "application/octet-stream", "cache-control": "no-cache" });
    res.end(body);
  } catch (e) {
    if (e.code === "ENOENT" || e.code === "EISDIR") { res.writeHead(404); return res.end("Not found"); }
    console.error(e);
    json(res, 502, { error: "upstream error" });
  }
}).listen(PORT, () => console.log(`earth-eye listening on :${PORT}`));
