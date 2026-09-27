import * as THREE from "./vendor/three/three.module.min.js";
import { PLANETS, position, orbitPoints } from "./planets.js";

const SCALE = 9; // display distance = SCALE * sqrt(AU): compresses the outer planets to fit the screen
const SIZE = { mercury: 0.35, venus: 0.55, earth: 0.6, mars: 0.45, jupiter: 1.5, saturn: 1.25, uranus: 0.9, neptune: 0.9 };
const SUN_R = 3;

// ---------- procedural textures ----------
const hash = (x, y) => { const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453; return s - Math.floor(s); };
const smooth = (t) => t * t * (3 - 2 * t);
function vnoise(x, y) {
  const xi = Math.floor(x), yi = Math.floor(y), xf = smooth(x - xi), yf = smooth(y - yi);
  const a = hash(xi, yi), b = hash(xi + 1, yi), c = hash(xi, yi + 1), d = hash(xi + 1, yi + 1);
  return a + (b - a) * xf + (c - a) * yf + (a - b - c + d) * xf * yf;
}
const fbm = (x, y, o = 4) => { let s = 0, a = 0.5; for (let i = 0; i < o; i++) { s += a * vnoise(x, y); x *= 2; y *= 2; a *= 0.5; } return s; };
const mix = (c1, c2, t) => c1.map((v, i) => v + (c2[i] - v) * Math.max(0, Math.min(1, t)));

