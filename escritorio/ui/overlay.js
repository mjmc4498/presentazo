// Presentazo para escritorio: capa del puntero.
// Dibuja el láser con estela, el foco, el lápiz, la pantalla negra y los avisos,
// igual que la extensión, pero sobre cualquier programa. Cuando no muestra nada
// avisa al proceso principal para que oculte la ventana.

const bridge = window.presentazo;

// Tamaños en 7 niveles (el 4 es el normal). Láser y lápiz en píxeles; el foco en vmin.
// Las mismas tablas usa el control del celular y la extensión de Chrome.
const LASER_PX = [10, 16, 20, 24, 29, 34, 46];
const SPOT_VMIN = [14, 22, 27, 32, 38, 44, 56];
const PEN_PX = [1.5, 2.5, 3, 4, 6, 9, 14];
const BASE_LEVEL = { s: 2, m: 4, l: 6 }; // equivalencia con los ajustes Pequeño / Mediano / Grande
const LEVELS = 7;

const settings = { laserColor: '#FF3B30', laserSize: 'm', spotSize: 'm' };
const levels = {}; // tamaños elegidos desde el celular (mandan sobre los Ajustes)

// Nivel (1 a 7) de una herramienta: el del celular si lo cambió; si no, el de los Ajustes.
function level(tool) {
  if (levels[tool]) return levels[tool];
  if (tool === 'pen') return 4;
  return BASE_LEVEL[settings[`${tool}Size`]] || 4;
}

const $ = (sel) => document.querySelector(sel);
const el = {
  ink: $('.ink'),
  trail: $('.trail'),
  black: $('.black'),
  spot: $('.spot'),
  laser: $('.laser'),
  pen: $('.pen'),
  demo: $('.demo'),
  toast: $('.toast'),
};
const inkCtx = el.ink.getContext('2d');
const trailCtx = el.trail.getContext('2d');

const pos = { x: innerWidth / 2, y: innerHeight / 2 };
const shown = { ...pos };
let mode = 'laser';
let down = false;
let black = false;
let inkColor = '#FF3B30';
let strokes = [];
let stroke = null;
let trail = [];
let raf = 0;
const timers = {};

// ---------------------------------------------------------------- ajustes

function applySettings() {
  const s = document.body.style;
  s.setProperty('--c', settings.laserColor);
  s.setProperty('--s', `${LASER_PX[level('laser') - 1]}px`);
  s.setProperty('--d', `${SPOT_VMIN[level('spot') - 1]}vmin`);
  s.setProperty('--pr', `${12 + PEN_PX[level('pen') - 1] * 1.5}px`);
  s.setProperty('--ink', inkColor);
}

function setSize({ which, level: value }) {
  if (!['laser', 'spot', 'pen'].includes(which)) return;
  levels[which] = Math.max(1, Math.min(LEVELS, Math.round(Number(value)) || 4));
  applySettings();
}

// Informa al celular dónde está el puntero (como fracción de la pantalla), sin saturar el canal.
let posAt = 0;
let posTimer = 0;
function reportPos(force = false) {
  const wait = 45 - (performance.now() - posAt);
  if (!force && wait > 0) {
    if (!posTimer) posTimer = setTimeout(() => { posTimer = 0; reportPos(true); }, wait);
    return;
  }
  clearTimeout(posTimer);
  posTimer = 0;
  posAt = performance.now();
  bridge.pos({ x: +(pos.x / innerWidth).toFixed(4), y: +(pos.y / innerHeight).toFixed(4), w: innerWidth, h: innerHeight });
}

function center() {
  pos.x = innerWidth / 2;
  pos.y = innerHeight / 2;
  shown.x = pos.x;
  shown.y = pos.y;
  animate();
  reportPos(true);
}

