import { LOCATIONS } from "./locations.js";
import { assessHour, assessSeries, HAZARDS, level, LEVELS, compass, distKm, typhoonScore } from "./model.js";
import { fetchForecast, sampleForecast, nowIndex, fetchTyphoons, typhoonAt } from "./forecast.js";

const $ = (s) => document.querySelector(s);
const N = 72;
const state = { hazard: "fire", hour: 0, sel: null, data: [], t0: 0, series: [], markers: [], timer: null, ty: [], times: [] };

const G = "https://gibs.earthdata.nasa.gov/wmts/epsg3857/best";
const gibsDate = new Date(Date.now() - 36 * 3600e3).toISOString().slice(0, 10);
const wmts = (layer, level, ext, date) => ({
  type: "raster", tileSize: 256, maxzoom: level, attribution: "NASA GIBS",
  tiles: [`${G}/${layer}/default/${date}/GoogleMapsCompatible_Level${level}/{z}/{y}/{x}.${ext}`],
});
const WMS = "https://gibs.earthdata.nasa.gov/wms/epsg3857/best/wms.cgi?SERVICE=WMS&VERSION=1.3.0&REQUEST=GetMap&FORMAT=image/png&TRANSPARENT=true&STYLES=&CRS=EPSG:3857&WIDTH=256&HEIGHT=256&BBOX={bbox-epsg-3857}";
const empty = { type: "FeatureCollection", features: [] };

// ひまわり静止衛星の雲（10分刻み）。スライダーの時刻に合わせて差し替える。
// 未来の時刻は観測が存在しないので、直近の観測にクランプする。
const CLOUD_SPAN_H = 12;   // スライダー全体を直近12時間の実観測に対応させる
function himawariTime(hourIndex) {
  const lag = 50 * 60e3;                       // 配信までの遅れ
  const back = CLOUD_SPAN_H * 3600e3 * (1 - (hourIndex || 0) / 71);
  const d = new Date(Date.now() - lag - back);
  d.setUTCMinutes(Math.floor(d.getUTCMinutes() / 10) * 10, 0, 0);
  return d.toISOString().slice(0, 19) + "Z";
}
const jstHHMM = (iso) => {
  const d = new Date(iso);
  return `${String((d.getUTCHours() + 9) % 24).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}`;
};

