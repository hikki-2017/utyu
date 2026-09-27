import { createSolar } from "./solar.js";
import { PLANETS, position, dist, LIGHT_MIN_PER_AU, marsLs, marsSeason, NUMS, RECORDS, EVENTS } from "./planets.js";

const $ = (s) => document.querySelector(s);
const SWPC = "https://services.swpc.noaa.gov";
const AU_KM = 149597870.7;

async function loadSpaceWeather() {
  const get = (p) => fetch(SWPC + p, { signal: AbortSignal.timeout(10000) }).then((r) => r.json());
  const [kp, wind, xr] = await Promise.allSettled([
    get("/products/noaa-planetary-k-index.json"),
    get("/json/rtsw/rtsw_wind_1m.json"),
    get("/json/goes/primary/xrays-6-hour.json"),
  ]);
  const out = {};
  if (kp.status === "fulfilled") { const k = kp.value.at(-1); out.kp = +k.Kp; out.kpTime = k.time_tag; }
  if (wind.status === "fulfilled") {
    const w = [...wind.value].reverse().find((x) => x.proton_speed != null);
    if (w) out.wind = { speed: w.proton_speed, density: w.proton_density, time: w.time_tag };
  }
  if (xr.status === "fulfilled") {
    const x = [...xr.value].reverse().find((r) => r.energy === "0.1-0.8nm");
    if (x) out.xray = x.flux;
  }
  return out;
}

function flareClass(f) {
  const t = [["X", 1e-4], ["M", 1e-5], ["C", 1e-6], ["B", 1e-7], ["A", 1e-8]].find(([, b]) => f >= b) || ["A", 1e-8];
  return `${t[0]}${(f / t[1]).toFixed(1)}`;
}
const gScale = (kp) => (kp >= 9 ? "G5 極端" : kp >= 8 ? "G4 激しい" : kp >= 7 ? "G3 強い" : kp >= 6 ? "G2 中程度" : kp >= 5 ? "G1 小" : "嵐なし");

