// Orbital mechanics (JPL approximate Keplerian elements, valid 1800-2050) and planetary weather reference data.

const D = Math.PI / 180;
// [a, da, e, de, I, dI, L, dL, longPeri, dLongPeri, longNode, dLongNode] (per Julian century)
const EL = {
  mercury: [0.38709843, 0, 0.20563661, 0.00002123, 7.00559432, -0.00590158, 252.25166724, 149472.67486623, 77.45771895, 0.15940013, 48.33961819, -0.12214182],
  venus: [0.72332102, -0.00000026, 0.00676399, -0.00005107, 3.39777545, 0.00043494, 181.9797085, 58517.8156026, 131.76755713, 0.05679648, 76.67261496, -0.27274174],
  earth: [1.00000018, -0.00000003, 0.01673163, -0.00003661, -0.00054346, -0.01337178, 100.46691572, 35999.37306329, 102.93005885, 0.3179526, -5.11260389, -0.24123856],
  mars: [1.52371243, 0.00000097, 0.09336511, 0.00009149, 1.85181869, -0.00724757, -4.56813164, 19140.29934243, -23.91744784, 0.45223625, 49.71320984, -0.26852431],
  jupiter: [5.20248019, -0.00002864, 0.0485359, 0.00018026, 1.29861416, -0.00322699, 34.33479152, 3034.90371757, 14.27495244, 0.18199196, 100.29282654, 0.13024619],
  saturn: [9.54149883, -0.00003065, 0.05550825, -0.00032044, 2.49424102, 0.00451969, 50.07571329, 1222.11494724, 92.86136063, 0.54179478, 113.63998702, -0.25015002],
  uranus: [19.18797948, -0.00020455, 0.0468574, -0.0000155, 0.77298127, -0.00180155, 314.20276625, 428.49512595, 172.43404441, 0.09266985, 74.01692503, 0.04240589],
  neptune: [30.06952752, 0.00006447, 0.00895439, 0.00000818, 1.7700552, 0.000224, 304.22289287, 218.46515314, 46.68158724, 0.01009938, 131.78635853, -0.00606302],
};

const mod360 = (x) => ((x % 360) + 360) % 360;
export const julian = (date) => date.getTime() / 86400000 + 2440587.5;

// Heliocentric ecliptic position in AU (x, y in the orbital plane of Earth, z north).
export function position(id, date) {
  const T = (julian(date) - 2451545) / 36525;
  const el = EL[id];
  const a = el[0] + el[1] * T, e = el[2] + el[3] * T, I = (el[4] + el[5] * T) * D;
  const L = el[6] + el[7] * T, w = el[8] + el[9] * T, O = (el[10] + el[11] * T) * D;
  const om = w * D - O;
  const M = mod360(L - w) * D;
  let E = M + e * Math.sin(M);
  for (let i = 0; i < 12; i++) E -= (E - e * Math.sin(E) - M) / (1 - e * Math.cos(E));
  const xp = a * (Math.cos(E) - e), yp = a * Math.sqrt(1 - e * e) * Math.sin(E);
  const co = Math.cos(om), so = Math.sin(om), cO = Math.cos(O), sO = Math.sin(O), cI = Math.cos(I), sI = Math.sin(I);
  return {
    x: (co * cO - so * sO * cI) * xp + (-so * cO - co * sO * cI) * yp,
    y: (co * sO + so * cO * cI) * xp + (-so * sO + co * cO * cI) * yp,
    z: so * sI * xp + co * sI * yp,
    a, e,
  };
}

export function orbitPoints(id, date, n = 256) {
  // Sample one revolution around the given date.
  const T = (julian(date) - 2451545) / 36525;
  const el = EL[id];
  const a = el[0] + el[1] * T, e = el[2] + el[3] * T, I = (el[4] + el[5] * T) * D;
  const w = el[8] + el[9] * T, O = (el[10] + el[11] * T) * D, om = w * D - O;
  const pts = [];
  for (let k = 0; k <= n; k++) {
    const E = (k / n) * 2 * Math.PI;
    const xp = a * (Math.cos(E) - e), yp = a * Math.sqrt(1 - e * e) * Math.sin(E);
    const co = Math.cos(om), so = Math.sin(om), cO = Math.cos(O), sO = Math.sin(O), cI = Math.cos(I), sI = Math.sin(I);
    pts.push({
      x: (co * cO - so * sO * cI) * xp + (-so * cO - co * sO * cI) * yp,
      y: (co * sO + so * cO * cI) * xp + (-so * sO + co * cO * cI) * yp,
      z: so * sI * xp + co * sI * yp,
    });
  }
  return pts;
}

export const dist = (p, q) => Math.hypot(p.x - q.x, p.y - q.y, p.z - q.z);
export const LIGHT_MIN_PER_AU = 8.3168;

