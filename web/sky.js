// "AstroMatch" + "Orbital Cam"-style tonight-sky coordinator.
// Real data: Open-Meteo (clouds), CelesTrak TLEs (satellites), astronomy-engine (Sun/Moon/planets), NASA GIBS (imagery).
import { LOCATIONS } from "./locations.js";
import { distKm } from "./model.js";
import { CONSTELLATIONS, ASTERISMS, NAMED } from "./constellations.js";

const $ = (s) => document.querySelector(s);
const D = Math.PI / 180;
const CELESTRAK = "https://celestrak.org/NORAD/elements/gp.php?FORMAT=tle&GROUP=";
const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));

const SHOWERS = [
  ["しぶんぎ座流星群", 1, 3, 80, "1月上旬。極大の時間が短い"], ["こと座流星群", 4, 22, 18, "明るい流星が多い"],
  ["みずがめ座η流星群", 5, 6, 50, "ハレー彗星の塵。明け方に有利"], ["みずがめ座δ南流星群", 7, 30, 25, "夏の明け方"],
  ["ペルセウス座流星群", 8, 12, 100, "三大流星群の一つ。夏休みの観望向き"], ["りゅう座流星群", 10, 8, 10, "出現数は年によって大きく変わる"],
  ["オリオン座流星群", 10, 21, 20, "ハレー彗星の塵。速い流星が多い"], ["おうし座南流星群", 11, 5, 5, "火球が多め"],
  ["しし座流星群", 11, 17, 15, "33年周期で大出現することがある"], ["ふたご座流星群", 12, 14, 150, "三大流星群で最も安定して多い"],
  ["こぐま座流星群", 12, 22, 10, "北天の流星群"],
];

function loadScript(src) {
  return new Promise((res, rej) => {
    if ([...document.scripts].some((s) => s.src.endsWith(src))) return res();
    const s = document.createElement("script"); s.src = src; s.onload = res; s.onerror = rej; document.head.appendChild(s);
  });
}

function parseTle(text) {
  const L = text.split(/\r?\n/).map((x) => x.trim()).filter(Boolean), out = [];
  for (let i = 0; i + 2 < L.length; i += 3) {
    try { out.push({ name: L[i], rec: satellite.twoline2satrec(L[i + 1], L[i + 2]) }); } catch { /* skip bad TLE */ }
  }
  return out;
}

const cardinal = (az) => ["北", "北北東", "北東", "東北東", "東", "東南東", "南東", "南南東", "南", "南南西", "南西", "西南西", "西", "西北西", "北西", "北北西"][Math.round(az / 22.5) % 16];