const map = new maplibregl.Map({
  container: "map",
  center: [136, 28], zoom: 1.4, maxPitch: 60,
  attributionControl: { compact: true },
  style: {
    version: 8,
    projection: { type: "globe" },
    sky: { "sky-color": "#02040c", "horizon-color": "#3a78ff", "fog-color": "#0b1a44", "sky-horizon-blend": 0.6, "horizon-fog-blend": 0.5, "fog-ground-blend": 0.2, "atmosphere-blend": ["interpolate", ["linear"], ["zoom"], 0, 1, 5, 1, 7, 0] },
    sources: {
      blue: wmts("BlueMarble_ShadedRelief_Bathymetry", 8, "jpeg", "default"),
      true: wmts("VIIRS_SNPP_CorrectedReflectance_TrueColor", 9, "jpg", gibsDate),
      cloud: { type: "raster", tileSize: 256, maxzoom: 6, attribution: "NASA GIBS / Himawari AHI",
        tiles: [`${G}/Himawari_AHI_Band13_Clean_Infrared/default/${himawariTime(0)}/GoogleMapsCompatible_Level6/{z}/{y}/{x}.png`] },
      fire: { type: "raster", tileSize: 256, maxzoom: 12, attribution: `NASA FIRMS ${gibsDate}`, tiles: [`${WMS}&LAYERS=VIIRS_NOAA20_Thermal_Anomalies_375m_All&TIME=${gibsDate}`] },
      coast: wmts("Coastlines_15m", 13, "png", "default"),
      labels: wmts("Reference_Labels_15m", 13, "png", "default"),
      pts: { type: "geojson", data: empty },
      tyTrack: { type: "geojson", data: empty },
      tyCircles: { type: "geojson", data: empty },
      tyNow: { type: "geojson", data: empty },
      issFoot: { type: "geojson", data: empty },
      issPath: { type: "geojson", data: empty },
    },
    layers: [
      { id: "blue", type: "raster", source: "blue" },
      { id: "true", type: "raster", source: "true", paint: { "raster-opacity": 0.9 } },
      { id: "coast", type: "raster", source: "coast", paint: { "raster-opacity": 0.7 } },
      { id: "cloud", type: "raster", source: "cloud", layout: { visibility: "none" }, paint: { "raster-opacity": 0.72 } },
      { id: "fire", type: "raster", source: "fire", minzoom: 4.5 },
      { id: "labels", type: "raster", source: "labels" },
      { id: "tyCircles", type: "fill", source: "tyCircles", paint: { "fill-color": ["get", "color"], "fill-opacity": ["get", "op"] } },
      { id: "tyCirclesLine", type: "line", source: "tyCircles", paint: { "line-color": ["get", "color"], "line-width": 1 } },
      { id: "tyTrack", type: "line", source: "tyTrack", paint: { "line-color": "#ff4fd8", "line-width": 3, "line-dasharray": [2, 2] } },
      { id: "tyNow", type: "fill", source: "tyNow", paint: { "fill-color": ["get", "color"], "fill-opacity": ["get", "op"] } },
      { id: "issFoot", type: "fill", source: "issFoot", paint: { "fill-color": "#5ff2ff", "fill-opacity": 0.08 } },
      { id: "issFootLine", type: "line", source: "issFoot", paint: { "line-color": "#5ff2ff", "line-width": 1, "line-opacity": 0.5 } },
      { id: "issPath", type: "line", source: "issPath", paint: { "line-color": "#5ff2ff", "line-width": 2, "line-dasharray": [1, 2] } },
      { id: "glow", type: "circle", source: "pts", filter: [">=", ["get", "score"], 50], paint: { "circle-color": ["get", "color"], "circle-radius": ["*", ["get", "r"], 2], "circle-opacity": 0.25, "circle-blur": 0.8 } },
      { id: "pts", type: "circle", source: "pts", paint: {
        "circle-color": ["get", "color"], "circle-opacity": 0.85,
        "circle-radius": ["interpolate", ["linear"], ["zoom"], 1, ["*", ["get", "r"], 0.5], 5, ["get", "r"]],
        "circle-stroke-color": ["case", ["==", ["get", "sel"], 1], "#fff", ["get", "color"]],
        "circle-stroke-width": ["case", ["==", ["get", "sel"], 1], 3, 1] } },
    ],
  },
});
window.earthMap = map;
const mapReady = new Promise((r) => map.once("load", r));
map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), "top-left");
map.addControl(new maplibregl.GlobeControl(), "top-left");

// idle auto-rotation until the user touches the globe
let spin = true;
let last = performance.now();
const spinStep = (now) => {
  if (spin && !map.isMoving() && map.getZoom() < 4) {
    const c = map.getCenter();
    map.setCenter([c.lng - ((now - last) / 1000) * 4, c.lat]);
  }
  last = now;
  requestAnimationFrame(spinStep);
};
requestAnimationFrame(spinStep);
["mousedown", "touchstart", "wheel"].forEach((e) => map.getCanvas().addEventListener(e, () => (spin = false), { passive: true }));

const layerIds = { true: ["true"], fire: ["fire"], iss: ["issFoot", "issFootLine", "issPath"], cloud: ["cloud"] };
document.querySelectorAll("#layers button").forEach((b) =>
  b.addEventListener("click", () => {
    const on = b.classList.toggle("on");
    layerIds[b.dataset.layer].forEach((id) => map.setLayoutProperty(id, "visibility", on ? "visible" : "none"));
    if (b.dataset.layer === "cloud") { cloudAt = null; $("#cloudNote").hidden = !on; updateCloudTime(); }
    if (b.dataset.layer === "iss") issMarker?.getElement().classList.toggle("off", !on);
  })
);

