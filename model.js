// Explainable local risk model. Runs identically in the browser and on the server.
// h = { time[], temp[], rh[], wind[], dir[], precip[] } hourly arrays (°C, %, km/h, deg, mm)

const sig = (z) => 1 / (1 + Math.exp(-z));
const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const sum = (arr, from, to) => {
  let s = 0;
  for (let i = Math.max(0, from); i <= to; i++) s += arr[i] || 0;
  return s;
};

export const LEVELS = [
  { max: 25, key: 0, label: "低", color: "#3ddc97" },
  { max: 50, key: 1, label: "注意", color: "#f4d35e" },
  { max: 75, key: 2, label: "警戒", color: "#ff9f1c" },
  { max: 101, key: 3, label: "危険", color: "#ff3b3b" },
];
export const level = (score) => LEVELS.find((l) => score < l.max);

function fire(h, t) {
  const rh = h.rh[t];
  const avgRh = sum(h.rh, t - 47, t) / Math.min(48, t + 1);
  const rain48 = sum(h.precip, t - 47, t);
  const terms = [
    ["乾燥（湿度）", 3.2 * clamp((70 - rh) / 55), `湿度 ${rh.toFixed(0)}%`],
    ["高温", 1.4 * clamp((h.temp[t] - 8) / 27), `気温 ${h.temp[t].toFixed(1)}°C`],
    ["強風", 2.4 * clamp(h.wind[t] / 30), `風速 ${h.wind[t].toFixed(0)} km/h`],
    ["燃料の乾燥（48h平均湿度）", 1.6 * clamp((80 - avgRh) / 50), `平均湿度 ${avgRh.toFixed(0)}%`],
    ["直近の降雨（抑制）", -2.5 * clamp(rain48 / 10), `48h雨量 ${rain48.toFixed(1)}mm`],
  ];
  const z = -4.2 + terms.reduce((a, x) => a + x[1], 0);
  return pack(sig(z), terms);
}

function flood(h, t) {
  const r24 = sum(h.precip, t - 23, t);
  let max3 = 0;
  for (let i = t - 23; i <= t; i++) max3 = Math.max(max3, sum(h.precip, i - 2, i));
  const r72 = sum(h.precip, t - 95, t - 24);
  const terms = [
    ["24時間雨量", 0.045 * r24, `${r24.toFixed(1)}mm`],
    ["短時間の強雨（3h最大）", 0.12 * max3, `${max3.toFixed(1)}mm`],
    ["先行降雨（土壌の湿り）", 0.012 * r72, `${r72.toFixed(1)}mm`],
  ];
  const z = -4 + terms.reduce((a, x) => a + x[1], 0);
  return pack(sig(z), terms);
}

function heat(h, t) {
  const T = h.temp[t];
  const e = (h.rh[t] / 100) * 6.105 * Math.exp((17.27 * T) / (237.7 + T));
  const wbgt = 0.567 * T + 0.393 * e + 3.94;
  const score = clamp((wbgt - 21) / 12) * 100;
  // 寄与は WBGT 式の各項から実際に計算する（合計1）
  const termT = 0.567 * T, termE = 0.393 * e, base = 3.94;
  const tot = Math.abs(termT) + Math.abs(termE) + base;
  return {
    score,
    factors: [
      { name: "気温の寄与", value: `${T.toFixed(1)}°C`, share: termT / tot },
      { name: "湿り（水蒸気圧）の寄与", value: `${e.toFixed(1)} hPa`, share: termE / tot },
      { name: "暑さ指数(WBGT近似)", value: `${wbgt.toFixed(1)}`, share: base / tot },
    ],
  };
}

function pack(p, terms) {
  const pos = terms.reduce((a, x) => a + Math.max(0, x[1]), 0) || 1;
  return {
    score: p * 100,
    factors: terms.map(([name, c, value]) => ({ name, value, share: c / pos })),
  };
}

export function assessHour(h, t) {
  return { fire: fire(h, t), flood: flood(h, t), heat: heat(h, t) };
}

export function assessSeries(h, start, n = 72) {
  const out = { fire: [], flood: [], heat: [] };
  for (let i = 0; i < n; i++) {
    const a = assessHour(h, start + i);
    for (const k of Object.keys(out)) out[k].push(a[k].score);
  }
  return out;
}

export const HAZARDS = {
  fire: { label: "山火事", icon: "🔥" },
  flood: { label: "洪水・土砂", icon: "🌊" },
  heat: { label: "猛暑", icon: "🌡" },
  typhoon: { label: "台風", icon: "🌀" },
};

export function distKm(lat1, lon1, lat2, lon2) {
  const r = Math.PI / 180, dl = (lat2 - lat1) * r, dn = (lon2 - lon1) * r;
  const a = Math.sin(dl / 2) ** 2 + Math.cos(lat1 * r) * Math.cos(lat2 * r) * Math.sin(dn / 2) ** 2;
  return 12742 * Math.asin(Math.sqrt(a));
}

// 台風の影響度。気象庁が出している暴風域(25m/s)・強風域(15m/s)の半径の中だけで評価する。
// 半径が公表されていない場合に独自の半径を仮定すると、気象庁の警戒円の外を塗ることになるため、しない。
export function typhoonScore(d, storm, gale) {
  if (!storm && !gale) return 0;
  const outer = Math.max(gale, storm);
  if (storm && d <= storm) return 80 + 20 * (1 - d / storm);
  if (d <= outer) return 50 + 30 * (1 - Math.max(0, d - storm) / Math.max(1, outer - storm));
  return 0;
}

export function compass(deg) {
  return ["北", "北東", "東", "南東", "南", "南西", "西", "北西"][Math.round(deg / 45) % 8];
}
