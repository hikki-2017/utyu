import * as THREE from "./vendor/three/three.module.min.js";
import { STARS, GALAXIES, COSMOS } from "./cosmos-data.js";

const $ = (s) => document.querySelector(s);
const D = Math.PI / 180;
const eq = (raH, dec) => {
  const a = raH * 15 * D, d = dec * D;
  return new THREE.Vector3(Math.cos(d) * Math.cos(a), Math.sin(d), -Math.cos(d) * Math.sin(a));
};

const at = (obj, p) => { obj.position.copy(p); return obj; };
function glow(color, size) {
  const c = document.createElement("canvas"); c.width = c.height = 128;
  const g = c.getContext("2d"), gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  gr.addColorStop(0, color + "ff"); gr.addColorStop(0.3, color + "77"); gr.addColorStop(1, color + "00");
  g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
  s.scale.set(size, size, 1); return s;
}
const rnd = (() => { let a = 12345; return () => { a = (a * 1664525 + 1013904223) >>> 0; return a / 4294967296; }; })();
const gauss = () => { let s = 0; for (let i = 0; i < 4; i++) s += rnd(); return (s - 2) * 1.2; };

// ---- levels: each returns {items[], radius, add(group)} ----
const kindColor = (k) => (/巨星|超巨星/.test(k) ? "#ff9b5e" : /赤色矮星/.test(k) ? "#ff7a6b" : /A型|B型|青/.test(k) ? "#9cc4ff" : "#ffe9a8");