const circlePoly = (lat, lon, km, n = 72) => {
  const R = 6371, d = km / R, r = Math.PI / 180, ring = [];
  for (let k = 0; k <= n; k++) {
    const br = (k / n) * 2 * Math.PI;
    const la = Math.asin(Math.sin(lat * r) * Math.cos(d) + Math.cos(lat * r) * Math.sin(d) * Math.cos(br));
    const lo = lon * r + Math.atan2(Math.sin(br) * Math.sin(d) * Math.cos(lat * r), Math.cos(d) - Math.sin(lat * r) * Math.sin(la));
    ring.push([((lo / r + 540) % 360) - 180, la / r]);
  }
  return { type: "Polygon", coordinates: [ring] };
};
const flyTo = (lon, lat, zoom) => { spin = false; map.flyTo({ center: [lon, lat], zoom, duration: 1200 }); };

function buildTabs() {
  $("#hazards").innerHTML = Object.entries(HAZARDS)
    .filter(([k]) => k !== "typhoon" || state.ty.length)
    .map(([k, v]) => `<button data-h="${k}" class="${k === state.hazard ? "on" : ""}">${v.icon} ${v.label}</button>`)
    .join("");
}
buildTabs();
$("#hazards").addEventListener("click", (e) => {
  const b = e.target.closest("button");
  if (!b) return;
  state.hazard = b.dataset.h;
  document.querySelectorAll("#hazards button").forEach((x) => x.classList.toggle("on", x === b));
  render();
});
$("#legend").innerHTML = LEVELS.map((l) => `<span><i style="background:${l.color}"></i>${l.label}</span>`).join("");

