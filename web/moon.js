// "Lumina Terra"-style lunar map: NASA LRO WAC mosaic (Moon Trek) on a 3D globe with landing sites and polar water-ice targets.
import * as THREE from "./vendor/three/three.module.min.js";

const $ = (s) => document.querySelector(s);
const D = Math.PI / 180;
const TREK = "https://trek.nasa.gov/tiles/Moon/EQ/LRO_WAC_Mosaic_Global_303ppd_v02/1.0.0/default/default028mm";
const R = 10;

// [name, lat, lon(E+), group, year/description]
const SITES = [
  ["アポロ11号", 0.67, 23.47, "landing", "1969年。人類初の月面着陸（静かの海）"],
  ["アポロ12号", -3.01, -23.42, "landing", "1969年。嵐の大洋。サーベイヤー3号の近くに着陸"],
  ["アポロ14号", -3.65, -17.47, "landing", "1971年。フラ・マウロ高地"],
  ["アポロ15号", 26.13, 3.63, "landing", "1971年。初の月面車。ハドリー谷"],
  ["アポロ16号", -8.97, 15.5, "landing", "1972年。デカルト高地"],
  ["アポロ17号", 20.19, 30.77, "landing", "1972年。最後の有人着陸。タウルス・リトロウ谷"],
  ["嫦娥3号・玉兎", 44.12, -19.51, "landing", "2013年。中国初の月面着陸（虹の入り江）"],
  ["嫦娥4号", -45.46, 177.59, "landing", "2019年。世界初の月の裏側への軟着陸（フォン・カルマン・クレーター）"],
  ["嫦娥5号", 43.06, -51.92, "landing", "2020年。月の試料を約1.7kg持ち帰り"],
  ["嫦娥6号", -41.64, -153.99, "landing", "2024年。月の裏側のサンプルを世界で初めて持ち帰り"],
  ["チャンドラヤーン3号", -69.37, 32.32, "landing", "2023年。インドが月の南極域に初めて着陸成功"],
  ["SLIM（日本）", -13.32, 25.25, "landing", "2024年。日本初の月面着陸。ピンポイント着陸を実証"],
  ["IM-1「オデュッセウス」", -80.13, 1.44, "landing", "2024年。民間企業初の月面着陸（南極付近・マラパート）"],
  ["シャクルトン・クレーター", -89.9, 0, "ice", "南極点直近。内部は永久影で、縁の一部はほぼ常に日が当たる。水氷の存在が有力視される"],
  ["カベウス・クレーター", -84.9, -35.5, "ice", "2009年、探査機LCROSSの衝突実験で噴出物から水が検出された"],
  ["ファウスティーニ・クレーター", -87.3, 77, "ice", "永久影のクレーター。水氷の候補で、アルテミス計画の着陸候補領域の近く"],
  ["ハワース・クレーター", -87.5, -5, "ice", "永久影を持つ南極域の大クレーター。着陸候補領域の一つ"],
  ["ド・ジェルラシュ・クレーター", -88.5, -87.1, "ice", "南極域の永久影クレーター。着陸候補領域の近く"],
];

const GROUP = { landing: { label: "着陸実績", color: "#ffd166" }, ice: { label: "水氷の候補・永久影", color: "#5ff2ff" } };

async function moonTexture() {
  const W = 8, H = 4, c = document.createElement("canvas"); c.width = 256 * W; c.height = 256 * H;
  const g = c.getContext("2d"); g.fillStyle = "#777"; g.fillRect(0, 0, c.width, c.height);
  const jobs = [];
  for (let r = 0; r < H; r++) for (let x = 0; x < W; x++) {
    jobs.push(fetch(`${TREK}/2/${r}/${x}.jpg`).then((res) => (res.ok ? res.blob() : null)).then((b) => b && createImageBitmap(b)).then((bm) => bm && g.drawImage(bm, x * 256, r * 256)).catch(() => {}));
  }
  await Promise.all(jobs);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t;
}

const ll = (lat, lon, r = R) => {
  const la = lat * D, lo = lon * D;
  return new THREE.Vector3(r * Math.cos(lo) * Math.cos(la), r * Math.sin(la), -r * Math.sin(lo) * Math.cos(la));
};