export function initSolarUI({ onEarth, getEarthLive }) {
  const host = $("#solar");
  let solar = null, sw = null, current = null;
  const list = $("#planetList");
  list.innerHTML = [{ id: "summary", name: "📊 まとめ" }, { id: "sun", name: "太陽" }, ...PLANETS].map((p) => `<button data-id="${p.id}">${p.name}</button>`).join("");
  list.addEventListener("click", (e) => { const b = e.target.closest("button"); if (!b || !solar) return; if (b.dataset.id === "summary") { solar.overview(); panel("summary"); } else solar.select(b.dataset.id); });

  const dayLabel = () => {
    const d = solar.date();
    $("#solarDate").textContent = `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`;
  };

  function panel(id) {
    current = id;
    list.querySelectorAll("button").forEach((b) => b.classList.toggle("on", b.dataset.id === id));
    const date = solar.date();
    const el = $("#planetInfo");
    if (id === "summary") return renderSummary(el);
    if (id === "sun") return renderSun(el, date);
    const pl = PLANETS.find((p) => p.id === id);
    const pos = position(id, date), earth = position("earth", date);
    const rSun = Math.hypot(pos.x, pos.y, pos.z), dE = dist(pos, earth);
    let extra = "";
    if (id === "earth") extra = earthLive();
    if (id === "mars") {
      const ls = marsLs(date), dust = ls >= 180 && ls < 360;
      extra = `<div class="stat"><b>現在の季節（計算）</b>Ls ${ls.toFixed(0)}° — ${marsSeason(ls)}<br>砂嵐シーズン: <b class="${dust ? "hot" : ""}">${dust ? "はい（Ls180〜360）" : "いいえ"}</b></div>`;
    }
    el.innerHTML = `
      <h2>${pl.name}の天気</h2>
      ${id === "earth" ? '<p class="hint">地球は観測網があるため、実際の観測・予報データをリアルタイムで表示します。</p>' : '<p class="hint">※地球以外に気象観測網は無く、リアルタイムの天気はありません。下記は観測にもとづく基準値と、日付から計算した値です。</p>'}
      <div class="stat"><b>太陽からの距離（計算）</b>${rSun.toFixed(2)} AU（光で ${(rSun * LIGHT_MIN_PER_AU).toFixed(1)} 分）</div>
      ${id === "earth" ? "" : `<div class="stat"><b>地球からの距離（計算）</b>${dE.toFixed(2)} AU（電波の片道 ${(dE * LIGHT_MIN_PER_AU).toFixed(1)} 分）</div>`}
      ${extra}
      <table>
        <tr><th>大気</th><td>${pl.atm}</td></tr>
        <tr><th>気温</th><td>${pl.temp}</td></tr>
        <tr><th>気圧</th><td>${pl.pressure}</td></tr>
        <tr><th>風</th><td>${pl.wind}</td></tr>
        <tr><th>1日</th><td>${pl.day}</td></tr>
      </table>
      <ul>${pl.notes.map((n) => `<li>${n}</li>`).join("")}</ul>
      ${eventsFor(id)}
      ${id === "earth" ? '<button id="toEarth" class="primary">地球の観測（火災・洪水・猛暑・台風）へ</button>' : ""}`;
    $("#toEarth")?.addEventListener("click", onEarth);
    if (id === "earth") syncEarth();
  }

  const fmtT = (n) => (n <= -100 || n >= 100 ? Math.round(n) : n) + "°C";
  function eventsFor(id) {
    const ev = EVENTS.filter((e) => e.p === id).sort((a, b) => a.y - b.y);
    return ev.length ? `<p class="hint">記録・出来事</p><ul class="ev">${ev.map((e) => `<li><b>${e.y}</b> ${e.t}</li>`).join("")}</ul>` : "";
  }

  function renderSummary(el) {
    const maxWind = Math.max(...Object.values(NUMS).map((n) => n.wind));
    const rows = PLANETS.map((p) => {
      const n = NUMS[p.id];
      const temp = n.min === n.max ? fmtT(n.min) : `${fmtT(n.min)}〜${fmtT(n.max)}`;
      const bar = n.bar >= 10 ? n.bar.toFixed(0) : n.bar >= 1 ? n.bar.toFixed(0) : n.bar;
      return `<tr><th><i class="pdot" style="background:${p.color}"></i>${p.name}</th><td>${temp}</td><td>${bar}</td>
        <td><span class="wbar"><b style="width:${(n.wind / maxWind) * 100}%"></b></span>${n.wind}</td></tr>`;
    }).join("");
    const rec = RECORDS.map(([i, k, v, d]) => `<li><span>${i}</span><div><b>${k}：${v}</b><small>${d}</small></div></li>`).join("");
    const ev = [...EVENTS].sort((a, b) => a.y - b.y).map((e) => {
      const name = e.p === "sun" ? "太陽" : PLANETS.find((p) => p.id === e.p).name;
      return `<li><b>${e.y}</b><span class="tagp">${name}</span>${e.t}</li>`;
    }).join("");
    el.innerHTML = `
      <h2>📊 太陽系の天気まとめ</h2>
      <p class="hint">地球を除き、リアルタイム観測は無く、文献にもとづく代表値です（ガス惑星は気圧1bar面の値）。地球と太陽はライブ観測あり。</p>
      <h3>惑星の比較</h3>
      <table class="cmp"><tr><th></th><td><b>気温</b></td><td><b>気圧(bar)</b></td><td><b>最大風速(m/s)</b></td></tr>${rows}</table>
      <h3>太陽系の記録</h3>
      <ul class="rec">${rec}</ul>
      <h3>気象イベント年表</h3>
      <ul class="ev">${ev}</ul>
      <p class="hint">数値は公表されている代表的な値の要約です。引用前に原典で確認してください。</p>`;
  }

  function earthLive() {
    const live = getEarthLive?.();
    if (!live) return '<div class="stat"><b>地球のリアルタイム観測</b>読み込み中…</div>';
    const ty = live.typhoons.map((t) => `<li>🌀 <b>台風${t.number}号 ${t.name}</b>（${t.intensity}）${t.location || ""}／${t.course || ""}へ${t.speed || "-"}km/h／${t.pressure || "-"}hPa／最大風速${t.wind || "-"}m/s</li>`).join("");
    const top = live.top.map((h) => `<li>${h.icon} ${h.label}: <b>${h.name}</b> ${h.score.toFixed(0)}（${h.level}）</li>`).join("");
    return `<div class="stat live"><b>いまの地球（${live.real ? "実データ" : "サンプル"}）</b>
      <ul>${ty || "<li>現在、発生中の台風はありません</li>"}${top}</ul></div>`;
  }

  function syncEarth() {
    if (!solar) return;
    const live = getEarthLive?.();
    if (!live) return;
    solar.setEarthMarkers([
      ...live.typhoons.map((t) => ({ lat: t.pts[0].lat, lon: t.pts[0].lon, emoji: "🌀" })),
      ...live.top.filter((h) => h.score >= 25).map((h) => ({ lat: h.lat, lon: h.lon, color: h.color })),
    ]);
    const f = live.typhoons[0]?.pts[0] || live.top[0];
    if (f && current === "earth") solar.focusEarth(f.lat, f.lon);
  }

  async function renderSun(el, date) {
    el.innerHTML = `<h2>太陽の宇宙天気（NOAA・ほぼリアルタイム）</h2><p class="hint">読み込み中…</p>`;
    try { sw ||= await loadSpaceWeather(); } catch { sw = {}; }
    if (current !== "sun") return;
    const speed = sw.wind?.speed;
    const arrive = speed
      ? PLANETS.map((p) => {
          const r = Math.hypot(...["x", "y", "z"].map((k) => position(p.id, date)[k]));
          return `<tr><th>${p.name}</th><td>約 ${((r * AU_KM) / speed / 86400).toFixed(1)} 日</td></tr>`;
        }).join("")
      : "";
    el.innerHTML = `
      <h2>太陽の宇宙天気</h2>
      <p class="hint">NOAA 宇宙天気予報センターの実データ。惑星の天気を左右する太陽活動です。</p>
      ${sw.xray ? `<div class="stat"><b>太陽フレア（X線）</b>現在 ${flareClass(sw.xray)} クラス<span class="hint">（A<B<C<M<X の順に強い）</span></div>` : ""}
      ${speed ? `<div class="stat"><b>太陽風（地球の手前）</b>速度 ${speed.toFixed(0)} km/s ・ 密度 ${sw.wind.density?.toFixed(1) ?? "-"} 個/cm³<span class="hint"> 平常は約 400 km/s</span></div>` : ""}
      ${sw.kp != null ? `<div class="stat"><b>地磁気（Kp指数）</b>${sw.kp.toFixed(1)} — ${gScale(sw.kp)}${sw.kp >= 5 ? "（オーロラが低緯度でも見える可能性）" : ""}</div>` : ""}
      ${!sw.xray && !speed && sw.kp == null ? '<p class="hint">宇宙天気データを取得できませんでした。</p>' : ""}
      ${arrive ? `<p class="hint">いまの太陽風が各惑星の軌道に届くまでの目安（現在位置・一定速度で計算）</p><table>${arrive}</table>` : ""}`;
  }

  return {
    show() {
      host.hidden = false;
      if (!solar) {
        solar = createSolar(host, { onSelect: panel });
        $("#solarDay").addEventListener("input", (e) => { solar.setDayOffset(+e.target.value); dayLabel(); if (current) panel(current); });
        $("#solarNow").addEventListener("click", () => { $("#solarDay").value = 0; solar.setDayOffset(0); dayLabel(); if (current) panel(current); });
        dayLabel();
        solar.overview();
        panel("summary");
      }
      solar.start();
    },
    hide() { host.hidden = true; solar?.stop(); },
    refreshEarth() { if (solar) { syncEarth(); if (current === "earth") panel("earth"); } },
  };
}