// Mars areocentric solar longitude: 0 = northern spring equinox. Perihelion is near Ls 251.
export function marsLs(date) {
  const p = position("mars", date);
  return mod360((Math.atan2(p.y, p.x) * 180) / Math.PI - 85);
}
export function marsSeason(ls) {
  if (ls < 90) return "北半球の春（南半球は秋）";
  if (ls < 180) return "北半球の夏（南半球は冬）";
  if (ls < 270) return "北半球の秋（南半球は春）";
  return "北半球の冬（南半球は夏）";
}

export const PLANETS = [
  { id: "mercury", name: "水星", color: "#a89f97", radiusKm: 2440, day: "自転 58.6日 / 太陽日 176日", atm: "ほぼ無し（希薄な外気圏）", temp: "-180〜430°C（昼夜差が太陽系最大級）", pressure: "ほぼ真空", wind: "風は無し。太陽風が表面を削る", notes: ["大気が無く、いわゆる天気は存在しない", "極の永久影のクレーターには水氷がある"] },
  { id: "venus", name: "金星", color: "#e8c98a", radiusKm: 6052, day: "自転 243日（逆回り）", atm: "CO₂ 96%・硫酸の雲", temp: "地表 約465°C（一定）", pressure: "地表 約92気圧", wind: "雲頂 約100m/s（スーパーローテーション）。地表は約1m/s", notes: ["雲頂では自転より遥かに速い約4〜5日で1周する暴風", "地表は鉛が溶ける高温で、昼夜・季節による気温差がほぼ無い"] },
  { id: "earth", name: "地球", color: "#4f8cff", radiusKm: 6371, day: "自転 23.9時間", atm: "N₂ 78%・O₂ 21%", temp: "平均 約15°C", pressure: "地表 1気圧", wind: "ジェット気流 約100m/s", notes: ["液体の水と生命がある唯一の天体", "詳しい観測は「地球」タブへ（火災・洪水・猛暑・台風）"] },
  { id: "mars", name: "火星", color: "#d8664a", radiusKm: 3390, day: "1日 24.6時間 / 1年 687日", atm: "CO₂ 95%・非常に希薄", temp: "平均 約-63°C（-140〜20°C）", pressure: "地表 約0.006気圧", wind: "通常 数m/s。砂嵐時は約30m/s（空気が薄く体感は弱い）", notes: ["塵旋風（ダストデビル）が日常的に発生", "数年に一度、全球規模の砂嵐（直近は2018年）。発生は南半球の春〜夏（Ls 180〜360）に集中", "2つの極冠はCO₂ドライアイと水氷"] },
  { id: "jupiter", name: "木星", color: "#d9b38c", radiusKm: 69911, day: "自転 9.9時間", atm: "H₂ 90%・He 10%・アンモニアの雲", temp: "雲頂(1気圧) 約-108°C", pressure: "1気圧面が基準（固体表面なし）", wind: "帯状ジェット 最大 約100〜150m/s（時速500km超）", notes: ["大赤斑は地球より大きい高気圧性の嵐。少なくとも150年以上継続し縮小傾向", "縞模様は東西に流れる帯状の気流。探査機ジュノーが極域の巨大サイクロンも観測"] },
  { id: "saturn", name: "土星", color: "#e3d3a1", radiusKm: 58232, day: "自転 10.7時間", atm: "H₂・He・アンモニアの雲", temp: "雲頂(1気圧) 約-139°C", pressure: "1気圧面が基準（固体表面なし）", wind: "赤道付近 最大 約500m/s（時速1800km）", notes: ["北極の六角形の渦（ヘキサゴン）は数十年以上継続", "約30年周期で「大白斑」と呼ばれる巨大嵐が発生（直近は2010年）"] },
  { id: "uranus", name: "天王星", color: "#9fe3e6", radiusKm: 25362, day: "自転 17.2時間（横倒し・傾き98°）", atm: "H₂・He・メタン", temp: "雲頂(1気圧) 約-195°C", pressure: "1気圧面が基準", wind: "最大 約250m/s（時速900km）", notes: ["自転軸がほぼ横倒しのため、極が42年ずつ昼と夜になる極端な季節", "雲活動は季節で強まる。至点期に向け観測の関心が高い"] },
  { id: "neptune", name: "海王星", color: "#4667d9", radiusKm: 24622, day: "自転 16.1時間", atm: "H₂・He・メタン", temp: "雲頂(1気圧) 約-201°C", pressure: "1気圧面が基準", wind: "最大 約580m/s（時速2100km、太陽系最速）", notes: ["太陽から最も遠いのに強い風が吹く。内部熱が駆動源と考えられている", "「大暗斑」は数年〜十数年で現れては消える"] },
];