function makeTexture(fn, w = 512, h = 256) {
  const c = document.createElement("canvas"); c.width = w; c.height = h;
  const g = c.getContext("2d"), img = g.createImageData(w, h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const [r, gg, b] = fn(x / w, y / h);
    const i = (y * w + x) * 4; img.data[i] = r; img.data[i + 1] = gg; img.data[i + 2] = b; img.data[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

const bands = (colors, freq, warp, contrast = 1) => (u, v) => {
  const n = fbm(u * 6, v * 24, 4);
  const t = 0.5 + 0.5 * Math.sin(v * Math.PI * freq + n * warp);
  const k = Math.max(0, Math.min(1, (t - 0.5) * contrast + 0.5));
  return k < 0.5 ? mix(colors[0], colors[1], k * 2) : mix(colors[1], colors[2], (k - 0.5) * 2);
};

const TEX = {
  mercury: () => makeTexture((u, v) => { const n = fbm(u * 16, v * 8, 5); return mix([90, 85, 80], [190, 180, 170], n * 1.3); }),
  venus: () => makeTexture(bands([[210, 170, 100], [240, 215, 150], [250, 235, 190]], 6, 4, 0.9)),
  earth: () => makeTexture((u, v) => { const n = fbm(u * 8, v * 4, 5); return n > 0.52 ? mix([50, 110, 50], [170, 150, 100], (n - 0.52) * 4) : mix([10, 40, 110], [30, 90, 170], n * 2); }),
  mars: () => makeTexture((u, v) => {
    const n = fbm(u * 10, v * 5, 5), lat = Math.abs(v - 0.5) * 2;
    if (lat > 0.88 + fbm(u * 20, 3) * 0.05) return [240, 240, 245];
    return mix([120, 50, 30], [215, 130, 80], n * 1.4);
  }),
  jupiter: () => makeTexture((u, v) => {
    const c = bands([[150, 100, 70], [215, 180, 140], [245, 230, 205]], 13, 3.5, 1.4)(u, v);
    const dx = (u - 0.62) / 0.06, dy = (v - 0.63) / 0.035, r = dx * dx + dy * dy;
    return r < 1 ? mix(c, [190, 70, 45], (1 - r) * 1.8) : c;
  }),
  saturn: () => makeTexture(bands([[190, 165, 115], [225, 205, 155], [240, 225, 180]], 11, 1.5, 0.8)),
  uranus: () => makeTexture(bands([[130, 210, 215], [165, 230, 232], [190, 240, 240]], 5, 0.6, 0.5)),
  neptune: () => makeTexture((u, v) => {
    const c = bands([[35, 70, 190], [60, 100, 220], [95, 135, 240]], 7, 1.2, 0.7)(u, v);
    const dx = (u - 0.35) / 0.06, dy = (v - 0.6) / 0.04, r = dx * dx + dy * dy;
    return r < 1 ? mix(c, [20, 35, 110], (1 - r)) : c;
  }),
};

function glowSprite(color, size) {
  const c = document.createElement("canvas"); c.width = c.height = 256;
  const g = c.getContext("2d"), gr = g.createRadialGradient(128, 128, 0, 128, 128, 128);
  gr.addColorStop(0, color + "ff"); gr.addColorStop(0.25, color + "88"); gr.addColorStop(1, color + "00");
  g.fillStyle = gr; g.fillRect(0, 0, 256, 256);
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
  s.scale.set(size, size, 1); return s;
}

const warp = (p) => {
  const len = Math.hypot(p.x, p.y, p.z) || 1, d = SCALE * Math.sqrt(len);
  return new THREE.Vector3((p.x / len) * d, (p.z / len) * d, (-p.y / len) * d);
};

export function createSolar(container, { onSelect } = {}) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  container.appendChild(renderer.domElement);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 2000);
  const labelsEl = document.createElement("div"); labelsEl.className = "plabels"; container.appendChild(labelsEl);

  // stars
  const sp = new Float32Array(3000 * 3);
  for (let i = 0; i < 3000; i++) {
    const r = 800 + Math.random() * 400, th = Math.random() * 2 * Math.PI, ph = Math.acos(2 * Math.random() - 1);
    sp.set([r * Math.sin(ph) * Math.cos(th), r * Math.cos(ph), r * Math.sin(ph) * Math.sin(th)], i * 3);
  }
  const sg = new THREE.BufferGeometry(); sg.setAttribute("position", new THREE.BufferAttribute(sp, 3));
  scene.add(new THREE.Points(sg, new THREE.PointsMaterial({ color: 0xffffff, size: 1.6, sizeAttenuation: false, opacity: 0.8, transparent: true })));

  // sun
  const sun = new THREE.Mesh(new THREE.SphereGeometry(SUN_R, 48, 32), new THREE.MeshBasicMaterial({ color: 0xffb640 }));
  sun.add(glowSprite("#ffa030", SUN_R * 7));
  scene.add(sun);
  scene.add(new THREE.PointLight(0xffffff, 3.2, 0, 0));
  scene.add(new THREE.AmbientLight(0x223355, 0.7));

  // planets
  const bodies = {}, hitMeshes = [];
  let marks = null;
  const now0 = new Date();
  PLANETS.forEach((pl) => {
    const group = new THREE.Group();
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(SIZE[pl.id], 48, 32), new THREE.MeshStandardMaterial({ map: TEX[pl.id](), roughness: 1, metalness: 0 }));
    group.add(mesh);
    if (pl.id === "earth") {
      const loader = new THREE.TextureLoader(); loader.crossOrigin = "anonymous";
      const wms = (layer, w, extra = "") => `https://gibs.earthdata.nasa.gov/wms/epsg4326/best/wms.cgi?SERVICE=WMS&REQUEST=GetMap&VERSION=1.1.1&LAYERS=${layer}&SRS=EPSG:4326&BBOX=-180,-90,180,90&WIDTH=${w}&HEIGHT=${w / 2}&FORMAT=image/jpeg${extra}`;
      const apply = (t) => { t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; mesh.material.map = t; mesh.material.emissiveMap = t; mesh.material.needsUpdate = true; };
      const day = new Date(Date.now() - 30 * 3600e3).toISOString().slice(0, 10);
      loader.load(wms("VIIRS_SNPP_CorrectedReflectance_TrueColor", 2048, `&TIME=${day}`), apply,
        undefined, () => loader.load(wms("BlueMarble_NextGeneration", 1024), apply));
      mesh.material.emissive = new THREE.Color(0xffffff); mesh.material.emissiveIntensity = 0.35;
      mesh.rotation.z = 0.41;
      marks = new THREE.Group(); mesh.add(marks);
    }
    if (pl.id === "saturn") {
      const inner = SIZE.saturn * 1.35, outer = SIZE.saturn * 2.4;
      const geo = new THREE.RingGeometry(inner, outer, 128, 1), pos = geo.attributes.position, uv = geo.attributes.uv;
      for (let i = 0; i < pos.count; i++) uv.setXY(i, (Math.hypot(pos.getX(i), pos.getY(i)) - inner) / (outer - inner), 0.5);
      const c = document.createElement("canvas"); c.width = 256; c.height = 1;
      const g = c.getContext("2d");
      for (let x = 0; x < 256; x++) {
        const t = x / 256, a = (t < 0.08 ? 0.15 : t > 0.6 && t < 0.66 ? 0.05 : 0.35 + 0.5 * Math.abs(Math.sin(t * 40))) * (t > 0.95 ? 0.3 : 1);
        g.fillStyle = `rgba(${200 + 30 * Math.sin(t * 20)},${180 + 20 * Math.sin(t * 20)},140,${a})`; g.fillRect(x, 0, 1, 1);
      }
      const ring = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(c), side: THREE.DoubleSide, transparent: true, depthWrite: false }));
      ring.rotation.x = -Math.PI / 2; group.add(ring);
      group.rotation.z = 0.47;
    }
    const hit = new THREE.Mesh(new THREE.SphereGeometry(Math.max(SIZE[pl.id] * 2.2, 0.9), 8, 6), new THREE.MeshBasicMaterial({ visible: false }));
    hit.userData.id = pl.id; group.add(hit); hitMeshes.push(hit);
    scene.add(group);
    const pts = orbitPoints(pl.id, now0).map(warp);
    scene.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: 0x5b8cff, transparent: true, opacity: 0.28 })));
    const label = document.createElement("button"); label.textContent = pl.name; label.className = "plabel";
    label.addEventListener("click", () => select(pl.id)); labelsEl.appendChild(label);
    bodies[pl.id] = { group, mesh, label };
  });
  const sunLabel = document.createElement("button"); sunLabel.textContent = "太陽"; sunLabel.className = "plabel";
  sunLabel.addEventListener("click", () => select("sun")); labelsEl.appendChild(sunLabel);

  // camera orbit
  const cam = { theta: 0.6, phi: 1.05, radius: 95, target: new THREE.Vector3(), goalTarget: new THREE.Vector3(), goalRadius: 95, goalTheta: null, goalPhi: null };
  let selected = null, dayOffset = 0, raf = 0, running = false, dragging = false, moved = 0, last = { x: 0, y: 0 };

  function place() {
    const date = new Date(now0.getTime() + dayOffset * 86400000);
    for (const pl of PLANETS) bodies[pl.id].group.position.copy(warp(position(pl.id, date)));
  }

  function select(id) {
    selected = id;
    if (id === "sun") { cam.goalTarget.set(0, 0, 0); cam.goalRadius = SUN_R * 5; }
    else { cam.goalTarget.copy(bodies[id].group.position); cam.goalRadius = SIZE[id] * 7 + 3; }
    onSelect?.(id);
  }
  function overview() { selected = null; cam.goalTarget.set(0, 0, 0); cam.goalRadius = 95; }

  const el = renderer.domElement;
  el.addEventListener("pointerdown", (e) => { dragging = true; moved = 0; last = { x: e.clientX, y: e.clientY }; el.setPointerCapture(e.pointerId); });
  el.addEventListener("pointermove", (e) => {
    if (!dragging) return;
    const dx = e.clientX - last.x, dy = e.clientY - last.y; moved += Math.abs(dx) + Math.abs(dy); last = { x: e.clientX, y: e.clientY };
    cam.goalTheta = null;
    cam.theta -= dx * 0.005; cam.phi = Math.max(0.12, Math.min(Math.PI - 0.12, cam.phi - dy * 0.005));
  });
  el.addEventListener("pointerup", (e) => {
    dragging = false;
    if (moved > 4) return;
    const r = el.getBoundingClientRect(), ray = new THREE.Raycaster();
    ray.setFromCamera(new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1), camera);
    const h = ray.intersectObjects([...hitMeshes, sun], false)[0];
    if (h) select(h.object === sun ? "sun" : h.object.userData.id);
  });
  el.addEventListener("wheel", (e) => { e.preventDefault(); cam.goalRadius = Math.max(2, Math.min(300, cam.goalRadius * Math.exp(e.deltaY * 0.001))); }, { passive: false });

  function resize() {
    const w = container.clientWidth, h = container.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h); camera.aspect = w / h; camera.updateProjectionMatrix();
  }
  new ResizeObserver(resize).observe(container);

  const v = new THREE.Vector3();
  function frame() {
    if (!running) return;
    raf = requestAnimationFrame(frame);
    if (selected && selected !== "sun") cam.goalTarget.copy(bodies[selected].group.position);
    cam.target.lerp(cam.goalTarget, 0.08);
    cam.radius += (cam.goalRadius - cam.radius) * 0.08;
    if (cam.goalTheta != null) {
      const dt = Math.atan2(Math.sin(cam.goalTheta - cam.theta), Math.cos(cam.goalTheta - cam.theta));
      cam.theta += dt * 0.08; cam.phi += (cam.goalPhi - cam.phi) * 0.08;
      if (Math.abs(dt) < 0.003) cam.goalTheta = null;
    } else if (!dragging && !selected) cam.theta += 0.0006;
    camera.position.set(
      cam.target.x + cam.radius * Math.sin(cam.phi) * Math.sin(cam.theta),
      cam.target.y + cam.radius * Math.cos(cam.phi),
      cam.target.z + cam.radius * Math.sin(cam.phi) * Math.cos(cam.theta));
    camera.lookAt(cam.target);
    for (const pl of PLANETS) if (pl.id !== "earth") bodies[pl.id].mesh.rotation.y += 0.004;
    sun.rotation.y += 0.001;
    const w = container.clientWidth, h = container.clientHeight;
    const proj = (obj, label, off) => {
      obj.getWorldPosition(v); v.y += off; v.project(camera);
      label.style.display = v.z < 1 ? "" : "none";
      label.style.transform = `translate(${((v.x + 1) / 2) * w}px,${((1 - v.y) / 2) * h}px) translate(-50%,-140%)`;
    };
    for (const pl of PLANETS) { proj(bodies[pl.id].group, bodies[pl.id].label, SIZE[pl.id]); bodies[pl.id].label.classList.toggle("on", selected === pl.id); }
    proj(sun, sunLabel, SUN_R); sunLabel.classList.toggle("on", selected === "sun");
    renderer.render(scene, camera);
  }

  place();
  resize();
  return {
    start() { if (running) return; running = true; resize(); frame(); },
    stop() { running = false; cancelAnimationFrame(raf); },
    select, overview,
    setEarthMarkers(list) {
      if (!marks) return;
      marks.clear();
      const R = SIZE.earth * 1.02;
      for (const m of list) {
        const la = (m.lat * Math.PI) / 180, lo = (m.lon * Math.PI) / 180;
        let sp;
        if (m.emoji) {
          const c = document.createElement("canvas"); c.width = c.height = 128;
          const g = c.getContext("2d"); g.font = "96px serif"; g.textAlign = "center"; g.textBaseline = "middle"; g.fillText(m.emoji, 64, 70);
          sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthWrite: false }));
          sp.scale.set(0.42, 0.42, 1);
        } else { sp = glowSprite(m.color, 0.3); }
        sp.position.set(R * Math.cos(lo) * Math.cos(la), R * Math.sin(la), -R * Math.sin(lo) * Math.cos(la));
        marks.add(sp);
      }
    },
    focusEarth(lat, lon) {
      const la = (lat * Math.PI) / 180, lo = (lon * Math.PI) / 180;
      const p = new THREE.Vector3(Math.cos(lo) * Math.cos(la), Math.sin(la), -Math.sin(lo) * Math.cos(la));
      bodies.earth.mesh.updateWorldMatrix(true, false);
      const d = p.transformDirection(bodies.earth.mesh.matrixWorld);
      cam.goalTheta = Math.atan2(d.x, d.z); cam.goalPhi = Math.acos(Math.max(-1, Math.min(1, d.y)));
    },
    setDayOffset(d) { dayOffset = d; place(); },
    date: () => new Date(now0.getTime() + dayOffset * 86400000),
  };
}