function dot(color, size) {
  const c = document.createElement("canvas"); c.width = c.height = 64;
  const g = c.getContext("2d"); g.fillStyle = color; g.beginPath(); g.arc(32, 32, 16, 0, 7); g.fill();
  g.strokeStyle = "#000"; g.lineWidth = 4; g.stroke();
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), depthTest: false, transparent: true }));
  s.scale.set(size, size, 1); s.renderOrder = 10; return s;
}

export function initMoonUI() {
  const host = $("#moon");
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  host.appendChild(renderer.domElement);
  const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(40, 1, 0.1, 500);
  const labelsEl = document.createElement("div"); labelsEl.className = "plabels"; host.appendChild(labelsEl);
  const sp = new Float32Array(1500 * 3);
  for (let i = 0; i < 1500; i++) { const r = 300, th = Math.random() * 6.283, ph = Math.acos(2 * Math.random() - 1); sp.set([r * Math.sin(ph) * Math.cos(th), r * Math.cos(ph), r * Math.sin(ph) * Math.sin(th)], i * 3); }
  const sg = new THREE.BufferGeometry(); sg.setAttribute("position", new THREE.BufferAttribute(sp, 3));
  scene.add(new THREE.Points(sg, new THREE.PointsMaterial({ color: 0xffffff, size: 1.3, sizeAttenuation: false, opacity: 0.6, transparent: true })));

  const moon = new THREE.Mesh(new THREE.SphereGeometry(R, 96, 64), new THREE.MeshStandardMaterial({ color: 0x9a9a9a, roughness: 1 }));
  scene.add(moon);
  moonTexture().then((t) => { moon.material.map = t; moon.material.color.set(0xffffff); moon.material.needsUpdate = true; });
  const sunLight = new THREE.DirectionalLight(0xffffff, 2.6); sunLight.position.set(30, 8, 30); scene.add(sunLight);
  scene.add(new THREE.AmbientLight(0x667799, 0.7));

  const marks = SITES.map(([name, lat, lon, grp], i) => {
    const s = dot(GROUP[grp].color, 0.5); s.position.copy(ll(lat, lon, R * 1.01)); scene.add(s);
    const b = document.createElement("button"); b.className = "plabel"; b.textContent = name; b.addEventListener("click", () => pick(i)); labelsEl.appendChild(b);
    return { s, b, grp };
  });

  const cam = { theta: Math.PI / 2, phi: Math.PI / 2, radius: 34, goalRadius: 34, goalTheta: null, goalPhi: null };
  let selected = -1, running = false, raf = 0, dragging = false, last = {}, filter = { landing: true, ice: true };

  function focus(lat, lon, radius) {
    const d = ll(lat, lon, 1);
    cam.goalTheta = Math.atan2(d.x, d.z); cam.goalPhi = Math.max(0.05, Math.min(Math.PI - 0.05, Math.acos(Math.max(-1, Math.min(1, d.y))))); cam.goalRadius = radius;
  }
  function pick(i) { selected = i; focus(SITES[i][1], SITES[i][2], SITES[i][3] === "ice" ? 17 : 22); render(); }

  const list = $("#moonList"), info = $("#moonInfo");
  function render() {
    marks.forEach((m) => { const on = filter[m.grp]; m.s.visible = on; m.b.style.visibility = on ? "" : "hidden"; });
    const it = SITES[selected];
    info.innerHTML = `<h2>🌙 月面マップ <small style="color:var(--mut);font-weight:400">Lumina Terra プロトタイプ</small></h2>
      <p class="hint">NASA月探査機LROの全球モザイク画像に、着陸実績と南極の水氷候補を重ねています。ドラッグで回転、ホイールでズーム。</p>
      <div class="chips">${Object.entries(GROUP).map(([k, v]) => `<button data-g="${k}" class="${filter[k] ? "on" : ""}"><i class="pdot" style="background:${v.color}"></i>${v.label}</button>`).join("")}<button data-act="south">南極域へ</button><button data-act="near">表側へ</button></div>
      ${it ? `<div class="stat"><b style="color:var(--txt);font-size:14px">${it[0]}</b>${GROUP[it[3]].label} ／ 緯度 ${it[1].toFixed(1)}° 経度 ${it[2].toFixed(1)}°</div><p>${it[4]}</p>` : ""}
      <div class="stat live"><b>なぜ南極域か</b>永久に日が当たらないクレーター（永久影）には、太古から水氷が残っている可能性がある。一方、その縁には長時間日が当たる場所があり、発電と水の確保が両立できるため、アルテミス計画など各国の着陸候補が集中している。</div>
      <p class="hint">※永久日照・水氷の詳細な分布データ、探査計画の競合状況の統合は今後の課題です（このプロトタイプは主要地点のみ）。</p>`;
    list.innerHTML = SITES.map((s, i) => (filter[s[3]] ? `<button data-k="${i}" class="${i === selected ? "on" : ""}"><i class="pdot" style="background:${GROUP[s[3]].color}"></i>${s[0]}</button>` : "")).join("");
  }
  info.addEventListener("click", (e) => {
    const b = e.target.closest("button"); if (!b) return;
    if (b.dataset.g) { filter[b.dataset.g] = !filter[b.dataset.g]; render(); }
    if (b.dataset.act === "south") focus(-90, 0, 20);
    if (b.dataset.act === "near") focus(0, 0, 34);
  });
  list.addEventListener("click", (e) => { const b = e.target.closest("button"); if (b) pick(+b.dataset.k); });

  const el = renderer.domElement;
  el.addEventListener("pointerdown", (e) => { dragging = true; last = { x: e.clientX, y: e.clientY }; cam.goalTheta = null; el.setPointerCapture(e.pointerId); });
  el.addEventListener("pointermove", (e) => {
    if (!dragging) return;
    const dx = e.clientX - last.x, dy = e.clientY - last.y; last = { x: e.clientX, y: e.clientY };
    cam.theta -= dx * 0.005; cam.phi = Math.max(0.05, Math.min(Math.PI - 0.05, cam.phi - dy * 0.005));
  });
  el.addEventListener("pointerup", () => { dragging = false; });
  el.addEventListener("wheel", (e) => { e.preventDefault(); cam.goalRadius = Math.max(13, Math.min(80, cam.goalRadius * Math.exp(e.deltaY * 0.001))); }, { passive: false });

  function resize() { const w = host.clientWidth, h = host.clientHeight; if (!w || !h) return; renderer.setSize(w, h); camera.aspect = w / h; camera.updateProjectionMatrix(); }
  new ResizeObserver(resize).observe(host);

  const v = new THREE.Vector3();
  function frame() {
    if (!running) return;
    raf = requestAnimationFrame(frame);
    if (cam.goalTheta != null) {
      const dt = Math.atan2(Math.sin(cam.goalTheta - cam.theta), Math.cos(cam.goalTheta - cam.theta));
      cam.theta += dt * 0.1; cam.phi += (cam.goalPhi - cam.phi) * 0.1;
      if (Math.abs(dt) < 0.002 && Math.abs(cam.goalPhi - cam.phi) < 0.002) cam.goalTheta = null;
    }
    cam.radius += (cam.goalRadius - cam.radius) * 0.1;
    camera.position.set(cam.radius * Math.sin(cam.phi) * Math.sin(cam.theta), cam.radius * Math.cos(cam.phi), cam.radius * Math.sin(cam.phi) * Math.cos(cam.theta));
    camera.lookAt(0, 0, 0);
    const w = host.clientWidth, h = host.clientHeight;
    marks.forEach((m, i) => {
      const p = m.s.position, facing = p.clone().normalize().dot(camera.position.clone().normalize()) > 0.12;
      m.s.material.opacity = facing ? 1 : 0;
      v.copy(p).project(camera);
      m.b.style.display = facing && m.s.visible && (selected === i || cam.radius < 26) ? "" : "none";
      m.b.style.transform = `translate(${((v.x + 1) / 2) * w}px,${((1 - v.y) / 2) * h}px) translate(-50%,-160%)`;
      m.b.classList.toggle("on", selected === i);
    });
    renderer.render(scene, camera);
  }

  return {
    show() { host.hidden = false; render(); running = true; resize(); frame(); },
    hide() { host.hidden = true; running = false; cancelAnimationFrame(raf); },
  };
}