const LEVELS = [
  {
    id: "stars", name: "近傍の恒星", sub: "〜数千光年", note: "距離は対数スケール（遠いほど圧縮）。位置と距離は実際の星表の値", radius: 70,
    build(group) {
      const R = (ly) => 10 * Math.log10(1 + ly);
      const items = STARS.map(([name, ly, ra, dec, kind, desc, wx]) => ({
        name, pos: eq(ra, dec).multiplyScalar(R(ly)), color: kindColor(kind),
        info: [["距離", `${ly.toLocaleString()} 光年（光が${ly.toLocaleString()}年かけて届く）`], ["種類", kind]], desc, weather: wx,
      }));
      items.forEach((it) => {
        group.add(at(glow(it.color, 3), it.pos));
        group.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), it.pos]), new THREE.LineBasicMaterial({ color: 0x5b8cff, transparent: true, opacity: 0.12 })));
      });
      items.unshift({ name: "太陽系（ここ）", pos: new THREE.Vector3(), color: "#ffb640", info: [["位置", "地図の中心"]], desc: "すべての距離は太陽系から測っています。" });
      group.add(at(glow("#ffb640", 5), new THREE.Vector3()));
      [10, 100, 1000].forEach((ly) => group.add(circle(R(ly), `${ly}光年`)));
      return items;
    },
  },
  {
    id: "milkyway", name: "天の川銀河", sub: "直径約10万光年", note: "渦巻の形は模式図（腕の位置は概略）。太陽の位置・大きさ・伴銀河の距離は実際の値にもとづく", radius: 60,
    build(group) {
      const K = 0.6; // 1 kly -> 0.6 units
      const N = 26000, pos = new Float32Array(N * 3), col = new Float32Array(N * 3);
      for (let i = 0; i < N; i++) {
        let x, z, y, c;
        if (i < 5000) { // bulge
          const r = Math.abs(gauss()) * 3.4; const th = rnd() * 6.283, ph = Math.acos(2 * rnd() - 1);
          x = r * Math.sin(ph) * Math.cos(th); z = r * Math.sin(ph) * Math.sin(th); y = r * Math.cos(ph) * 0.6; c = [1, 0.85, 0.55];
        } else if (i < 9000) { // diffuse disk
          const r = 4 + rnd() * 46, th = rnd() * 6.283;
          x = r * Math.cos(th); z = r * Math.sin(th); y = gauss() * 0.4; c = [0.6, 0.65, 0.85];
        } else { // spiral arms
          const arm = i % 4, r = 4 + Math.pow(rnd(), 0.8) * 46;
          const th = (arm * Math.PI) / 2 + 4.7 * Math.log(r / 4) + gauss() * 0.11 * (1 + 8 / r);
          x = r * Math.cos(th); z = r * Math.sin(th); y = gauss() * 0.35; c = [0.55 + rnd() * 0.2, 0.7 + rnd() * 0.15, 1];
        }
        pos.set([x * K, y * K, z * K], i * 3); col.set(c, i * 3);
      }
      const g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.BufferAttribute(pos, 3)); g.setAttribute("color", new THREE.BufferAttribute(col, 3));
      group.add(new THREE.Points(g, new THREE.PointsMaterial({ size: 1.4, sizeAttenuation: false, vertexColors: true, transparent: true, opacity: 0.8, depthWrite: false, blending: THREE.AdditiveBlending })));
      group.add(at(glow("#ffdd99", 16), new THREE.Vector3()));
      const sun = new THREE.Vector3(26 * K, 0, 0);
      const gal = (d, l, b) => sun.clone().add(new THREE.Vector3(-Math.cos(b * D) * Math.cos(l * D), Math.sin(b * D), Math.cos(b * D) * Math.sin(l * D)).multiplyScalar(d * K));
      const items = [
        { name: "銀河中心（いて座A*）", pos: new THREE.Vector3(), color: "#ffdd99", info: [["距離", "約2.6万光年"], ["種類", "超大質量ブラックホール"]], desc: "太陽の約430万倍の質量。2022年に電波望遠鏡EHTがその影を撮影した。" },
        { name: "太陽系（ここ）", pos: sun, color: "#ffb640", info: [["銀河中心から", "約2.6万光年"], ["公転", "約2.3億年で1周（秒速約220km）"]], desc: "オリオン腕（局所腕）の縁に位置する。銀河系には数千億個の恒星がある。" },
        { name: "大マゼラン雲", pos: gal(163, 280.5, -32.9), color: "#9cc4ff", info: [["距離", "約16万光年"], ["種類", "伴銀河"]], desc: "天の川の周りを回る矮小銀河。1987年に超新星SN 1987Aが出現した。" },
        { name: "小マゼラン雲", pos: gal(200, 302.8, -44.3), color: "#9cc4ff", info: [["距離", "約20万光年"], ["種類", "伴銀河"]], desc: "南天で肉眼でも見える淡い雲。天の川の伴銀河。" },
      ];
      items.forEach((it) => group.add(at(glow(it.color, 5), it.pos)));
      group.add(circle(50 * K, "半径5万光年", true));
      return items;
    },
  },
  {
    id: "galaxies", name: "近傍の銀河", sub: "〜3億光年", note: "距離は対数スケール。位置と距離は実際の観測値（概数）。中心は天の川銀河", radius: 90,
    build(group) {
      const R = (mly) => 14 * (Math.log10(mly) + 1.2);
      const items = GALAXIES.map(([name, mly, ra, dec, kind, desc]) => ({
        name, pos: eq(ra, dec).multiplyScalar(R(mly)), color: /銀河団/.test(kind) ? "#ff9b5e" : /楕円/.test(kind) ? "#ffe9a8" : "#9cc4ff",
        info: [["距離", `${mly >= 1 ? mly.toLocaleString() + " 百万光年" : (mly * 1000).toFixed(0) + " 千光年"}`], ["種類", kind]], desc,
      }));
      items.forEach((it) => {
        group.add(at(glow(it.color, /銀河団/.test(it.info[1][1]) ? 7 : 4.5), it.pos));
        group.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), it.pos]), new THREE.LineBasicMaterial({ color: 0x5b8cff, transparent: true, opacity: 0.1 })));
      });
      items.unshift({ name: "天の川銀河（ここ）", pos: new THREE.Vector3(), color: "#ffdd99", info: [["位置", "地図の中心"]], desc: "局所銀河群（アンドロメダ銀河などを含む）の一員。" });
      group.add(at(glow("#ffdd99", 6), new THREE.Vector3()));
      [1, 10, 100].forEach((m) => group.add(circle(R(m), `${m}百万光年`)));
      return items;
    },
  },
  {
    id: "universe", name: "観測可能な宇宙", sub: "〜138億光年", note: "網目構造は模式図。球面の半径は「光が旅した時間」で、実際の距離ではありません（宇宙膨張のため現在の距離は約465億光年）", radius: 125,
    build(group) {
      const R = (gly) => 12 * (Math.log10(gly) + 2.5);
      const nodes = Array.from({ length: 70 }, () => new THREE.Vector3(gauss(), gauss(), gauss()).multiplyScalar(22));
      const pts = [];
      nodes.forEach((a, i) => nodes.map((b, j) => [a.distanceTo(b), j]).sort((x, y) => x[0] - y[0]).slice(1, 3).forEach(([, j]) => {
        const b = nodes[j];
        for (let t = 0; t < 90; t++) { const u = rnd(); pts.push(a.x + (b.x - a.x) * u + gauss() * 0.7, a.y + (b.y - a.y) * u + gauss() * 0.7, a.z + (b.z - a.z) * u + gauss() * 0.7); }
      }));
      const g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.BufferAttribute(new Float32Array(pts), 3));
      group.add(new THREE.Points(g, new THREE.PointsMaterial({ color: 0x9a7bff, size: 1.6, sizeAttenuation: false, transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending })));
      const dirs = [eq(12.485, 2.05), eq(9.5, 30), eq(20, -40), eq(6, 10), eq(15, 55)];
      const items = COSMOS.map(([name, gly, ra, dec, kind, desc], i) => ({
        name, pos: (ra != null ? eq(ra, dec) : dirs[i]).clone().multiplyScalar(R(gly)), color: i === 4 ? "#ff7a6b" : "#ffe9a8",
        info: [["光の旅", `約${(gly * 10).toFixed(gly < 1 ? 1 : 0)}億光年`], ["種類", kind]], desc,
      }));
      items.forEach((it) => group.add(at(glow(it.color, 5), it.pos)));
      items.unshift({ name: "天の川銀河（ここ）", pos: new THREE.Vector3(), color: "#ffdd99", info: [["位置", "地図の中心"]], desc: "宇宙のどこから見ても、観測可能な範囲は自分を中心とした球になる。" });
      group.add(at(glow("#ffdd99", 4), new THREE.Vector3()));
      [[1, "10億光年"], [3, "30億光年"], [10, "100億光年"], [13.8, "138億光年（観測の限界）"]].forEach(([gly, t], i) => {
        const s = new THREE.Mesh(new THREE.SphereGeometry(R(gly), 32, 20), new THREE.MeshBasicMaterial({ color: i === 3 ? 0xff7a6b : 0x5b8cff, wireframe: true, transparent: true, opacity: i === 3 ? 0.22 : 0.07 }));
        group.add(s);
      });
      return items;
    },
  },
];