function resize() {
  const dpr = devicePixelRatio || 1;
  for (const [canvas, ctx] of [[el.ink, inkCtx], [el.trail, trailCtx]]) {
    canvas.width = Math.round(innerWidth * dpr);
    canvas.height = Math.round(innerHeight * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  pos.x = Math.min(pos.x, innerWidth - 1);
  pos.y = Math.min(pos.y, innerHeight - 1);
  redrawInk();
}

// ---------------------------------------------------------------- movimiento

function moveBy(dx, dy) {
  const scale = innerWidth;
  pos.x = Math.max(0, Math.min(innerWidth - 1, pos.x + dx * scale));
  pos.y = Math.max(0, Math.min(innerHeight - 1, pos.y + dy * scale));
  animate();
  reportPos();
}

function animate() {
  if (!raf) raf = requestAnimationFrame(tick);
}

function tick() {
  raf = 0;
  const k = mode === 'pen' ? 0.7 : 0.5;
  const ddx = pos.x - shown.x;
  const ddy = pos.y - shown.y;
  shown.x += ddx * k;
  shown.y += ddy * k;
  const settled = Math.abs(ddx) < 0.3 && Math.abs(ddy) < 0.3;
  if (settled) { shown.x = pos.x; shown.y = pos.y; }

  const t = `translate3d(${shown.x}px, ${shown.y}px, 0)`;
  el.laser.style.transform = t;
  el.spot.style.transform = t;
  el.pen.style.transform = t;

  const now = performance.now();
  if (mode === 'laser' && down) trail.push({ x: shown.x, y: shown.y, t: now });
  if (stroke) addInkPoint(shown.x, shown.y);
  drawTrail(now);

  if (!settled || trail.length) animate();
}

function drawTrail(now) {
  const ctx = trailCtx;
  ctx.clearRect(0, 0, innerWidth, innerHeight);
  const life = 260;
  trail = trail.filter((p) => now - p.t < life);
  if (trail.length < 2) return;
  const size = LASER_PX[level('laser') - 1];
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = settings.laserColor;
  for (let i = 1; i < trail.length; i++) {
    const a = trail[i - 1];
    const b = trail[i];
    const f = 1 - (now - b.t) / life;
    ctx.globalAlpha = f * 0.5;
    ctx.lineWidth = Math.max(1, size * 0.45 * f);
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

// ---------------------------------------------------------------- modos

function setMode(next) {
  if (stroke) endStroke();
  mode = next;
  down = false;
  el.laser.classList.remove('on');
  el.spot.classList.remove('on');
  el.pen.classList.remove('on');
  reportPos(true);
}

function autoHide(name, ms) {
  clearTimeout(timers[name]);
  timers[name] = setTimeout(() => {
    if (name === 'pen') el.pen.classList.remove('on');
    if (name === 'pointer') pointer({ a: 'up' });
  }, ms);
}

function pointer(cmd) {
  if (cmd.a === 'center') { center(); return; }
  if (cmd.a === 'move') {
    moveBy(cmd.dx, cmd.dy);
    if (mode === 'pen') { el.pen.classList.add('on'); autoHide('pen', 2500); }
    if (down) autoHide('pointer', 15000);
    return;
  }
  if (cmd.a === 'down') {
    clearTimeout(timers.up);
    down = true;
    if (mode === 'spot') el.spot.classList.add('on');
    else if (mode === 'pen') {
      el.pen.classList.add('on');
      clearTimeout(timers.pen);
      if (cmd.ink) beginStroke();
    } else {
      if (mode !== 'laser') setMode('laser');
      down = true;
      el.laser.classList.add('on');
    }
    autoHide('pointer', 15000);
    animate();
    return;
  }
  if (cmd.a === 'up') {
    down = false;
    if (stroke) endStroke();
    if (mode === 'pen') autoHide('pen', 2500);
    timers.up = setTimeout(() => {
      el.laser.classList.remove('on');
      el.spot.classList.remove('on');
    }, 220);
  }
}

// ---------------------------------------------------------------- tinta

function beginStroke() {
  stroke = { color: inkColor, width: PEN_PX[level('pen') - 1], pts: [] };
  strokes.push(stroke);
  addInkPoint(shown.x, shown.y);
}

function endStroke() {
  addInkPoint(pos.x, pos.y);
  stroke = null;
}

function addInkPoint(x, y) {
  const pts = stroke.pts;
  const p = [x / innerWidth, y / innerHeight];
  const last = pts[pts.length - 1];
  if (last && Math.abs(last[0] - p[0]) * innerWidth < 0.8 && Math.abs(last[1] - p[1]) * innerHeight < 0.8) return;
  pts.push(p);
  drawStroke(stroke, Math.max(0, pts.length - 3));
}

function drawStroke(s, from = 0) {
  const ctx = inkCtx;
  const pts = s.pts.map(([x, y]) => [x * innerWidth, y * innerHeight]);
  ctx.strokeStyle = s.color;
  ctx.fillStyle = s.color;
  ctx.lineWidth = s.width;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  if (pts.length === 1) {
    ctx.beginPath();
    ctx.arc(pts[0][0], pts[0][1], s.width / 2, 0, Math.PI * 2);
    ctx.fill();
    return;
  }
  ctx.beginPath();
  const start = Math.max(0, from);
  ctx.moveTo(pts[start][0], pts[start][1]);
  for (let i = start + 1; i < pts.length - 1; i++) {
    const mx = (pts[i][0] + pts[i + 1][0]) / 2;
    const my = (pts[i][1] + pts[i + 1][1]) / 2;
    ctx.quadraticCurveTo(pts[i][0], pts[i][1], mx, my);
  }
  const last = pts[pts.length - 1];
  ctx.lineTo(last[0], last[1]);
  ctx.stroke();
}

function redrawInk() {
  inkCtx.clearRect(0, 0, innerWidth, innerHeight);
  for (const s of strokes) drawStroke(s);
}

function ink(cmd) {
  if (cmd.a === 'clear') { strokes = []; stroke = null; redrawInk(); }
  if (cmd.a === 'undo') { stroke = null; strokes.pop(); redrawInk(); }
  if (cmd.a === 'color' && /^#[0-9a-f]{6}$/i.test(cmd.color || '')) { inkColor = cmd.color; applySettings(); }
}

// ---------------------------------------------------------------- pantalla negra, avisos y prueba

function toast(text) {
  el.toast.querySelector('span').textContent = String(text || '').slice(0, 120);
  el.toast.classList.add('on');
  clearTimeout(timers.toast);
  timers.toast = setTimeout(() => el.toast.classList.remove('on'), 2600);
}

function demo(text) {
  el.demo.querySelector('span').textContent = text || 'Aquí aparecerá tu puntero';
  pos.x = innerWidth / 2;
  pos.y = innerHeight / 2 + 70;
  shown.x = pos.x;
  shown.y = pos.y;
  el.demo.classList.add('on');
  el.laser.classList.add('on');
  animate();
  clearTimeout(timers.demo);
  timers.demo = setTimeout(() => {
    el.demo.classList.remove('on');
    if (!down) el.laser.classList.remove('on');
  }, 2200);
}

// ---------------------------------------------------------------- órdenes

bridge.onCommand((cmd) => {
  idleReported = false;
  switch (cmd?.t) {
    case 'settings':
      for (const k of ['laserColor', 'laserSize', 'spotSize']) if (cmd[k]) settings[k] = cmd[k];
      applySettings();
      break;
    case 'mode':
      setMode(cmd.mode);
      break;
    case 'ptr':
      pointer(cmd);
      break;
    case 'ink':
      ink(cmd);
      break;
    case 'size':
      setSize(cmd);
      break;
    case 'black':
      black = !!cmd.on;
      el.black.classList.toggle('on', black);
      break;
    case 'toast':
      toast(cmd.text);
      break;
    case 'demo':
      demo(cmd.text);
      break;
  }
});

// ---------------------------------------------------------------- ventana vacía

let idleReported = false;
let idleSince = 0;

const busy = () =>
  down || black || strokes.length > 0 ||
  ['laser', 'spot', 'pen', 'demo', 'toast'].some((k) => el[k].classList.contains('on'));

setInterval(() => {
  if (busy()) { idleSince = 0; return; }
  if (!idleSince) idleSince = Date.now();
  // Se espera a que terminen las transiciones de salida.
  if (!idleReported && Date.now() - idleSince > 1200) {
    idleReported = true;
    bridge.idle();
  }
}, 400);

addEventListener('resize', resize);
resize();
applySettings();
bridge.ready();