async function weather(points, tzHint) {
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${points.map((p) => p.lat).join(",")}&longitude=${points.map((p) => p.lon).join(",")}&hourly=cloud_cover,visibility&forecast_days=3&timezone=auto`;
  const r = await fetch(url, { signal: AbortSignal.timeout(15000) });
  if (!r.ok) throw new Error("weather");
  const j = await r.json();
  return (Array.isArray(j) ? j : [j]).map((x) => ({
    tz: x.timezone || tzHint,
    t: x.hourly.time.map((s) => Date.parse(s + "Z") - x.utc_offset_seconds * 1000),
    cloud: x.hourly.cloud_cover, vis: x.hourly.visibility,
  }));
}
const cloudAt = (w, ms) => {
  const i = w.t.findIndex((t, k) => ms >= t && ms < (w.t[k + 1] ?? t + 3600e3));
  return i < 0 ? null : w.cloud[i];
};
const cloudMean = (w, a, b) => {
  let s = 0, n = 0;
  for (let t = a; t < b; t += 3600e3) { const c = cloudAt(w, t); if (c != null) { s += c; n++; } }
  return n ? s / n : null;
};

export function initSky() {
  const host = $("#sky"), canvas = $("#skyCanvas"), info = $("#skyInfo");
  const st = { loc: { name: "東京", lat: 35.68, lon: 139.76 }, tz: "Asia/Tokyo", sats: [], t: Date.now(), t0: Date.now(), win: null, wx: null, passes: [], selPass: null, running: false, best: null, nearby: null, ready: false, token: 0, showStars: true };
  let raf = 0;
  const fmt = (ms, o = { hour: "2-digit", minute: "2-digit" }) => new Date(ms).toLocaleString("ja-JP", { timeZone: st.tz, ...o });

  // ---------- astronomy helpers ----------
  const obs = () => new Astronomy.Observer(st.loc.lat, st.loc.lon, 0);
  const altaz = (body, ms) => {
    const o = obs(), d = new Date(ms), eq = Astronomy.Equator(body, d, o, true, true), h = Astronomy.Horizon(d, o, eq.ra, eq.dec, "normal");
    return { alt: h.altitude, az: h.azimuth };
  };
  const sunAlt = (ms) => altaz("Sun", ms).alt;
  const moonInfo = (ms) => { const p = Astronomy.MoonPhase(new Date(ms)), ill = Astronomy.Illumination("Moon", new Date(ms)); return { phase: p, illum: ill.phase_fraction }; };
  const moonName = (p) => (p < 22 || p >= 338 ? "新月" : p < 68 ? "三日月" : p < 112 ? "上弦の月" : p < 158 ? "十三夜前後（満ちていく）" : p < 202 ? "満月" : p < 248 ? "十八夜前後（欠けていく）" : p < 292 ? "下弦の月" : "有明の月");

  function nightWindow(now) {
    const o = obs(), d = new Date(now);
    const rise = Astronomy.SearchRiseSet("Sun", o, +1, d, 2), set = Astronomy.SearchRiseSet("Sun", o, -1, d, 2);
    if (rise && set) {
      const r = rise.date.getTime(), s = set.date.getTime();
      return r < s ? { start: now, end: r, dark: true, sunset: null, sunrise: r } : { start: s, end: r, dark: false, sunset: s, sunrise: r };
    }
    return { start: now + 3600e3, end: now + 9 * 3600e3, dark: false };
  }

  function hourScores(win) {
    const rows = [];
    for (let t = Math.ceil(win.start / 3600e3) * 3600e3; t < win.end; t += 3600e3) {
      const cloud = cloudAt(st.wx, t) ?? 50, sa = sunAlt(t), moon = altaz("Moon", t), mi = moonInfo(t);
      const dark = clamp((-sa - 6) / 12);
      const moonPen = mi.illum * clamp(moon.alt / 30) * 0.5;
      const score = 100 * Math.pow(1 - cloud / 100, 1.2) * (1 - moonPen) * dark;
      rows.push({ t, cloud, sa, moonAlt: moon.alt, illum: mi.illum, score, dark });
    }
    return rows;
  }

  // ---------- satellites ----------
  const gd = () => ({ latitude: st.loc.lat * D, longitude: st.loc.lon * D, height: 0 });
  function satLook(s, ms, sunVec) {
    const d = new Date(ms), pv = satellite.propagate(s.rec, d);
    if (!pv.position) return null;
    const gmst = satellite.gstime(d), la = satellite.ecfToLookAngles(gd(), satellite.eciToEcf(pv.position, gmst));
    let lit = true;
    if (sunVec) {
      const r = pv.position, dot = r.x * sunVec.x + r.y * sunVec.y + r.z * sunVec.z;
      const px = r.x - dot * sunVec.x, py = r.y - dot * sunVec.y, pz = r.z - dot * sunVec.z;
      lit = dot > 0 || Math.hypot(px, py, pz) > 6371;
    }
    return { az: la.azimuth / D, el: la.elevation / D, lit, range: Math.sqrt(la.rangeSquared) };
  }
  const sunVecAt = (ms) => { const v = Astronomy.GeoVector("Sun", new Date(ms), true), m = Math.hypot(v.x, v.y, v.z); return { x: v.x / m, y: v.y / m, z: v.z / m }; };

  async function computePasses(win, token) {
    const step = 20e3, a = Math.max(win.start, st.t0), b = Math.min(win.end, a + 14 * 3600e3);
    const n = Math.ceil((b - a) / step), times = Array.from({ length: n }, (_, i) => a + i * step);
    const sv = times.map(sunVecAt), sa = times.map((t, i) => (i % 3 === 0 ? sunAlt(t) : null));
    for (let i = 0; i < n; i++) if (sa[i] == null) sa[i] = sa[i - (i % 3)];
    const passes = [];
    for (let k = 0; k < st.sats.length; k++) {
      if (token !== st.token) return null;
      const s = st.sats[k]; let cur = null;
      for (let i = 0; i < n; i++) {
        const l = satLook(s, times[i], sv[i]);
        const vis = l && l.el > 10 && l.lit && sa[i] < -4;
        if (vis) {
          if (!cur) cur = { name: s.name, start: times[i], azS: l.az, maxEl: l.el, azMax: l.az, tMax: times[i] };
          if (l.el > cur.maxEl) { cur.maxEl = l.el; cur.azMax = l.az; cur.tMax = times[i]; }
          cur.end = times[i]; cur.azE = l.az;
        } else if (cur) { if (cur.end - cur.start >= 40e3 && cur.maxEl >= 15) passes.push(cur); cur = null; }
      }
      if (cur && cur.end - cur.start >= 40e3 && cur.maxEl >= 15) passes.push(cur);
      if (k % 15 === 14) await new Promise((r) => setTimeout(r, 0));
    }
    return passes;
  }

  // ---------- data flow ----------
  async function refresh() {
    const token = ++st.token;
    info.querySelector("#skyResult").innerHTML = '<p class="hint">今夜の空を計算中…（天気・軌道データを取得）</p>';
    try {
      if (!st.ready) {
        await Promise.all([loadScript("vendor/astro/astronomy.browser.min.js"), loadScript("vendor/astro/satellite.min.js")]);
        const [a, b] = await Promise.allSettled([fetch(CELESTRAK + "stations").then((r) => r.text()), fetch(CELESTRAK + "visual").then((r) => r.text())]);
        st.sats = [...(a.status === "fulfilled" ? parseTle(a.value) : []), ...(b.status === "fulfilled" ? parseTle(b.value) : [])];
        const seen = new Set(); st.sats = st.sats.filter((s) => !seen.has(s.name) && seen.add(s.name));
        st.ready = true;
      }
      st.t0 = st.t = Date.now();
      const step = 0.15, pts = [st.loc, { lat: st.loc.lat + step, lon: st.loc.lon }, { lat: st.loc.lat - step, lon: st.loc.lon }, { lat: st.loc.lat, lon: st.loc.lon + step }, { lat: st.loc.lat, lon: st.loc.lon - step }];
      const ws = await weather(pts, st.tz).catch(() => null);
      if (token !== st.token) return;
      st.wx = ws?.[0] || { tz: st.tz, t: [], cloud: [], vis: [] };
      if (ws) st.tz = ws[0].tz;
      st.win = nightWindow(st.t0);
      st.hours = ws ? hourScores(st.win) : [];
      st.moonNow = moonInfo(st.t0);
      st.nearby = ws ? ["北", "南", "東", "西"].map((n, i) => ({ dir: n, cloud: cloudMean(ws[i + 1], st.win.start, st.win.end) })) : null;
      st.here = ws ? cloudMean(ws[0], st.win.start, st.win.end) : null;
      st.passes = []; renderInfo(); draw();
      st.passes = (await computePasses(st.win, token)) || [];
      if (token !== st.token) return;
      renderInfo(); draw();
      if (!st.best) loadBest().then(() => { if (token === st.token) renderInfo(); });
    } catch (e) {
      console.error(e);
      info.querySelector("#skyResult").innerHTML = '<p class="hint">データを取得できませんでした（通信を確認してください）。</p>';
    }
  }

  async function loadBest() {
    try {
      const chunks = [];
      for (let i = 0; i < LOCATIONS.length; i += 40) chunks.push(await weather(LOCATIONS.slice(i, i + 40), st.tz));
      const ws = chunks.flat(), a = st.win.start, b = st.win.end;
      st.best = LOCATIONS.map((l, i) => ({ ...l, cloud: cloudMean(ws[i], a, b) })).filter((x) => x.cloud != null).sort((x, y) => x.cloud - y.cloud);
    } catch { st.best = []; }
  }

  // ---------- panel ----------
  function nextShower() {
    const now = new Date(st.t0), y = now.getFullYear();
    const list = SHOWERS.flatMap(([n, m, d, zhr, note]) => [y, y + 1].map((yy) => ({ n, zhr, note, date: new Date(yy, m - 1, d, 23) })))
      .filter((s) => s.date > now - 86400e3).sort((a, b) => a.date - b.date)[0];
    const days = Math.round((list.date - now) / 86400e3), mi = moonInfo(list.date.getTime());
    return { ...list, days, illum: mi.illum };
  }

  function renderInfo() {
    const r = info.querySelector("#skyResult");
    if (!st.win) return;
    const hrs = st.hours || [], bestH = hrs.slice().sort((a, b) => b.score - a.score)[0];
    const sc = bestH ? bestH.score : null;
    const grade = sc == null ? "-" : sc >= 70 ? "とても良い" : sc >= 45 ? "まずまず" : sc >= 20 ? "厳しい" : "観測に不向き";
    const mo = st.moonNow, sh = nextShower();
    const nb = st.nearby?.filter((x) => x.cloud != null).sort((a, b) => a.cloud - b.cloud)[0];
    const advice = nb && st.here != null && st.here - nb.cloud >= 15
      ? `<p class="stat live"><b>ピンポイント提案</b>ここより<b>${nb.dir}へ約17km</b>移動すると、今夜の平均雲量が ${st.here.toFixed(0)}% → ${nb.cloud.toFixed(0)}% に下がる予報です。</p>` : "";
    const bright = (p) => (/ISS|ZARYA|CSS|TIANHE|TIANGONG|HST/.test(p.name) ? 1000 : 0) + p.maxEl;
    const top = (st.passes || []).slice().sort((a, b) => bright(b) - bright(a)).slice(0, 6).sort((a, b) => a.start - b.start);
    r.innerHTML = `
      <div class="score" style="--sc:${sc ?? 0}"><b>${sc == null ? "-" : sc.toFixed(0)}</b><span>今夜の観測スコア<br><strong>${grade}</strong>${bestH ? `／ベストは ${fmt(bestH.t)} 頃` : ""}</span></div>
      <div class="hourbars">${hrs.map((h) => `<i title="${fmt(h.t)} 雲量${h.cloud}%" style="height:${Math.max(4, h.score * 0.5)}px;background:${h.score >= 70 ? "#3ddc97" : h.score >= 45 ? "#f4d35e" : h.score >= 20 ? "#ff9f1c" : "#5b6480"}"></i>`).join("")}</div>
      <p class="hint">棒＝夜の各時間のスコア（${hrs.length ? fmt(hrs[0].t) + "〜" + fmt(hrs.at(-1).t + 3600e3) : "夜間なし"}）。雲・月明かり・暗さから算出。光害（街明かり）は含みません。</p>
      ${advice}
      <table>
        <tr><th>日没→日の出</th><td>${st.win.dark ? "いま夜" : fmt(st.win.start)} → ${fmt(st.win.end)}</td></tr>
        <tr><th>月</th><td>${moonName(mo.phase)}（照らされている割合 ${(mo.illum * 100).toFixed(0)}%）</td></tr>
        <tr><th>雲量(平均)</th><td>${st.here != null ? st.here.toFixed(0) + "%" : "-"}</td></tr>
      </table>
      <h3>今夜の星座</h3>
      <p class="hint">空の図に星座線と1等星の名前を重ねています（夜のあいだだけ表示）。</p>
      <div class="chips" id="starChips"><button data-star="${st.showStars ? 1 : 0}" class="${st.showStars ? "on" : ""}">${st.showStars ? "星座を表示中" : "星座は非表示"}</button></div>
      <ol class="rank">${visibleConstellations().map((c) => `<li><span>${c.name}</span><em>${c.alt.toFixed(0)}°</em><small>${c.dir}</small></li>`).join("") || '<li><span class="hint">いまは夜ではありません</span></li>'}</ol>
      <h3>今夜見える衛星の通過${st.sats.length ? "" : "（軌道データ取得失敗）"}</h3>
      ${top.length ? `<ul class="ev passes">${top.map((p, i) => `<li data-t="${p.tMax}" class="${st.selPass === p ? "sel" : ""}"><b>${fmt(p.start)}</b> ${p.name.replace(/ \(.*/, "")}<br><small>${cardinal(p.azS)}→${cardinal(p.azMax)}（最高 ${p.maxEl.toFixed(0)}°）→${cardinal(p.azE)} ／ ${Math.round((p.end - p.start) / 1000)}秒</small></li>`).join("")}</ul>
        <p class="hint">クリックで空の図が通過時刻に移動します。夜で、衛星が太陽光を浴び、仰角10°超の区間のみ。</p>`
        : '<p class="hint">今夜は条件を満たす通過が見つかりませんでした（または計算中）。</p>'}
      <h3>次の流星群</h3>
      <div class="stat"><b>${sh.n}</b>約${sh.days}日後（極大 ${sh.date.getMonth() + 1}/${sh.date.getDate()}頃・1時間あたり最大約${sh.zhr}個）<br><small>${sh.note}。その日の月は${(sh.illum * 100).toFixed(0)}%${sh.illum > 0.6 ? "（月明かりが強く不利）" : sh.illum < 0.3 ? "（暗い空で有利）" : ""}</small></div>
      <h3>今夜、雲が少ない地点（全国）</h3>
      ${st.best?.length ? `<ol class="rank">${st.best.slice(0, 5).map((b) => `<li><span>${b.name}</span><em>雲量 ${b.cloud.toFixed(0)}%</em><small>${distKm(st.loc.lat, st.loc.lon, b.lat, b.lon).toFixed(0)}km</small></li>`).join("")}</ol>` : '<p class="hint">全国の予報を取得中…</p>'}
      <h3>この地点の最新衛星画像</h3>${tileImg()}
      <p class="hint">データ: Open-Meteo（雲量）、CelesTrak（衛星軌道）、astronomy-engine（太陽・月・惑星）、NASA GIBS。衛星の明るさ（等級）は機体・角度で大きく変わります。</p>`;
    r.querySelector("#starChips button")?.addEventListener("click", () => { st.showStars = !st.showStars; renderInfo(); draw(); });
    r.querySelectorAll(".passes li").forEach((li) => li.addEventListener("click", () => {
      st.selPass = st.passes.find((p) => String(p.tMax) === li.dataset.t); setTime(+li.dataset.t); renderInfo();
    }));
  }

  function visibleConstellations() {
    if (!st.win || !st.ready) return [];
    const ms = st.hours?.find((h) => h.score > 0)?.t || st.win.start;
    if (sunAlt(ms) > -6) return [];
    const out = [];
    for (const c of CONSTELLATIONS) {
      let best = null;
      for (const s2 of c.stars) {
        const p = raDecToAltAz(s2[0], s2[1], ms);
        if (!best || p.alt > best.alt) best = p;
      }
      if (best && best.alt > 15) out.push({ name: c.name, alt: best.alt, dir: cardinal(best.az) });
    }
    return out.sort((a, b) => b.alt - a.alt).slice(0, 6);
  }

  function tileImg() {
    const z = 6, n = 2 ** z, x = Math.floor(((st.loc.lon + 180) / 360) * n);
    const lat = st.loc.lat * D, y = Math.floor(((1 - Math.log(Math.tan(lat) + 1 / Math.cos(lat)) / Math.PI) / 2) * n);
    const day = new Date(Date.now() - 36 * 3600e3).toISOString().slice(0, 10);
    const src = `https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/VIIRS_SNPP_CorrectedReflectance_TrueColor/default/${day}/GoogleMapsCompatible_Level9/${z}/${y}/${x}.jpg`;
    return `<figure class="tile"><img src="${src}" alt="衛星画像" loading="lazy"><figcaption>VIIRS衛星が撮影した直近の画像（${day}）。頭上を通る観測衛星が実際に見ている地表。</figcaption></figure>`;
  }

  // ---------- sky chart ----------
  function setTime(ms) { st.t = ms; $("#skyTime").value = Math.round((ms - st.t0) / 300e3); draw(); }

  function skyColor(alt) {
    const k = clamp((alt + 18) / 24);
    const mix = (a, b) => a.map((v, i) => Math.round(v + (b[i] - v) * k));
    return `rgb(${mix([3, 6, 18], [86, 150, 220]).join(",")})`;
  }

  // 赤経赤緯 → 地平座標（時角から計算）。astronomy-engine の Horizon を使う。
  function raDecToAltAz(raH, dec, ms) {
    const o = obs(), d = new Date(ms);
    const h = Astronomy.Horizon(d, o, raH, dec, "normal");
    return { alt: h.altitude, az: h.azimuth };
  }

  function drawConstellations(g, pt, R) {
    const ms = st.t;
    const proj = (raH, dec) => {
      const p = raDecToAltAz(raH, dec, ms);
      return p.alt < -1 ? null : { ...pt(p.az, Math.max(p.alt, 0)), alt: p.alt };
    };
    // 星座線
    g.lineWidth = 1.2;
    for (const c of CONSTELLATIONS) {
      const pos = c.stars.map((st2) => proj(st2[0], st2[1]));
      let visible = 0;
      g.strokeStyle = "rgba(140,175,255,.45)";
      g.beginPath();
      for (const [i, j] of c.lines) {
        const a = pos[i], b = pos[j];
        if (!a || !b) continue;
        g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]); visible++;
      }
      g.stroke();
      // 星
      c.stars.forEach((st2, i) => {
        const p = pos[i]; if (!p) return;
        const r = Math.max(1.1, 3.4 - st2[2] * 0.55);
        g.fillStyle = "rgba(255,255,255,.92)";
        g.beginPath(); g.arc(p[0], p[1], r, 0, 7); g.fill();
      });
      // 星座名（見えている線が半分以上あるときだけ）
      if (visible >= Math.max(1, Math.floor(c.lines.length / 2))) {
        const vis = pos.filter(Boolean);
        if (vis.length) {
          const cx2 = vis.reduce((a, p) => a + p[0], 0) / vis.length;
          const cy2 = vis.reduce((a, p) => a + p[1], 0) / vis.length;
          g.fillStyle = "rgba(150,180,255,.65)"; g.font = "11px system-ui";
          g.textAlign = "center"; g.textBaseline = "middle";
          g.fillText(c.name, cx2, cy2);
        }
      }
    }
    // アステリズム（大三角）
    g.setLineDash([3, 4]); g.lineWidth = 1; g.strokeStyle = "rgba(255,214,10,.45)";
    for (const a of ASTERISMS) {
      const pos = a.pts.map(([ra, dec]) => proj(ra, dec));
      if (pos.some((p) => !p)) continue;
      g.beginPath(); g.moveTo(pos[0][0], pos[0][1]);
      for (let i = 1; i < pos.length; i++) g.lineTo(pos[i][0], pos[i][1]);
      g.closePath(); g.stroke();
      const cx2 = pos.reduce((s2, p) => s2 + p[0], 0) / pos.length;
      const cy2 = pos.reduce((s2, p) => s2 + p[1], 0) / pos.length;
      g.fillStyle = "rgba(255,214,10,.75)"; g.font = "12px system-ui"; g.textAlign = "center";
      g.fillText(a.name, cx2, cy2);
    }
    g.setLineDash([]);
    // 1等星の名前
    g.font = "10px system-ui"; g.textAlign = "left"; g.textBaseline = "middle";
    for (const [ra, dec, name] of NAMED) {
      const p = proj(ra, dec); if (!p || p.alt < 3) continue;
      g.fillStyle = "rgba(255,255,255,.95)";
      g.beginPath(); g.arc(p[0], p[1], 2.4, 0, 7); g.fill();
      g.fillStyle = "rgba(235,235,245,.72)";
      g.fillText(name, p[0] + 5, p[1]);
    }
  }

  function draw() {
    if (!st.ready || !host.clientWidth) return;
    const dpr = Math.min(devicePixelRatio, 2), W = host.clientWidth, H = host.clientHeight - 70;
    canvas.width = W * dpr; canvas.height = H * dpr; canvas.style.width = W + "px"; canvas.style.height = H + "px";
    const g = canvas.getContext("2d"); g.setTransform(dpr, 0, 0, dpr, 0, 0);
    const R = Math.min(W, H) / 2 - 34, cx = W / 2, cy = H / 2;
    const sa = sunAlt(st.t);
    g.clearRect(0, 0, W, H);
    g.fillStyle = skyColor(sa); g.beginPath(); g.arc(cx, cy, R, 0, 7); g.fill();
    g.strokeStyle = "rgba(255,255,255,.25)"; g.lineWidth = 1;
    for (const a of [0, 30, 60]) { g.beginPath(); g.arc(cx, cy, R * (1 - a / 90), 0, 7); g.stroke(); }
    // sky view (looking up): North up, East on the left
    const pt = (az, alt) => { const r = R * (1 - alt / 90), a = az * D; return [cx - r * Math.sin(a), cy - r * Math.cos(a)]; };
    g.fillStyle = "rgba(255,255,255,.7)"; g.font = "13px system-ui"; g.textAlign = "center"; g.textBaseline = "middle";
    [["北", 0], ["東", 90], ["南", 180], ["西", 270]].forEach(([t, az]) => { const [x, y] = pt(az, -9); g.fillText(t, x, y); });
    g.font = "10px system-ui"; g.fillText("30°", cx + 4, cy - R * (2 / 3) - 6); g.fillText("60°", cx + 4, cy - R * (1 / 3) - 6);

    if (st.showStars !== false && sa < 0) { try { drawConstellations(g, pt, R); } catch (e) { /* 計算失敗時は星座だけ省略 */ } }

    // selected pass path
    if (st.selPass) {
      const s = st.sats.find((x) => x.name === st.selPass.name);
      if (s) {
        g.strokeStyle = "#5ff2ff"; g.lineWidth = 2; g.setLineDash([4, 4]); g.beginPath();
        let first = true;
        for (let t = st.selPass.start; t <= st.selPass.end; t += 10e3) { const l = satLook(s, t); if (!l) continue; const [x, y] = pt(l.az, l.el); first ? g.moveTo(x, y) : g.lineTo(x, y); first = false; }
        g.stroke(); g.setLineDash([]);
      }
    }
    // bodies
    const body = (b, color, label, size, force) => {
      const p = altaz(b, st.t); if (p.alt < 0 && !force) return;
      const [x, y] = pt(p.az, Math.max(p.alt, 0)); g.fillStyle = color; g.beginPath(); g.arc(x, y, size, 0, 7); g.fill();
      g.fillStyle = "#fff"; g.font = "11px system-ui"; g.textAlign = "left"; g.fillText(label, x + size + 4, y);
    };
    if (sa > -6) body("Sun", "#ffd84d", "太陽", 8);
    const mi = moonInfo(st.t);
    body("Moon", "#e9e9f2", `月 ${(mi.illum * 100).toFixed(0)}%`, 8);
    [["Venus", "#fff2c2", "金星"], ["Mars", "#ff7a5e", "火星"], ["Jupiter", "#ffd9a0", "木星"], ["Saturn", "#e8d59a", "土星"]].forEach(([b, c, l]) => body(b, c, l, 3.5));
    // satellites
    const sv = sunVecAt(st.t), above = [];
    for (const s of st.sats) {
      const l = satLook(s, st.t, sv); if (!l || l.el < 0) continue;
      const seen = l.lit && sa < -4;
      above.push({ s, l, seen });
      const [x, y] = pt(l.az, l.el);
      g.fillStyle = seen ? "#5ff2ff" : "rgba(160,170,200,.55)"; g.beginPath(); g.arc(x, y, seen ? 3.5 : 2, 0, 7); g.fill();
      if (seen || /ISS|CSS|TIANHE|ZARYA/.test(s.name)) { g.fillStyle = seen ? "#bff8ff" : "rgba(200,210,230,.7)"; g.font = "10px system-ui"; g.textAlign = "left"; g.fillText(s.name.replace(/ \(.*/, ""), x + 6, y); }
    }
    $("#skyTimeLabel").textContent = `${fmt(st.t, { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}${st.t === st.t0 || Math.abs(st.t - st.t0) < 150e3 ? "（現在）" : ""}　太陽高度 ${sa.toFixed(0)}° ／ 空にいる衛星 ${above.length}機（見える ${above.filter((a) => a.seen).length}）`;
  }

  // ---------- controls ----------
  const select = $("#skyLoc");
  select.innerHTML = `<option value="tokyo">東京</option>` + LOCATIONS.map((l, i) => `<option value="${i}">${l.name}</option>`).join("");
  select.addEventListener("change", () => {
    const v = select.value;
    st.loc = v === "tokyo" ? { name: "東京", lat: 35.68, lon: 139.76 } : LOCATIONS[+v];
    st.selPass = null; st.best = null; refresh();
  });
  $("#skyGeo").addEventListener("click", () => {
    if (!navigator.geolocation) return alert("この環境では位置情報を使えません");
    navigator.geolocation.getCurrentPosition((p) => { st.loc = { name: "現在地", lat: p.coords.latitude, lon: p.coords.longitude }; st.selPass = null; st.best = null; select.value = "tokyo"; refresh(); },
      () => alert("位置情報を取得できませんでした。地点を選んでください。"));
  });
  $("#skyTime").addEventListener("input", (e) => { st.selPass = null; st.t = st.t0 + e.target.value * 300e3; draw(); });
  let playing = 0;
  $("#skyPlay").addEventListener("click", () => {
    if (playing) { clearInterval(playing); playing = 0; $("#skyPlay").textContent = "▶"; return; }
    $("#skyPlay").textContent = "⏸";
    playing = setInterval(() => { const v = +$("#skyTime").value + 1; if (v > +$("#skyTime").max) { clearInterval(playing); playing = 0; $("#skyPlay").textContent = "▶"; } else setTime(st.t0 + v * 300e3); }, 200);
  });
  new ResizeObserver(draw).observe(host);

  return {
    show() {
      host.hidden = false;
      if (!st.win) refresh();
      else draw();
      clearInterval(raf); raf = setInterval(() => { if (!playing && st.t === st.t0) { st.t0 = st.t = Date.now(); draw(); } }, 15000);
    },
    hide() { host.hidden = true; clearInterval(raf); if (playing) { clearInterval(playing); playing = 0; $("#skyPlay").textContent = "▶"; } },
  };
}
