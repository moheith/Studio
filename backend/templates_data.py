"""Curated starter templates for Yulya Studio projects."""
from __future__ import annotations

import html as html_lib
from typing import Any


def get_templates_catalog() -> list[dict[str, Any]]:
    return [
        {
            "id": "blank",
            "title": "Blank HTML / CSS / JS",
            "category": "STARTER",
            "genre": "WEB APP",
            "badge": "Minimal",
            "description": "Clean HTML5 canvas & stylesheet ready for any website, interactive tool, or custom game.",
            "stack": ["HTML5", "CSS3", "JavaScript"],
            "accent": "#8b5cf6",
        },
        {
            "id": "canvas-arcade",
            "title": "Neon Star Dodger (2D Arcade)",
            "category": "GAME",
            "genre": "ARCADE",
            "badge": "60 FPS + Audio",
            "description": "High-DPI Canvas 2D arcade game with procedural Web Audio SFX, keyboard/touch controls, and YulyaSDK Leaderboard support.",
            "stack": ["Canvas 2D", "Web Audio", "YulyaSDK"],
            "accent": "#06b6d4",
        },
        {
            "id": "react-ts-tailwind",
            "title": "React + TypeScript + Tailwind",
            "category": "WEB APP",
            "genre": "TOOL",
            "badge": "esbuild-wasm",
            "description": "Modern React 18 & TypeScript (.tsx) starter compiled live in your browser via esbuild-wasm with zero server wait.",
            "stack": ["React 18", "TypeScript", "Tailwind"],
            "accent": "#38bdf8",
        },
        {
            "id": "threejs-3d",
            "title": "3D Crystal Orbit (Three.js)",
            "category": "3D",
            "genre": "3D",
            "badge": "WebGL ESM",
            "description": "Interactive Three.js 3D scene loaded via ESM import maps with orbital pointer controls and glowing particle field.",
            "stack": ["Three.js", "WebGL", "ESM"],
            "accent": "#a855f7",
        },
        {
            "id": "glsl-shader",
            "title": "Aurora WebGL2 Shader Lab",
            "category": "SHADERS",
            "genre": "EXPERIMENT",
            "badge": "GLSL",
            "description": "Interactive fullscreen WebGL2 fragment shader playground reacting live to pointer movement and time.",
            "stack": ["WebGL2", "GLSL", "Canvas"],
            "accent": "#ec4899",
        },
        {
            "id": "phaser-platformer",
            "title": "Phaser 3 Coin Runner",
            "category": "GAME",
            "genre": "PLATFORMER",
            "badge": "Phaser 3",
            "description": "Instant Phaser 3 arcade physics starter with procedural platforms, jumping, coin pickups, and score HUD.",
            "stack": ["Phaser 3", "Physics", "Arcade"],
            "accent": "#f59e0b",
        },
        {
            "id": "landing-page",
            "title": "Modern Developer Launch Page",
            "category": "WEB APP",
            "genre": "WEBSITE",
            "badge": "Responsive",
            "description": "Sleek, responsive dark-mode product landing page with interactive feature tabs and clean CSS tokens.",
            "stack": ["HTML5", "Modern CSS", "Vanilla JS"],
            "accent": "#10b981",
        },
        {
            "id": "interactive-tool",
            "title": "Interactive Color & Gradient Lab",
            "category": "TOOL",
            "genre": "TOOL",
            "badge": "Utility",
            "description": "Interactive CSS gradient & palette generator web tool with live preview and one-click CSS copy.",
            "stack": ["HTML5", "CSS Variables", "Clipboard API"],
            "accent": "#6366f1",
        },
    ]