// Numeric comparison values. Cloud-top (1 bar) values for gas/ice giants. Wind = typical max (m/s).
export const NUMS = {
  mercury: { min: -180, max: 430, bar: 0, wind: 0 },
  venus: { min: 465, max: 465, bar: 92, wind: 100 },
  earth: { min: -89, max: 57, bar: 1, wind: 113 },
  mars: { min: -140, max: 20, bar: 0.006, wind: 30 },
  jupiter: { min: -108, max: -108, bar: 1, wind: 150 },
  saturn: { min: -139, max: -139, bar: 1, wind: 500 },
  uranus: { min: -195, max: -195, bar: 1, wind: 250 },
  neptune: { min: -201, max: -201, bar: 1, wind: 580 },
};

export const RECORDS = [
  ["🔥", "最も暑い", "金星 約465°C", "水星より太陽から遠いのに暑い。厚いCO₂の温室効果で昼も夜も一定"],
  ["🧊", "最も寒い大気", "天王星 約-224°C（上層）", "雲頂は海王星が-201°Cだが、大気の最低温度は天王星が太陽系で最も低い"],
  ["💨", "最速の風", "海王星 約580m/s（時速2100km）", "地球の最強クラスの台風の約7倍。内部熱が駆動源と考えられる"],
  ["🌀", "最大の嵐", "木星の大赤斑 直径約1.6万km", "地球の約1.3倍。19世紀は約4万kmあり、縮小が続く"],
  ["⏳", "最も長寿の嵐", "木星の大赤斑 150年以上", "観測記録が残る中で最長。地球の台風は長くて数週間"],
  ["⚖", "最も高い気圧", "金星の地表 約92気圧", "地球の海の約900m下に相当。探査機が長く持たない理由"],
  ["🌫", "最も薄い天気の舞台", "火星 約0.006気圧", "地球の約0.6%。砂嵐は猛烈でも風の圧力は弱い"],
  ["🌗", "昼夜の温度差", "水星 約600°C", "-180〜430°C。大気が無く熱を保てない"],
];

export const EVENTS = [
  { y: 1859, p: "sun", t: "キャリントン・イベント。史上最大級の太陽嵐で、世界中の電信網が火花を出し、低緯度でもオーロラが見えた" },
  { y: 1966, p: "earth", t: "台風18号（宮古島台風）。宮古島で最大瞬間風速85.3m/sを観測" },
  { y: 1971, p: "mars", t: "探査機マリナー9号が到着した時、火星は全球砂嵐で表面がほぼ見えなかった" },
  { y: 1979, p: "earth", t: "台風チップ。海面気圧870hPa、観測史上最低（史上最大級の台風）" },
  { y: 1989, p: "sun", t: "太陽嵐でカナダ・ケベック州が約9時間の大停電（地磁気嵐 Kp9）" },
  { y: 1970, p: "venus", t: "ソ連のベネラ7号が他の惑星の地表から初めて信号を送信。地表は約475°Cだった" },
  { y: 1981, p: "saturn", t: "ボイジャーが土星の北極の六角形の渦（ヘキサゴン）を撮影" },
  { y: 1989, p: "neptune", t: "ボイジャー2号が海王星の「大暗斑」を撮影。1994年のハッブル観測では消えていた" },
  { y: 1996, p: "earth", t: "サイクロン・オリビア。オーストラリアで最大瞬間風速408km/h（竜巻を除く地表風の世界記録）" },
  { y: 2003, p: "sun", t: "ハロウィン太陽嵐。大規模フレアが連発し、人工衛星や航空通信に影響" },
  { y: 2010, p: "saturn", t: "約30年周期の「大白斑」が発生。翌年までに土星をぐるりと一周" },
  { y: 2013, p: "earth", t: "台風30号（ハイエン）。フィリピンを直撃し、1分間平均で約315km/hの猛烈な風" },
  { y: 2017, p: "jupiter", t: "探査機ジュノーが木星の極に、巨大サイクロンの群れ（北8個・南5個）を発見" },
  { y: 2017, p: "venus", t: "日本の探査機「あかつき」が金星大気に約1万km級の巨大な弓状構造（重力波）を発見" },
  { y: 2018, p: "mars", t: "全球規模の砂嵐。太陽光が遮られ、探査車オポチュニティが通信途絶（6月）" },
  { y: 2014, p: "uranus", t: "地上望遠鏡とハッブルが天王星で明るい大規模な嵐を観測" },
  { y: 2024, p: "sun", t: "5月の超強力な地磁気嵐（G5・Kp9）。日本を含む低緯度で広くオーロラが観測された" },
  { y: 2025, p: "earth", t: "日本の観測史上最高気温を更新（41.8°C・群馬県伊勢崎市、8月5日）" },
];