function fmtTime(off) {
  const t = state.data[0]?.time[state.t0 + off];
  if (!t) return "";
  const d = new Date(t.replace("T", " ").replace(/-/g, "/"));
  return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, "0")}:00` + (off === 0 ? "（現在）" : `（+${off}h）`);
}

function scoreAt(i, off, hz = state.hazard) {
  return state.series[i][hz][off];
}

let tyMarkers = [];

function tyCards() {
  $("#tyCard").hidden = !state.ty.length;
  $("#tyInfo").innerHTML = state.ty.map((t) =>
    `<p><b>台風${t.number}号 ${t.name}</b> ${t.intensity ? `（${t.intensity}）` : ""}<br><span class="hint">${t.location || ""} / ${t.course || ""}へ${t.speed || "-"}km/h / 中心気圧${t.pressure || "-"}hPa / 最大風速${t.wind || "-"}m/s</span></p>`).join("");
}

function drawTyphoonTrack() {
  const lines = [], circles = [];
  for (const t of state.ty) {
    lines.push({ type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: t.pts.map((p) => [p.lon, p.lat]) } });
    t.pts.filter((p) => p.forecast && p.prob).forEach((p) =>
      circles.push({ type: "Feature", properties: { color: "#ff4fd8", op: 0.07 }, geometry: circlePoly(p.lat, p.lon, p.prob) }));
  }
  map.getSource("tyTrack").setData({ type: "FeatureCollection", features: lines });
  map.getSource("tyCircles").setData({ type: "FeatureCollection", features: circles });
}

function drawTyphoonNow() {
  tyMarkers.forEach((m) => m.remove());
  tyMarkers = [];
  const feats = [], ms = state.times[state.hour];
  for (const t of state.ty) {
    const p = typhoonAt(t, ms);
    if (!p) continue;
    if (p.gale) feats.push({ type: "Feature", properties: { color: "#ffd166", op: 0.14 }, geometry: circlePoly(p.lat, p.lon, p.gale) });
    if (p.storm) feats.push({ type: "Feature", properties: { color: "#ff3b3b", op: 0.3 }, geometry: circlePoly(p.lat, p.lon, p.storm) });
    const el = document.createElement("div");
    el.innerHTML = '<div class="tyicon">🌀</div>';
    tyMarkers.push(new maplibregl.Marker({ element: el }).setLngLat([p.lon, p.lat]).addTo(map));
  }
  map.getSource("tyNow")?.setData({ type: "FeatureCollection", features: feats });
}

function typhoonAssess(i, off) {
  const ms = state.times[off];
  let best = { score: 0, factors: [{ name: "台風の影響なし（この時刻）", value: "-", share: 0 }] };
  for (const t of state.ty) {
    const p = typhoonAt(t, ms);
    if (!p) continue;
    const d = distKm(LOCATIONS[i].lat, LOCATIONS[i].lon, p.lat, p.lon);
    const score = typhoonScore(d, p.storm, p.gale);
    if (score >= best.score) best = { score, factors: [
      { name: `台風${t.number}号 ${t.name} までの距離`, value: `${d.toFixed(0)}km`, share: score / 100 },
      { name: "暴風域半径(25m/s)", value: `${p.storm.toFixed(0)}km`, share: Math.min(1, p.storm / 300) },
      { name: "強風域半径(15m/s)", value: `${p.gale.toFixed(0)}km`, share: Math.min(1, p.gale / 600) },
      { name: "最大風速", value: `${p.wind.toFixed(0)}m/s`, share: Math.min(1, p.wind / 60) },
    ] };
  }
  return best;
}

function render() {
  drawTyphoonNow();
  const off = state.hour;
  $("#hourLabel").textContent = fmtTime(off);
  map.getSource("pts")?.setData({
    type: "FeatureCollection",
    features: LOCATIONS.map((l, i) => {
      const sc = scoreAt(i, off), lv = level(sc);
      return { type: "Feature", properties: { i, score: sc, color: lv.color, r: 6 + (sc / 100) * 9, sel: i === state.sel ? 1 : 0 }, geometry: { type: "Point", coordinates: [l.lon, l.lat] } };
    }),
  });
  const order = LOCATIONS.map((_, i) => i).sort((a, b) => scoreAt(b, off) - scoreAt(a, off)).slice(0, 6);
  $("#rankList").innerHTML = order
    .map((i) => {
      const s = scoreAt(i, off), lv = level(s);
      return `<li data-i="${i}" class="${i === state.sel ? "sel" : ""}"><span class="dot" style="background:${lv.color}"></span><span class="rname">${LOCATIONS[i].name}</span><span class="rscore">${s.toFixed(0)}</span><span class="tag" style="background:${lv.color}">${lv.label}</span></li>`;
    })
    .join("");
  if (state.sel != null) renderDetail();
}

$("#rankList").addEventListener("click", (e) => {
  const li = e.target.closest("li");
  if (li) select(+li.dataset.i, true);
});

function select(i, fly) {
  state.sel = i;
  if (fly) flyTo(LOCATIONS[i].lon, LOCATIONS[i].lat, Math.max(map.getZoom(), 5));
  render();
}

function renderDetail() {
  const i = state.sel, off = state.hour, t = state.t0 + off, h = state.data[i];
  const a = state.hazard === "typhoon" ? typhoonAssess(i, off) : assessHour(h, t)[state.hazard];
  const lv = level(a.score);
  const wind = state.hazard === "fire"
    ? `<p class="hint">風: <span class="wind" style="transform:rotate(${(h.dir[t] + 180) % 360}deg)">⬆</span> ${compass(h.dir[t])}の風 ${h.wind[t].toFixed(0)}km/h → 延焼は${compass((h.dir[t] + 180) % 360)}方向に拡大しやすい</p>`
    : "";
  $("#detail").innerHTML = `
    <h2>${LOCATIONS[i].name}</h2>
    <p><span class="tag" style="background:${lv.color}">${HAZARDS[state.hazard].icon} ${HAZARDS[state.hazard].label} ${lv.label}</span> <b>${a.score.toFixed(0)}</b>/100　<span class="hint">${fmtTime(off)}</span></p>
    ${wind}
    <canvas id="chart" width="700" height="240"></canvas>
    <p class="hint">判断根拠（寄与の大きさ）</p>
    ${a.factors.map((f) => `<div class="factor"><span>${f.name}</span><span>${f.value}</span><div class="bar"><b style="width:${Math.round(Math.max(0, Math.min(1, Math.abs(f.share))) * 100)}%;${f.share < 0 ? "background:#3ddc97" : ""}"></b></div></div>`).join("")}`;
  drawChart(i, off);
}

function drawChart(i, off) {
  const c = $("#chart"); if (!c) return;
  const g = c.getContext("2d"), W = c.width, H = c.height;
  g.clearRect(0, 0, W, H);
  LEVELS.forEach((l, k) => {
    const y0 = H - (Math.min(l.max, 100) / 100) * H, y1 = H - ((LEVELS[k - 1]?.max ?? 0) / 100) * H;
    g.fillStyle = l.color + "14"; g.fillRect(0, y0, W, y1 - y0);
  });
  const colors = { fire: "#ff6b3b", flood: "#5b8cff", heat: "#f4d35e", typhoon: "#ff4fd8" };
  for (const hz of Object.keys(colors)) {
    if (!state.series[i][hz]) continue;
    g.beginPath(); g.lineWidth = hz === state.hazard ? 4 : 2; g.strokeStyle = colors[hz]; g.globalAlpha = hz === state.hazard ? 1 : 0.4;
    state.series[i][hz].forEach((s, k) => { const x = (k / (N - 1)) * W, y = H - (s / 100) * H; k ? g.lineTo(x, y) : g.moveTo(x, y); });
    g.stroke();
  }
  g.globalAlpha = 1; g.strokeStyle = "#fff"; g.lineWidth = 2;
  const x = (off / (N - 1)) * W; g.beginPath(); g.moveTo(x, 0); g.lineTo(x, H); g.stroke();
}

let cloudAt = null;
function updateCloudTime() {
  if (!map.getSource("cloud")) return;
  if (map.getLayoutProperty("cloud", "visibility") !== "visible") return;
  const t = himawariTime(state.hour);
  if (t === cloudAt) return;
  cloudAt = t;
  map.getSource("cloud").setTiles([`${G}/Himawari_AHI_Band13_Clean_Infrared/default/${t}/GoogleMapsCompatible_Level6/{z}/{y}/{x}.png`]);
  $("#cloudNote").textContent = `☁️ ひまわり ${jstHHMM(t)} の実観測（直近${CLOUD_SPAN_H}時間を再生）`;
}

function setHour(v) {
  state.hour = Math.max(0, Math.min(N - 1, v));
  $("#hour").value = state.hour;
  render();
  updateCloudTime();
}
$("#hour").addEventListener("input", (e) => setHour(+e.target.value));
$("#play").addEventListener("click", () => {
  if (state.timer) return stop();
  $("#play").textContent = "⏸";
  state.timer = setInterval(() => (state.hour >= N - 1 ? stop() : setHour(state.hour + 1)), 250);
});
function stop() { clearInterval(state.timer); state.timer = null; $("#play").textContent = "▶"; }

async function scenario() {
  const btn = $("#scenarioBtn"); btn.disabled = true; stop();
  let best = { s: -1 };
  state.series.forEach((ser, i) => ser.fire.forEach((s, k) => { if (s > best.s) best = { s, i, k }; }));
  state.hazard = "fire";
  document.querySelectorAll("#hazards button").forEach((x) => x.classList.toggle("on", x.dataset.h === "fire"));
  const { i, k, s } = best, loc = LOCATIONS[i], t = state.t0 + k, h = state.data[i];
  const lead = Math.min(k, 3);
  const spread = compass((h.dir[t] + 180) % 360);
  const steps = [
    [-lead, "予兆を検知", `${loc.name}で湿度${h.rh[t].toFixed(0)}%・風速${h.wind[t].toFixed(0)}km/hへ。火災リスク指数が急上昇`],
    [-lead, "衛星と突合", "NASA VIIRS の熱異常（火点）レイヤーで周辺の実火点を確認"],
    [0, s >= 50 ? "警報を自動発出" : "監視を強化", `指数 ${s.toFixed(0)}（${level(s).label}）。${s >= 50 ? "地域の消防・自治体ダッシュボードへ通知" : "現時点は基準未満。72時間の最大値として地域担当者へ共有"}`],
    [0, "消防隊へ提案", `風下（${spread}側）の集落方向を優先警戒。風上側の林道に初動部隊を待機`],
    [0, "住民へ避難支援", `${spread}側の集落から順に、通信が切れても端末内で動く避難ルート案内を配信`],
  ];
  $("#story").innerHTML = "";
  flyTo(loc.lon, loc.lat, 6);
  setHour(Math.max(0, k - lead)); select(i);
  for (const [dk, title, body] of steps) {
    await new Promise((r) => setTimeout(r, 1100));
    setHour(Math.max(0, k + dk));
    $("#story").insertAdjacentHTML("beforeend", `<li><b>${fmtTime(Math.max(0, k + dk))}</b>${title}：${body}</li>`);
  }
  btn.disabled = false;
}
$("#scenarioBtn").addEventListener("click", scenario);

async function init() {
  const ctl = new AbortController();
  const timeout = setTimeout(() => ctl.abort(), 15000);
  let live = true;
  try { state.data = await fetchForecast(LOCATIONS, ctl.signal); }
  catch (e) { console.warn("forecast failed, using offline sample", e); live = false; state.data = sampleForecast(LOCATIONS); }
  clearTimeout(timeout);
  state.t0 = nowIndex(state.data[0].time);
  state.series = state.data.map((h) => assessSeries(h, state.t0, N));
  state.times = Array.from({ length: N }, (_, k) => Date.parse(state.data[0].time[state.t0 + k] + "+09:00"));
  try { state.ty = await fetchTyphoons(AbortSignal.timeout(10000)); } catch (e) { console.warn("typhoon fetch failed", e); }
  state.series.forEach((ser, i) => {
    ser.typhoon = state.times.map((_, k) => typhoonAssess(i, k).score);
  });
  await mapReady;
  const popup = new maplibregl.Popup({ closeButton: false, closeOnClick: false, offset: 12 });
  map.on("mousemove", "pts", (e) => {
    map.getCanvas().style.cursor = "pointer";
    const f = e.features[0], i = f.properties.i, sc = state.series[i][state.hazard][state.hour], lv = level(sc);
    popup.setLngLat(f.geometry.coordinates).setHTML(`${LOCATIONS[i].name}<br>${HAZARDS[state.hazard].label}: <b>${sc.toFixed(0)}</b>（${lv.label}）`).addTo(map);
  });
  map.on("mouseleave", "pts", () => { map.getCanvas().style.cursor = ""; popup.remove(); });
  map.on("click", "pts", (e) => select(e.features[0].properties.i));
  state.live = live;
  const st = $("#status");
  st.textContent = live ? "● 実データ（Open-Meteo）" : "● オフラインのサンプルデータ";
  st.className = "status " + (live ? "ok" : "warn");
  if (state.ty.length) {
    state.hazard = "typhoon";
    tyCards(); drawTyphoonTrack(); buildTabs();
    const t = state.ty[0].pts[0];
    spin = false;
    map.jumpTo({ center: [(t.lon + 139.5) / 2, (t.lat + 35.5) / 2], zoom: 3.6 });
  }
  render();
  solarUI?.refreshEarth();
}
init();

function getEarthLive() {
  if (!state.series.length) return null;
  const top = ["typhoon", "fire", "flood", "heat"].filter((h) => h !== "typhoon" || state.ty.length).map((hz) => {
    let best = 0;
    LOCATIONS.forEach((_, i) => { if (state.series[i][hz][0] > state.series[best][hz][0]) best = i; });
    const sc = state.series[best][hz][0], lv = level(sc);
    return { icon: HAZARDS[hz].icon, label: HAZARDS[hz].label, name: LOCATIONS[best].name, lat: LOCATIONS[best].lat, lon: LOCATIONS[best].lon, score: sc, level: lv.label, color: lv.color };
  });
  return { typhoons: state.ty, top, real: state.live };
}

// ---- Earth / solar-system mode switch ----
let solarUI = null, cosmosUI = null, skyUI = null, moonUI = null, innerTimer = null;
async function setMode(m) {
  document.body.classList.toggle("solar", m === "solar");
  document.body.classList.toggle("cosmos", m === "cosmos");
  document.body.classList.toggle("sky", m === "sky");
  document.body.classList.toggle("moon", m === "moon");
  document.body.classList.toggle("inner", m === "inner");
  document.querySelectorAll("#mode button").forEach((b) => b.classList.toggle("on", b.dataset.mode === m));
  if (m !== "solar") solarUI?.hide();
  if (m !== "cosmos") cosmosUI?.hide();
  if (m !== "sky") skyUI?.hide();
  if (m !== "moon") moonUI?.hide();
  if (m !== "inner") stopInner();
  if (m === "earth") return requestAnimationFrame(() => map.resize());
  stop();
  try {
    if (m === "solar") { solarUI ||= (await import("./solarui.js")).initSolarUI({ onEarth: () => setMode("earth"), getEarthLive }); solarUI.show(); }
    else if (m === "inner") { startInner(); }
    else if (m === "moon") { moonUI ||= (await import("./moon.js")).initMoonUI(); moonUI.show(); }
    else if (m === "sky") { skyUI ||= (await import("./sky.js")).initSky(); skyUI.show(); }
    else { cosmosUI ||= (await import("./cosmos.js")).initCosmosUI(); cosmosUI.show(); }
  } catch (e) { console.error(e); alert("3Dビューを開始できませんでした（WebGLが必要です）"); setMode("earth"); }
}
$("#mode").addEventListener("click", (e) => { const b = e.target.closest("button"); if (b) setMode(b.dataset.mode); });

// ---- ISS live tracking (wheretheiss.at, no key) ----
let issMarker = null, issPathAt = 0;
const ISS = "https://api.wheretheiss.at/v1/satellites/25544";
const splitLine = (pts) => {
  const lines = [[]];
  pts.forEach((p, i) => {
    if (i && Math.abs(p[0] - pts[i - 1][0]) > 180) lines.push([]);
    lines.at(-1).push(p);
  });
  return lines.filter((l) => l.length > 1);
};

async function loadIssPath() {
  const t = Math.floor(Date.now() / 1000), pts = [];
  for (const base of [-20, 30]) {
    const ts = Array.from({ length: 10 }, (_, i) => t + (base + i * 5) * 60).join(",");
    const r = await fetch(`${ISS}/positions?timestamps=${ts}&units=kilometers`);
    if (!r.ok) throw new Error("iss path");
    (await r.json()).forEach((p) => pts.push([p.longitude, p.latitude]));
  }
  map.getSource("issPath").setData({ type: "Feature", properties: {}, geometry: { type: "MultiLineString", coordinates: splitLine(pts) } });
  issPathAt = Date.now();
}

async function updateIss() {
  if (!document.body.matches(":not(.solar):not(.cosmos):not(.sky):not(.moon):not(.inner)")) return;
  try {
    const r = await fetch(ISS);
    if (!r.ok) return;
    const p = await r.json();
    map.getSource("issFoot").setData({ type: "Feature", properties: {}, geometry: circlePoly(p.latitude, p.longitude, p.footprint / 2) });
    if (!issMarker) {
      const el = document.createElement("div");
      el.innerHTML = '<div class="issicon" title="国際宇宙ステーション">🛰</div>';
      issMarker = new maplibregl.Marker({ element: el }).setLngLat([p.longitude, p.latitude]).addTo(map);
    } else issMarker.setLngLat([p.longitude, p.latitude]);
    issLast = { alt: p.altitude, lat: p.latitude, lon: p.longitude, visible: p.visibility !== "eclipsed" };
    let near = null;
    LOCATIONS.forEach((l) => { const d = distKm(p.latitude, p.longitude, l.lat, l.lon); if (!near || d < near.d) near = { d, name: l.name }; });
    $("#issInfo").innerHTML = `
      <p class="hint" style="margin:0 0 4px">高度 <b>${p.altitude.toFixed(0)}km</b> ／ 速度 <b>${p.velocity.toFixed(0)}km/h</b>（地球1周 約92分）</p>
      <p class="hint" style="margin:0 0 6px">緯度 ${p.latitude.toFixed(1)}° 経度 ${p.longitude.toFixed(1)}° ／ ${p.visibility === "eclipsed" ? "地球の影の中（夜側）" : "日照中"}<br>最寄りの監視地点: ${near.name}（約${near.d.toFixed(0)}km）</p>
      <button id="issGo" class="primary" style="padding:6px;font-size:12px">ISSの位置へ移動</button>`;
    $("#issGo").onclick = () => flyTo(p.longitude, p.latitude, 3.2);
    if (Date.now() - issPathAt > 5 * 60e3) loadIssPath().catch(() => {});
  } catch (e) { /* offline: keep last position */ }
}
mapReady.then(() => { updateIss(); setInterval(updateIss, 5000); });

if ("serviceWorker" in navigator && location.protocol !== "file:") navigator.serviceWorker.register("sw.js").catch(() => {});

// ---- 僕の宇宙（INNER COSMOS）: 実観測データを内の宇宙へ送る ----
let issLast = null, kpLast = null;
function startInner() {
  const f = $("#inner");
  f.hidden = false;
  if (f.getAttribute("src") === "about:blank") f.src = "inner.html";
  clearInterval(innerTimer);
  innerTimer = setInterval(pushInner, 4000);
  pushInner();
  if (kpLast == null) {
    fetch("https://services.swpc.noaa.gov/products/noaa-planetary-k-index.json")
      .then((r) => r.json()).then((j) => { kpLast = +j.at(-1).Kp; }).catch(() => {});
  }
}
function stopInner() { clearInterval(innerTimer); innerTimer = null; $("#inner").hidden = true; }

function pushInner() {
  const live = getEarthLive();
  if (!live) return;
  const payload = { typhoons: live.typhoons.map((t) => ({ number: t.number, name: t.name, pressure: t.pressure, wind: t.wind })), top: live.top, iss: issLast, kp: kpLast };
  $("#inner").contentWindow?.postMessage({ type: "earth-eye:live", payload }, "*");
  const ty = payload.typhoons[0];
  $("#innerFeed").innerHTML =
    (ty ? `🌀 台風${ty.number}号 ${ty.name}（${ty.pressure || "-"}hPa）<br>` : "🌀 台風なし<br>") +
    live.top.map((h) => `${h.icon} ${h.label}: ${h.name} ${h.score.toFixed(0)}`).join("<br>") +
    (issLast ? `<br>🛰 ISS 高度${issLast.alt.toFixed(0)}km` : "") +
    (kpLast != null ? `<br>☀ 地磁気Kp ${kpLast.toFixed(1)}` : "");
}
window.addEventListener("message", (e) => {
  if (e.data?.type === "inner:ready") pushInner();
});

$("#innerBang")?.addEventListener("click", () => {
  const w = $("#inner").contentWindow;
  try {
    if (!w?.__cosmos) return alert("「僕の宇宙」を開いて、宇宙が生まれてから押してください。");
    if (!w.__cosmos.constellations.length) return alert("先に星座を1つ作ってください。画面下の「星座を作る」を押して、手を動かし、止めると完成します。");
    w.__cosmos.finale();
  } catch (err) { console.warn(err); }
});

// ---- 宇宙の旅（全モードを1本につなぐ） ----
import("./journey.js").then((m) => m.initJourney({
  setMode,
  focusTyphoon: () => { const t = state.ty[0]?.pts[0]; if (t) flyTo(t.lon, t.lat, 3.4); },
  focusIss: () => $("#issGo")?.click(),
})).catch((e) => { console.warn(e); $("#intro")?.classList.add("gone"); });