def build_template_files(template_id: str, title: str) -> dict[str, str]:
    safe_title = html_lib.escape(title.strip() or "Untitled Project", quote=True)
    tid = (template_id or "blank").strip().lower()

    if tid == "canvas-arcade":
        return {
            "index.html": f"""<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>{safe_title}</title>
  <link rel="stylesheet" href="style.css">
</head>
<body>
  <canvas id="game"></canvas>
  <div id="hud" class="hud hidden">
    <span>SCORE <b id="score">0</b></span>
    <span>BEST <b id="best">0</b></span>
  </div>
  <div id="overlay" class="overlay">
    <h1>{safe_title}</h1>
    <p>Move with Arrow keys / WASD or drag on screen. Collect cyan orbs, dodge crimson meteors.</p>
    <button id="btn-start">PLAY NOW</button>
  </div>
  <script src="app.js"></script>
</body>
</html>""",
            "style.css": """* { box-sizing: border-box; margin: 0; padding: 0; }
html, body { width: 100%; height: 100%; overflow: hidden; background: #070912; color: #f8fafc; font-family: system-ui, -apple-system, sans-serif; }
canvas { display: block; width: 100%; height: 100%; touch-action: none; }
.hud { position: fixed; top: 16px; left: 16px; right: 16px; display: flex; justify-content: space-between; font-size: 14px; letter-spacing: 0.08em; pointer-events: none; }
.hud b { color: #38bdf8; font-size: 18px; margin-left: 6px; }
.overlay { position: fixed; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 16px; background: rgba(7,9,18,0.82); backdrop-filter: blur(8px); text-align: center; padding: 24px; }
.overlay h1 { font-size: clamp(28px, 5vw, 48px); background: linear-gradient(135deg, #38bdf8, #a78bfa); -webkit-background-clip: text; color: transparent; }
.overlay p { max-width: 420px; color: #94a3b8; line-height: 1.5; }
.overlay button { padding: 12px 32px; border: none; border-radius: 999px; font-weight: 700; font-size: 15px; background: linear-gradient(135deg, #06b6d4, #8b5cf6); color: #fff; cursor: pointer; box-shadow: 0 10px 30px rgba(6,182,212,0.35); }
.hidden { display: none !important; }""",
            "app.js": """const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const overlay = document.getElementById('overlay');
const hud = document.getElementById('hud');
const scoreEl = document.getElementById('score');
const bestEl = document.getElementById('best');
const startBtn = document.getElementById('btn-start');

let W = 0, H = 0, running = false, score = 0, best = Number(localStorage.getItem('yulya_best') || 0);
bestEl.textContent = best;
const keys = {};
let player = { x: 200, y: 200, r: 14 };
let orbs = [], meteors = [], particles = [], last = 0, spawnTimer = 0;

let audioCtx = null;
function beep(freq, dur, type = 'sine') {
  try {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === 'suspended') audioCtx.resume();
    const osc = audioCtx.createOscillator(), gain = audioCtx.createGain();
    osc.type = type; osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.12, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + dur);
    osc.connect(gain); gain.connect(audioCtx.destination);
    osc.start(); osc.stop(audioCtx.currentTime + dur);
  } catch (_) {}
}

function resize() {
  const dpr = window.devicePixelRatio || 1;
  W = window.innerWidth; H = window.innerHeight;
  canvas.width = W * dpr; canvas.height = H * dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}
window.addEventListener('resize', resize);
resize();

window.addEventListener('keydown', (e) => { keys[e.key.toLowerCase()] = true; });
window.addEventListener('keyup', (e) => { keys[e.key.toLowerCase()] = false; });
canvas.addEventListener('pointermove', (e) => { if (running && e.buttons) { player.x = e.clientX; player.y = e.clientY; } });
canvas.addEventListener('pointerdown', (e) => { if (running) { player.x = e.clientX; player.y = e.clientY; } });

function burst(x, y, color) {
  for (let i = 0; i < 12; i++) {
    const a = Math.random() * Math.PI * 2, s = 60 + Math.random() * 140;
    particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 0.45, color });
  }
}

function startGame() {
  running = true; score = 0; scoreEl.textContent = '0';
  player = { x: W / 2, y: H * 0.72, r: 14 };
  orbs = []; meteors = []; particles = []; spawnTimer = 0;
  overlay.classList.add('hidden'); hud.classList.remove('hidden');
  beep(520, 0.12, 'triangle');
  last = performance.now();
  requestAnimationFrame(loop);
}

['click', 'pointerdown'].forEach((ev) => startBtn.addEventListener(ev, (e) => { e.preventDefault(); startGame(); }));

function endGame() {
  running = false;
  beep(150, 0.28, 'sawtooth');
  if (score > best) { best = score; localStorage.setItem('yulya_best', String(best)); bestEl.textContent = best; }
  if (window.YulyaSDK) window.YulyaSDK.submitScore(score);
  overlay.querySelector('h1').textContent = 'GAME OVER — ' + score;
  startBtn.textContent = 'PLAY AGAIN';
  overlay.classList.remove('hidden');
}

function loop(now) {
  if (!running) return;
  const dt = Math.min(0.05, (now - last) / 1000); last = now;
  const speed = 360;
  if (keys.arrowleft || keys.a) player.x -= speed * dt;
  if (keys.arrowright || keys.d) player.x += speed * dt;
  if (keys.arrowup || keys.w) player.y -= speed * dt;
  if (keys.arrowdown || keys.s) player.y += speed * dt;
  player.x = Math.max(player.r, Math.min(W - player.r, player.x));
  player.y = Math.max(player.r, Math.min(H - player.r, player.y));

  spawnTimer += dt;
  if (spawnTimer > 0.55) {
    spawnTimer = 0;
    meteors.push({ x: Math.random() * W, y: -20, vy: 150 + Math.random() * 140 + score * 2, r: 12 + Math.random() * 14 });
    if (orbs.length < 4) orbs.push({ x: 30 + Math.random() * (W - 60), y: 30 + Math.random() * (H - 60), r: 10 });
  }

  ctx.fillStyle = 'rgba(7, 9, 18, 0.35)';
  ctx.fillRect(0, 0, W, H);

  for (let i = orbs.length - 1; i >= 0; i--) {
    const o = orbs[i];
    ctx.beginPath(); ctx.arc(o.x, o.y, o.r, 0, Math.PI * 2);
    ctx.fillStyle = '#22d3ee'; ctx.shadowColor = '#22d3ee'; ctx.shadowBlur = 14; ctx.fill(); ctx.shadowBlur = 0;
    if (Math.hypot(o.x - player.x, o.y - player.y) < o.r + player.r) {
      orbs.splice(i, 1); score += 10; scoreEl.textContent = score;
      beep(780, 0.09, 'sine'); burst(o.x, o.y, '#22d3ee');
    }
  }

  for (let i = meteors.length - 1; i >= 0; i--) {
    const m = meteors[i]; m.y += m.vy * dt;
    ctx.beginPath(); ctx.arc(m.x, m.y, m.r, 0, Math.PI * 2);
    ctx.fillStyle = '#f43f5e'; ctx.shadowColor = '#f43f5e'; ctx.shadowBlur = 12; ctx.fill(); ctx.shadowBlur = 0;
    if (Math.hypot(m.x - player.x, m.y - player.y) < m.r + player.r - 2) { burst(player.x, player.y, '#f43f5e'); endGame(); return; }
    if (m.y > H + 40) meteors.splice(i, 1);
  }

  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i]; p.x += p.vx * dt; p.y += p.vy * dt; p.life -= dt;
    ctx.globalAlpha = Math.max(0, p.life * 2);
    ctx.fillStyle = p.color; ctx.fillRect(p.x - 2, p.y - 2, 4, 4);
    ctx.globalAlpha = 1;
    if (p.life <= 0) particles.splice(i, 1);
  }

  ctx.beginPath(); ctx.arc(player.x, player.y, player.r, 0, Math.PI * 2);
  ctx.fillStyle = '#a78bfa'; ctx.shadowColor = '#8b5cf6'; ctx.shadowBlur = 18; ctx.fill(); ctx.shadowBlur = 0;
  requestAnimationFrame(loop);
}""",
        }

    if tid == "react-ts-tailwind":
        return {
            "index.html": f"""<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>{safe_title}</title>
  <script src="https://cdn.jsdelivr.net/npm/@tailwindcss/browser@4"></script>
</head>
<body class="bg-slate-950 text-slate-100 min-h-screen antialiased">
  <div id="root"></div>
  <script type="module" src="main.tsx"></script>
</body>
</html>""",
            "main.tsx": """import React from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'

const root = document.getElementById('root')
if (root) {
  createRoot(root).render(<App />)
}
""",
            "App.tsx": f"""import React, {{ useState }} from 'react'

export default function App() {{
  const [count, setCount] = useState<number>(0)
  const [items, setItems] = useState<string[]>(['TypeScript compiled in-browser', 'React 18 + Tailwind v4', 'Zero server build wait'])
  const [draft, setDraft] = useState<string>('')

  const addItem = (e: React.FormEvent) => {{
    e.preventDefault()
    if (!draft.trim()) return
    setItems((prev) => [draft.trim(), ...prev])
    setDraft('')
  }}

  return (
    <main className="max-w-xl mx-auto px-6 py-14 space-y-8">
      <header className="space-y-2">
        <span className="inline-block text-xs font-semibold uppercase tracking-widest px-3 py-1 rounded-full bg-violet-500/20 text-violet-300 border border-violet-500/30">
          Yulya Studio · React + TS
        </span>
        <h1 className="text-3xl font-bold tracking-tight">{safe_title}</h1>
        <p className="text-slate-400">Edit <code>App.tsx</code> and watch esbuild-wasm compile live in milliseconds.</p>
      </header>

      <section className="p-6 rounded-2xl bg-slate-900 border border-slate-800 flex items-center justify-between">
        <div>
          <p className="text-sm text-slate-400">Interactive Counter</p>
          <p className="text-4xl font-bold text-cyan-400">{{count}}</p>
        </div>
        <div className="flex gap-2">
          <button onClick={{() => setCount((c) => c - 1)}} className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 font-semibold">-1</button>
          <button onClick={{() => setCount((c) => c + 1)}} className="px-4 py-2 rounded-xl bg-violet-600 hover:bg-violet-500 font-semibold">+1</button>
        </div>
      </section>

      <section className="p-6 rounded-2xl bg-slate-900 border border-slate-800 space-y-4">
        <form onSubmit={{addItem}} className="flex gap-2">
          <input
            value={{draft}}
            onChange={{(e) => setDraft(e.target.value)}}
            placeholder="Add a feature idea..."
            className="flex-1 px-4 py-2 rounded-xl bg-slate-950 border border-slate-700 focus:outline-none focus:border-violet-500"
          />
          <button type="submit" className="px-4 py-2 rounded-xl bg-cyan-600 hover:bg-cyan-500 font-semibold">Add</button>
        </form>
        <ul className="space-y-2">
          {{items.map((item, i) => (
            <li key={{i}} className="px-4 py-2.5 rounded-xl bg-slate-950/70 border border-slate-800 text-sm text-slate-200">{{item}}</li>
          ))}}
        </ul>
      </section>
    </main>
  )
}}
""",
        }

    if tid == "threejs-3d":
        return {
            "index.html": f"""<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>{safe_title}</title>
  <style>html,body{{margin:0;height:100%;overflow:hidden;background:#05060f;}}#label{{position:fixed;bottom:16px;left:16px;color:#cbd5e1;font:13px system-ui;opacity:.8;}}</style>
</head>
<body>
  <div id="label">{safe_title} — Drag or move pointer to orbit</div>
  <script type="module" src="app.js"></script>
</body>
</html>""",
            "app.js": """import * as THREE from 'https://esm.sh/three@0.170.0';

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(60, innerWidth / innerHeight, 0.1, 100);
camera.position.z = 5;

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
document.body.appendChild(renderer.domElement);

const crystal = new THREE.Mesh(
  new THREE.IcosahedronGeometry(1.3, 1),
  new THREE.MeshStandardMaterial({ color: 0x8b5cf6, emissive: 0x2e1065, roughness: 0.2, metalness: 0.7, flatShading: true })
);
scene.add(crystal);

const ring = new THREE.Mesh(
  new THREE.TorusGeometry(2.1, 0.04, 16, 100),
  new THREE.MeshBasicMaterial({ color: 0x38bdf8 })
);
ring.rotation.x = Math.PI / 3;
scene.add(ring);

const l1 = new THREE.PointLight(0x38bdf8, 30, 20); l1.position.set(4, 3, 4); scene.add(l1);
const l2 = new THREE.PointLight(0xec4899, 25, 20); l2.position.set(-4, -3, 3); scene.add(l2);
scene.add(new THREE.AmbientLight(0xffffff, 0.35));

let mx = 0, my = 0;
addEventListener('pointermove', (e) => { mx = (e.clientX / innerWidth - 0.5) * 2; my = (e.clientY / innerHeight - 0.5) * 2; });
addEventListener('resize', () => { camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight); });

function animate(t) {
  requestAnimationFrame(animate);
  crystal.rotation.y = t * 0.0007 + mx * 1.4;
  crystal.rotation.x = t * 0.0004 + my * 1.1;
  ring.rotation.z = -t * 0.001;
  renderer.render(scene, camera);
}
animate(0);
""",
        }

    if tid == "glsl-shader":
        return {
            "index.html": f"""<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>{safe_title}</title>
  <style>html,body,canvas{{margin:0;width:100%;height:100%;display:block;overflow:hidden;background:#000;}}</style>
</head>
<body>
  <canvas id="gl"></canvas>
  <script src="app.js"></script>
</body>
</html>""",
            "app.js": """const canvas = document.getElementById('gl');
const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
const vs = `attribute vec2 p; void main(){ gl_Position = vec4(p, 0.0, 1.0); }`;
const fs = `precision highp float;
uniform vec2 u_res; uniform float u_time; uniform vec2 u_mouse;
void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_res) / min(u_res.x, u_res.y);
  vec2 m = (u_mouse - 0.5) * 1.4;
  float d = length(uv - m);
  float wave = sin(uv.x * 5.0 + u_time) * cos(uv.y * 5.0 - u_time * 0.8);
  vec3 col = 0.5 + 0.5 * cos(u_time * 0.7 + uv.xyx * 2.5 + vec3(0.0, 2.0, 4.0) + wave);
  col += vec3(0.15, 0.45, 0.9) * exp(-d * 3.5);
  gl_FragColor = vec4(col * 0.85, 1.0);
}`;
function compile(type, src) {
  const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); return s;
}
const prog = gl.createProgram();
gl.attachShader(prog, compile(gl.VERTEX_SHADER, vs));
gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, fs));
gl.linkProgram(prog); gl.useProgram(prog);
const buf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buf);
gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 1,-1, -1,1, 1,1]), gl.STATIC_DRAW);
const loc = gl.getAttribLocation(prog, 'p'); gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
let mx = 0.5, my = 0.5;
addEventListener('pointermove', (e) => { mx = e.clientX / innerWidth; my = 1.0 - e.clientY / innerHeight; });
function render(t) {
  canvas.width = innerWidth; canvas.height = innerHeight;
  gl.viewport(0, 0, canvas.width, canvas.height);
  gl.uniform2f(gl.getUniformLocation(prog, 'u_res'), canvas.width, canvas.height);
  gl.uniform1f(gl.getUniformLocation(prog, 'u_time'), t * 0.001);
  gl.uniform2f(gl.getUniformLocation(prog, 'u_mouse'), mx, my);
  gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  requestAnimationFrame(render);
}
requestAnimationFrame(render);
""",
        }

    if tid == "phaser-platformer":
        return {
            "index.html": f"""<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>{safe_title}</title>
  <style>html,body{{margin:0;height:100%;overflow:hidden;background:#0b1020;display:grid;place-items:center;}}</style>
  <script src="https://cdn.jsdelivr.net/npm/phaser@3.87.0/dist/phaser.min.js"></script>
</head>
<body>
  <script src="app.js"></script>
</body>
</html>""",
            "app.js": """let player, cursors, coins, scoreText, score = 0;
new Phaser.Game({
  type: Phaser.AUTO, width: 800, height: 480, backgroundColor: '#0f172a',
  physics: { default: 'arcade', arcade: { gravity: { y: 650 }, debug: false } },
  scene: {
    create() {
      const g = this.add.graphics();
      g.fillStyle(0x334155); g.fillRect(0, 0, 200, 24); g.generateTexture('plat', 200, 24); g.clear();
      g.fillStyle(0xa78bfa); g.fillRoundedRect(0, 0, 28, 36, 6); g.generateTexture('hero', 28, 36); g.clear();
      g.fillStyle(0xfbbf24); g.fillCircle(10, 10, 10); g.generateTexture('coin', 20, 20); g.destroy();

      const platforms = this.physics.add.staticGroup();
      platforms.create(400, 468, 'plat').setScale(4, 1).refreshBody();
      platforms.create(200, 340, 'plat');
      platforms.create(580, 270, 'plat');
      platforms.create(320, 180, 'plat');

      player = this.physics.add.sprite(100, 380, 'hero').setBounce(0.1).setCollideWorldBounds(true);
      this.physics.add.collider(player, platforms);
      cursors = this.input.keyboard.createCursorKeys();

      coins = this.physics.add.group({ key: 'coin', repeat: 7, setXY: { x: 70, y: 40, stepX: 95 } });
      coins.children.iterate((c) => c.setBounceY(Phaser.Math.FloatBetween(0.3, 0.6)));
      this.physics.add.collider(coins, platforms);
      this.physics.add.overlap(player, coins, (_, c) => {
        c.disableBody(true, true); score += 10; scoreText.setText('Coins: ' + score);
        if (coins.countActive(true) === 0) coins.children.iterate((k) => k.enableBody(true, k.x, 20, true, true));
      });
      scoreText = this.add.text(16, 16, 'Coins: 0  (Arrow keys to move & jump)', { fontSize: '18px', fill: '#e2e8f0' });
    },
    update() {
      if (cursors.left.isDown) player.setVelocityX(-230);
      else if (cursors.right.isDown) player.setVelocityX(230);
      else player.setVelocityX(0);
      if (cursors.up.isDown && player.body.touching.down) player.setVelocityY(-430);
    }
  }
});
""",
        }

    if tid == "landing-page":
        return {
            "index.html": f"""<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>{safe_title}</title>
  <link rel="stylesheet" href="style.css">
</head>
<body>
  <header class="nav"><span class="logo">{safe_title}</span><a href="#features" class="cta">Get Started</a></header>
  <main class="hero">
    <span class="pill">Built live on Yulya Studio</span>
    <h1>Ship beautiful web experiences from your browser.</h1>
    <p>Customize this responsive landing page with clean CSS variables, interactive cards, and zero build friction.</p>
    <div class="actions"><button id="demoBtn" class="primary">Try Interactive Counter (<span id="clicks">0</span>)</button></div>
  </main>
  <section id="features" class="grid">
    <article class="card"><h3>Fast by default</h3><p>Clean semantic HTML and zero bloat.</p></article>
    <article class="card"><h3>Responsive layout</h3><p>Adapts seamlessly from mobile phones to ultrawide monitors.</p></article>
    <article class="card"><h3>Instant share link</h3><p>Publish to the Arcade or embed anywhere with one click.</p></article>
  </section>
  <script src="app.js"></script>
</body>
</html>""",
            "style.css": """* { box-sizing: border-box; margin: 0; padding: 0; }
body { font-family: system-ui, -apple-system, sans-serif; background: #090b12; color: #f1f5f9; min-height: 100vh; }
.nav { display: flex; justify-content: space-between; align-items: center; padding: 20px 8%; border-bottom: 1px solid #1e293b; }
.logo { font-weight: 800; letter-spacing: -0.02em; }
.cta { color: #fff; text-decoration: none; padding: 8px 16px; border-radius: 999px; background: #7c3aed; font-size: 14px; font-weight: 600; }
.hero { max-width: 780px; margin: 72px auto 48px; text-align: center; padding: 0 24px; }
.pill { display: inline-block; padding: 6px 14px; border-radius: 999px; background: rgba(124,58,237,.18); color: #c4b5fd; font-size: 12px; font-weight: 600; margin-bottom: 18px; }
.hero h1 { font-size: clamp(32px, 6vw, 56px); line-height: 1.08; margin-bottom: 18px; }
.hero p { color: #94a3b8; font-size: 18px; line-height: 1.6; margin-bottom: 28px; }
.primary { padding: 14px 26px; border: none; border-radius: 12px; background: linear-gradient(135deg, #7c3aed, #06b6d4); color: #fff; font-weight: 700; font-size: 15px; cursor: pointer; }
.grid { max-width: 960px; margin: 0 auto 72px; padding: 0 24px; display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 18px; }
.card { background: #111625; border: 1px solid #1e293b; border-radius: 16px; padding: 24px; }
.card h3 { margin-bottom: 8px; }
.card p { color: #94a3b8; font-size: 14px; line-height: 1.5; }""",
            "app.js": """let n = 0;
document.getElementById('demoBtn').addEventListener('click', () => {
  n += 1;
  document.getElementById('clicks').textContent = String(n);
});""",
        }

    if tid == "interactive-tool":
        return {
            "index.html": f"""<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>{safe_title}</title>
  <link rel="stylesheet" href="style.css">
</head>
<body>
  <div class="panel">
    <h1>{safe_title}</h1>
    <div id="swatch" class="swatch"></div>
    <div class="controls">
      <label>Color 1 <input id="c1" type="color" value="#7c3aed"></label>
      <label>Color 2 <input id="c2" type="color" value="#06b6d4"></label>
      <label>Angle <input id="ang" type="range" min="0" max="360" value="135"></label>
    </div>
    <pre id="cssOut"></pre>
    <button id="copyBtn">Copy CSS</button>
  </div>
  <script src="app.js"></script>
</body>
</html>""",
            "style.css": """* { box-sizing: border-box; margin: 0; padding: 0; }
body { min-height: 100vh; display: grid; place-items: center; background: #090b12; color: #f8fafc; font-family: system-ui, sans-serif; padding: 24px; }
.panel { width: min(520px, 100%); background: #111625; border: 1px solid #1e293b; border-radius: 20px; padding: 24px; display: flex; flex-direction: column; gap: 16px; }
.swatch { height: 180px; border-radius: 14px; border: 1px solid rgba(255,255,255,0.12); }
.controls { display: flex; flex-wrap: wrap; gap: 14px; align-items: center; }
label { display: flex; align-items: center; gap: 8px; font-size: 13px; color: #cbd5e1; }
pre { background: #070912; border: 1px solid #1e293b; padding: 12px; border-radius: 10px; font-size: 13px; overflow-x: auto; color: #38bdf8; }
button { padding: 12px; border: none; border-radius: 12px; background: #7c3aed; color: #fff; font-weight: 700; cursor: pointer; }""",
            "app.js": """const c1 = document.getElementById('c1'), c2 = document.getElementById('c2'), ang = document.getElementById('ang');
const swatch = document.getElementById('swatch'), out = document.getElementById('cssOut'), copyBtn = document.getElementById('copyBtn');
function render() {
  const css = `background: linear-gradient(${ang.value}deg, ${c1.value}, ${c2.value});`;
  swatch.style.cssText = css;
  out.textContent = css;
}
[c1, c2, ang].forEach((el) => el.addEventListener('input', render));
copyBtn.addEventListener('click', () => {
  navigator.clipboard?.writeText(out.textContent);
  copyBtn.textContent = 'Copied!';
  setTimeout(() => { copyBtn.textContent = 'Copy CSS'; }, 1200);
});
render();""",
        }

    # Default: blank
    return {
        "index.html": f"""<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>{safe_title}</title>
  <link rel="stylesheet" href="style.css">
</head>
<body>
  <main class="stage">
    <h1>{safe_title}</h1>
    <p>Start editing <code>index.html</code>, <code>style.css</code>, or <code>app.js</code> — or ask Copilot to build something amazing.</p>
  </main>
  <script src="app.js"></script>
</body>
</html>""",
        "style.css": """* { box-sizing: border-box; margin: 0; padding: 0; }
body { min-height: 100vh; display: grid; place-items: center; background: #0a0c14; color: #f8fafc; font-family: system-ui, -apple-system, sans-serif; padding: 24px; }
.stage { text-align: center; max-width: 520px; }
h1 { font-size: 2rem; margin-bottom: 12px; }
p { color: #94a3b8; line-height: 1.6; }
code { background: rgba(139,92,246,0.18); color: #c4b5fd; padding: 2px 6px; border-radius: 6px; }""",
        "app.js": """console.log('Yulya Studio project ready!');\n""",
    }