function circle(r, label, vertical) {
  const p = []; for (let i = 0; i <= 128; i++) { const a = (i / 128) * 6.2832; p.push(new THREE.Vector3(Math.cos(a) * r, 0, Math.sin(a) * r)); }
  const l = new THREE.Line(new THREE.BufferGeometry().setFromPoints(p), new THREE.LineBasicMaterial({ color: 0x5b8cff, transparent: true, opacity: 0.25 }));
  l.userData.label = label; return l;
}

export function initCosmosUI() {
  const host = $("#cosmos");
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  host.appendChild(renderer.domElement);
  const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(50, 1, 0.1, 3000);
  const labelsEl = document.createElement("div"); labelsEl.className = "plabels"; host.appendChild(labelsEl);
  const sp = new Float32Array(2500 * 3);
  for (let i = 0; i < 2500; i++) { const r = 1500, th = rnd() * 6.283, ph = Math.acos(2 * rnd() - 1); sp.set([r * Math.sin(ph) * Math.cos(th), r * Math.cos(ph), r * Math.sin(ph) * Math.sin(th)], i * 3); }
  const sg = new THREE.BufferGeometry(); sg.setAttribute("position", new THREE.BufferAttribute(sp, 3));
  scene.add(new THREE.Points(sg, new THREE.PointsMaterial({ color: 0xffffff, size: 1.3, sizeAttenuation: false, opacity: 0.6, transparent: true })));
  let group = new THREE.Group(); scene.add(group);

  const cam = { theta: 0.6, phi: 1.1, radius: 80, target: new THREE.Vector3(), goalTarget: new THREE.Vector3(), goalRadius: 80 };
  let items = [], labels = [], level = 0, selected = -1, running = false, raf = 0, dragging = false, moved = 0, last = {};
  const list = $("#cosmosList"), info = $("#cosmosInfo");

  function build(i) {
    level = i; selected = -1;
    scene.remove(group); group = new THREE.Group(); scene.add(group);
    labelsEl.innerHTML = ""; labels = [];
    items = LEVELS[i].build(group);
    items.forEach((it, k) => {
      const b = document.createElement("button"); b.className = "plabel"; b.textContent = it.name; b.addEventListener("click", () => pick(k)); labelsEl.appendChild(b); labels.push(b);
    });
    group.children.filter((c) => c.userData?.label).forEach((c) => {
      const b = document.createElement("span"); b.className = "plabel ring"; b.textContent = c.userData.label; labelsEl.appendChild(b);
      c.userData.el = b; c.userData.p = new THREE.Vector3(c.geometry.attributes.position.getX(0), 0, 0);
    });
    cam.goalTarget.set(0, 0, 0); cam.goalRadius = LEVELS[i].radius;
    document.querySelectorAll("#cosmosLevels button").forEach((b, k) => b.classList.toggle("on", k === i));
    renderPanel();
  }

  function pick(k) {
    selected = k;
    cam.goalTarget.copy(items[k].pos); cam.goalRadius = Math.max(6, LEVELS[level].radius * 0.22);
    renderPanel();
  }

  function renderPanel() {
    const L = LEVELS[level];
    list.innerHTML = items.map((it, k) => `<button data-k="${k}" class="${k === selected ? "on" : ""}"><i class="pdot" style="background:${it.color}"></i>${it.name}</button>`).join("");
    const it = items[selected];
    info.innerHTML = `<h2>🌌 ${L.name}<small>${L.sub}</small></h2><p class="hint">${L.note}</p>` + (it ? `
      <div class="stat"><b style="color:var(--txt);font-size:14px">${it.name}</b></div>
      <table>${it.info.map(([k, v]) => `<tr><th>${k}</th><td>${v}</td></tr>`).join("")}</table>
      <p>${it.desc}</p>
      ${it.weather ? `<div class="stat live"><b>☁ 天気（系外惑星）</b>${it.weather}</div>` : ""}` : '<p class="hint">星・銀河をクリックすると詳細が表示されます。</p>');
  }
  list.addEventListener("click", (e) => { const b = e.target.closest("button"); if (b) pick(+b.dataset.k); });

  $("#cosmosLevels").innerHTML = LEVELS.map((L, i) => `<button data-i="${i}">${L.name}</button>`).join("");
  $("#cosmosLevels").addEventListener("click", (e) => { const b = e.target.closest("button"); if (b) build(+b.dataset.i); });

  const el = renderer.domElement;
  el.addEventListener("pointerdown", (e) => { dragging = true; moved = 0; last = { x: e.clientX, y: e.clientY }; el.setPointerCapture(e.pointerId); });
  el.addEventListener("pointermove", (e) => {
    if (!dragging) return;
    const dx = e.clientX - last.x, dy = e.clientY - last.y; moved += Math.abs(dx) + Math.abs(dy); last = { x: e.clientX, y: e.clientY };
    cam.theta -= dx * 0.005; cam.phi = Math.max(0.12, Math.min(Math.PI - 0.12, cam.phi - dy * 0.005));
  });
  el.addEventListener("pointerup", () => { dragging = false; });
  el.addEventListener("wheel", (e) => { e.preventDefault(); cam.goalRadius = Math.max(2, Math.min(600, cam.goalRadius * Math.exp(e.deltaY * 0.001))); }, { passive: false });

  function resize() { const w = host.clientWidth, h = host.clientHeight; if (!w || !h) return; renderer.setSize(w, h); camera.aspect = w / h; camera.updateProjectionMatrix(); }
  new ResizeObserver(resize).observe(host);

  const v = new THREE.Vector3();
  function frame() {
    if (!running) return;
    raf = requestAnimationFrame(frame);
    cam.target.lerp(cam.goalTarget, 0.08); cam.radius += (cam.goalRadius - cam.radius) * 0.08;
    if (!dragging && selected < 0) cam.theta += 0.0007;
    camera.position.set(cam.target.x + cam.radius * Math.sin(cam.phi) * Math.sin(cam.theta), cam.target.y + cam.radius * Math.cos(cam.phi), cam.target.z + cam.radius * Math.sin(cam.phi) * Math.cos(cam.theta));
    camera.lookAt(cam.target);
    const w = host.clientWidth, h = host.clientHeight;
    const put = (b, p) => { v.copy(p).project(camera); b.style.display = v.z < 1 && v.z > -1 ? "" : "none"; b.style.transform = `translate(${((v.x + 1) / 2) * w}px,${((1 - v.y) / 2) * h}px) translate(-50%,-140%)`; };
    items.forEach((it, k) => { put(labels[k], it.pos); labels[k].classList.toggle("on", k === selected); });
    group.children.forEach((c) => { if (c.userData?.el) put(c.userData.el, c.userData.p); });
    renderer.render(scene, camera);
  }

  return {
    show() { host.hidden = false; if (!items.length) build(0); running = true; resize(); frame(); },
    hide() { host.hidden = true; running = false; cancelAnimationFrame(raf); },
  };
}
