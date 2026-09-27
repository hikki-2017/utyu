// Weather loader (Open-Meteo, no API key) with deterministic offline sample fallback.

const VARS = "temperature_2m,relative_humidity_2m,wind_speed_10m,wind_direction_10m,precipitation";

function toSeries(hourly) {
  return {
    time: hourly.time,
    temp: hourly.temperature_2m.map((v) => v ?? 0),
    rh: hourly.relative_humidity_2m.map((v) => v ?? 50),
    wind: hourly.wind_speed_10m.map((v) => v ?? 0),
    dir: hourly.wind_direction_10m.map((v) => v ?? 0),
    precip: hourly.precipitation.map((v) => v ?? 0),
  };
}

export const jstHourString = (d = new Date()) =>
  d.toLocaleString("sv-SE", { timeZone: "Asia/Tokyo" }).replace(" ", "T").slice(0, 13) + ":00";

export function nowIndex(time) {
  const i = time.indexOf(jstHourString());
  return i >= 0 ? i : Math.min(72, time.length - 73);
}

export async function fetchForecast(points, signal) {
  const out = [];
  for (let i = 0; i < points.length; i += 40) {
    const chunk = points.slice(i, i + 40);
    const url =
      `https://api.open-meteo.com/v1/forecast?latitude=${chunk.map((p) => p.lat).join(",")}` +
      `&longitude=${chunk.map((p) => p.lon).join(",")}&hourly=${VARS}` +
      `&past_days=4&forecast_days=4&timezone=Asia%2FTokyo`;
    const res = await fetch(url, { signal });
    if (!res.ok) throw new Error(`Open-Meteo ${res.status}`);
    const json = await res.json();
    (Array.isArray(json) ? json : [json]).forEach((j) => out.push(toSeries(j.hourly)));
  }
  return out;
}

// Deterministic synthetic weather so the app still runs with no network.
export function sampleForecast(points) {
  const start = new Date(jstHourString().slice(0, 10) + "T00:00:00Z");
  start.setUTCDate(start.getUTCDate() - 4);
  const n = 8 * 24;
  const time = Array.from({ length: n }, (_, i) =>
    new Date(start.getTime() + i * 3600e3).toISOString().slice(0, 13) + ":00"
  );
  return points.map((p, k) => {
    const rnd = mulberry(k * 977 + 13);
    const base = 27 - (p.lat - 30) * 0.8;
    const dryPhase = rnd() * 6;
    const rainAt = 100 + Math.floor(rnd() * 50);
    const h = { time, temp: [], rh: [], wind: [], dir: [], precip: [] };
    for (let i = 0; i < n; i++) {
      const d = ((i % 24) - 15) / 24 * 2 * Math.PI;
      h.temp.push(base + 5 * Math.cos(d) + Math.sin(i / 40 + k));
      h.rh.push(clampN(62 - 22 * Math.cos(d) - 18 * Math.sin(i / 30 + dryPhase) + rnd() * 6, 12, 98));
      h.wind.push(clampN(9 + 8 * Math.sin(i / 17 + k) + rnd() * 5 + (k % 7 === 0 ? 10 : 0), 0, 60));
      h.dir.push((200 + 60 * Math.sin(i / 25 + k)) % 360);
      const inRain = i >= rainAt && i < rainAt + 10 && k % 3 === 0;
      h.precip.push(inRain ? 4 + rnd() * 9 : rnd() < 0.03 ? rnd() * 2 : 0);
    }
    return h;
  });
}

const clampN = (x, a, b) => Math.min(b, Math.max(a, x));
function mulberry(a) {
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const JMA = "https://www.jma.go.jp/bosai/typhoon/data/";

export function parseTyphoon(meta, spec) {
  const title = spec[0] || {};
  const pts = [];
  for (const p of spec.slice(1)) {
    const time = Date.parse(p.validtime?.UTC);
    if (!p.position?.deg || isNaN(time)) continue;
    const maxKm = (a) => Math.max(0, ...(a || []).map((x) => +x.range?.km || 0));
    pts.push({
      time, lat: p.position.deg[0], lon: p.position.deg[1],
      wind: +p.maximumWind?.sustained?.["m/s"] || 0,
      gust: +p.maximumWind?.gust?.["m/s"] || 0,
      gale: maxKm(p.galeWarning), storm: maxKm(p.stormWarning),
      prob: p.probabilityCircleRadius?.km || 0,
      forecast: /^Forecast/.test(p.part?.en || ""),
    });
  }
  pts.sort((a, b) => a.time - b.time);
  const a = spec.find((p) => p.part?.en === "Analysis") || {};
  if (!pts.length) return null;
  return {
    id: meta.tropicalCyclone, number: meta.typhoonNumber?.slice(2) || "", name: title.name?.jp || "",
    intensity: a.intensity || "", pressure: a.pressure, location: a.location, course: a.course,
    speed: a.speed?.["km/h"], wind: a.maximumWind?.sustained?.["m/s"], pts,
  };
}

export async function fetchTyphoons(signal) {
  const list = await (await fetch(JMA + "targetTc.json", { signal })).json();
  const all = await Promise.all(list.map(async (t) => {
    const spec = await (await fetch(`${JMA}${t.tropicalCyclone}/specifications.json`, { signal })).json();
    return parseTyphoon(t, spec);
  }));
  return all.filter(Boolean);
}

export function typhoonAt(ty, ms) {
  const p = ty.pts;
  if (ms < p[0].time - 3600e3 || ms > p[p.length - 1].time) return null;
  if (ms <= p[0].time) return p[0];
  const i = p.findIndex((x) => x.time >= ms);
  const a = p[i - 1], b = p[i], f = (ms - a.time) / (b.time - a.time || 1);
  const L = (k) => a[k] + (b[k] - a[k]) * f;
  return { time: ms, lat: L("lat"), lon: L("lon"), wind: L("wind"), gust: L("gust"), gale: L("gale"), storm: L("storm"), prob: L("prob"), forecast: b.forecast };
}
