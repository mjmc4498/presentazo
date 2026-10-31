// Presentazo — documento offscreen.
// Mantiene la conexión WebRTC (PeerJS) con los celulares, valida cada mensaje
// y lo reenvía al service worker, que lo entrega a la pestaña controlada.

/* global Peer */

import { ICE_ENDPOINT, FALLBACK_ICE } from './config.js';

const ICE_REFRESH_MS = 3 * 60 * 60 * 1000; // las credenciales duran 4 h

const devices = new Map();
let iceConfig = FALLBACK_ICE;
let identity = null;
let peer = null;
let stopped = false;
let retryTimer = 0;
let retryDelay = 1000;

// Vista previa: mientras algún celular la pida, se captura la pestaña cada pocos segundos
// y tras cada cambio de diapositiva, y solo se envía si la imagen cambió.
const PREVIEW_EVERY_MS = 2500;
let previewTimer = 0;
let capturing = false;
let lastThumb = null;
let lastThumbKey = '';
let lastThumbError = '';
let captureFailures = 0;
let thumbSeq = 0;
let lastNextKey = ''; // «actual>siguiente» ya enviado
let lastNextMsg = null;

const toSW = (msg) => chrome.runtime.sendMessage({ to: 'sw', ...msg }).catch(() => null);

function setStatus(status, error = null) {
  toSW({ type: 'status', status, error });
}

function publicDevices() {
  return [...devices.values()].map(({ id, name, since }) => ({ id, name, since }));
}

// ---------------------------------------------------------------- conexión con el servidor de señalización

function connect() {
  if (stopped) return;
  clearTimeout(retryTimer);
  setStatus('connecting');
  // debug: 0 — los avisos internos de PeerJS (p. ej. «Lost connection to server»)
  // se manejan abajo; si se imprimieran, Chrome los mostraría como errores.
  peer = new Peer(identity.peerId, { debug: 0, config: iceConfig });
  const current = peer;

  current.on('open', () => {
    retryDelay = 1000;
    setStatus('ready');
  });
  current.on('connection', onConnection);
  current.on('disconnected', () => {
    if (stopped || current.destroyed) return;
    scheduleRetry(() => { if (!current.destroyed && current.disconnected) current.reconnect(); });
  });
  current.on('error', (err) => {
    if (stopped) return;
    switch (err.type) {
      case 'unavailable-id':
        // El servidor aún no liberó el identificador (instancia anterior o
        // reconexión rápida). Si ya estuvo abierto, solo se reintenta la
        // reconexión: destruir el peer cortaría a los celulares conectados.
        setStatus('connecting');
        if (current.destroyed) scheduleRetry(connect);
        else scheduleRetry(() => { if (!current.destroyed && current.disconnected) current.reconnect(); });
        break;
      case 'browser-incompatible':
      case 'invalid-id':
      case 'invalid-key':
      case 'ssl-unavailable':
        setStatus('error', err.type);
        break;
      case 'network':
      case 'server-error':
      case 'socket-error':
      case 'socket-closed':
        // PeerJS emite 'disconnected' justo después; el error debe prevalecer.
        setTimeout(() => setStatus('error', 'network'), 0);
        if (current.destroyed) scheduleRetry(connect);
        else scheduleRetry(() => { if (!current.destroyed && current.disconnected) current.reconnect(); });
        break;
      default:
        console.debug('[Presentazo]', err.type, err.message);
    }
  });
}

function scheduleRetry(fn) {
  clearTimeout(retryTimer);
  retryTimer = setTimeout(fn, retryDelay);
  retryDelay = Math.min(retryDelay * 2, 15000);
}

// ---------------------------------------------------------------- dispositivos

function deviceName(raw) {
  const name = typeof raw === 'string' ? raw.replace(/[\u0000-\u001f<>]/g, '').trim() : '';
  return name.slice(0, 40) || 'Celular';
}

// El canal de datos pierde EN SILENCIO los mensajes de más de ~16 KB (se comprobó con 20, 32 y
// 48 KB: no llegan, y tampoco da error). Los grandes, como las miniaturas, se parten en trozos
// pequeños y el celular los vuelve a juntar.
const CHUNK_CHARS = 12000;
let chunkSeq = 0;

function send(conn, msg) {
  try {
    if (!conn.open) return;
    const text = JSON.stringify(msg);
    if (text.length <= CHUNK_CHARS) {
      conn.send(msg);
      return;
    }
    const k = ++chunkSeq;
    const n = Math.ceil(text.length / CHUNK_CHARS);
    for (let i = 0; i < n; i++) conn.send({ t: 'part', k, i, n, d: text.slice(i * CHUNK_CHARS, (i + 1) * CHUNK_CHARS) });
  } catch {}
}

function onConnection(conn) {
  const device = { id: conn.connectionId, name: 'Celular', since: Date.now(), conn, authed: false };
  const authTimer = setTimeout(() => { if (!device.authed) conn.close(); }, 10000);

  conn.on('data', async (raw) => {
    const msg = typeof raw === 'string' ? safeParse(raw) : raw;
    if (!msg || typeof msg !== 'object' || typeof msg.t !== 'string') return;

    if (!device.authed) {
      if (msg.t === 'hello' && typeof msg.k === 'string' && msg.k === identity.token) {
        clearTimeout(authTimer);
        device.authed = true;
        device.name = deviceName(msg.name);
        devices.set(device.id, device);
        const hello = await toSW({ type: 'welcome' });
        send(conn, { t: 'welcome', target: hello?.target ?? null, caps: hello?.caps, levels: hello?.levels, v: 2 });
        toSW({ type: 'devices', event: 'joined', device: { id: device.id, name: device.name }, devices: publicDevices() });
      } else {
        send(conn, { t: 'denied' });
        setTimeout(() => conn.close(), 300);
      }
      return;
    }

    if (msg.t === 'ping') {
      send(conn, { t: 'pong', ts: msg.ts });
      return;
    }
    if (msg.t === 'preview') {
      device.preview = msg.on === true;
      if (device.preview) {
        if (lastThumb) send(conn, thumbMessage(lastThumb));
        else if (lastThumbError) send(conn, { t: 'thumb', error: lastThumbError });
        if (lastNextMsg) send(conn, lastNextMsg);
      }
      updatePreview();
      return;
    }
    const cmd = clean(msg);
    if (!cmd) return;
    // Tras cambiar de diapositiva se actualiza la vista previa (la transición tarda un momento).
    if (cmd.t === 'nav' || (cmd.t === 'key' && cmd.k !== ' ') || (cmd.t === 'mouse' && cmd.a === 'click')) bumpPreview();
    const res = await toSW({ type: 'cmd', cmd });
    if (res?.reply) send(conn, res.reply);
  });

  conn.on('close', () => {
    clearTimeout(authTimer);
    if (devices.delete(device.id)) {
      toSW({ type: 'devices', event: 'left', device: { id: device.id, name: device.name }, devices: publicDevices() });
      updatePreview();
    }
  });
  conn.on('error', () => {});
}

function safeParse(text) {
  try { return JSON.parse(text); } catch { return null; }
}

// ---------------------------------------------------------------- validación de comandos

const NAV = new Set(['next', 'prev', 'first', 'last', 'start', 'exit', 'black', 'fullscreen']);
const MODES = new Set(['laser', 'spot', 'pen', 'mouse', 'none']);
const KEYS = new Set([
  'Enter', 'Backspace', 'Tab', 'Escape', 'Delete', ' ',
  'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Home', 'End', 'PageUp', 'PageDown',
]);

const num = (v, max) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.max(-max, Math.min(max, n)) : 0;
};

function clean(m) {
  switch (m.t) {
    case 'nav':
      return NAV.has(m.a) ? { t: 'nav', a: m.a } : null;
    case 'mode':
      return MODES.has(m.mode) ? { t: 'mode', mode: m.mode } : null;
    case 'size':
      return ['laser', 'spot', 'pen'].includes(m.which)
        ? { t: 'size', which: m.which, level: Math.max(1, Math.min(7, Math.round(num(m.level, 7)) || 4)) }
        : null;
    case 'ptr':
      return ['down', 'move', 'up', 'center'].includes(m.a)
        ? { t: 'ptr', a: m.a, dx: num(m.dx, 4), dy: num(m.dy, 4), ink: m.ink === true }
        : null;
    case 'mouse':
      return ['move', 'click', 'right', 'down', 'up'].includes(m.a)
        ? { t: 'mouse', a: m.a, dx: num(m.dx, 4), dy: num(m.dy, 4), n: m.n === 2 ? 2 : 1 }
        : null;
    case 'scroll':
      return { t: 'scroll', dx: num(m.dx, 4000), dy: num(m.dy, 4000) };
    case 'key':
      return KEYS.has(m.k) ? { t: 'key', k: m.k } : null;
    case 'text':
      return typeof m.s === 'string' && m.s.length ? { t: 'text', s: m.s.slice(0, 2000) } : null;
    case 'del':
      return { t: 'del', n: Math.max(1, Math.min(200, Math.trunc(num(m.n, 200)) || 1)) };
    case 'ink':
      if (!['clear', 'undo', 'color'].includes(m.a)) return null;
      return { t: 'ink', a: m.a, color: /^#[0-9a-f]{6}$/i.test(m.color) ? m.color : undefined };
    default:
      return null;
  }
}

// ---------------------------------------------------------------- vista previa

const thumbMessage = (t) => ({ t: 'thumb', n: thumbSeq, w: t.w, h: t.h, img: t.img });
const previewDevices = () => [...devices.values()].filter((d) => d.preview);

function updatePreview() {
  if (previewDevices().length) {
    if (!previewTimer) {
      previewTimer = setInterval(capture, PREVIEW_EVERY_MS);
      capture();
    } else if (!lastThumb) {
      capture();
    }
  } else {
    clearInterval(previewTimer);
    previewTimer = 0;
  }
}

// Pide al service worker una captura reducida de la pestaña controlada.
async function capture() {
  if (capturing || !previewDevices().length) return;
  capturing = true;
  try {
    const res = await toSW({ type: 'capture' });
    if (!res) return;
    if (res.error) {
      // Un fallo suelto de la captura es normal (límite de Chrome, ventana ocupada): se avisa
      // solo si se repite, y únicamente cuando cambia el motivo, no cada 2,5 s.
      if (res.error === 'fail' && ++captureFailures < 3) return;
      if (res.error !== lastThumbError) {
        lastThumbError = res.error;
        for (const d of previewDevices()) send(d.conn, { t: 'thumb', error: res.error });
      }
      return;
    }
    lastThumbError = '';
    captureFailures = 0;
    const key = `${res.img.length}:${res.img.slice(-48)}`;
    if (key === lastThumbKey) {
      // La pantalla no cambió: no se reenvía la imagen, solo se confirma que sigue igual
      // (el celular necesita saber que la diapositiva ya quedó estable).
      for (const d of previewDevices()) send(d.conn, { t: 'thumb', same: true, n: thumbSeq });
      return;
    }
    lastThumbKey = key;
    lastThumb = res;
    thumbSeq += 1;
    for (const d of previewDevices()) send(d.conn, thumbMessage(res));
  } finally {
    capturing = false;
    // Se consulta la siguiente en cada ciclo, también cuando la imagen no cambió.
    lookahead();
  }
}

// Diapositiva siguiente: solo la entrega Presentaciones de Google (la página la tiene dibujada en su
// panel de miniaturas). Se envía cuando cambia la diapositiva en pantalla; con otro programa no se
// envía nada y el celular aprende la siguiente viendo qué aparece tras cada «Siguiente».
async function lookahead() {
  if (!previewDevices().length) return;
  const res = await toSW({ type: 'lookahead' });
  if (!res?.cur) {
    if (lastNextKey) {
      lastNextKey = '';
      lastNextMsg = null;
      for (const d of previewDevices()) send(d.conn, { t: 'next', unavailable: true });
    }
    return;
  }
  const key = `${res.cur}>${res.next ?? ''}`;
  if (key === lastNextKey) return;
  lastNextKey = key;
  lastNextMsg = res.next
    ? { t: 'next', for: res.cur, id: res.next, w: res.w, h: res.h, img: res.img }
    : { t: 'next', for: res.cur, id: null };
  for (const d of previewDevices()) send(d.conn, lastNextMsg);
}

// Una captura a los 0,35 s (la transición empieza) y otra a los 1,25 s (la diapositiva ya quedó).
function bumpPreview() {
  if (!previewDevices().length) return;
  setTimeout(capture, 350);
  setTimeout(capture, 1250);
}

// ---------------------------------------------------------------- mensajes del service worker

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg?.to !== 'offscreen') return;
  switch (msg.type) {
    case 'pos': {
      // Lo envía el script de contenido de la pestaña controlada.
      if (sender.id !== chrome.runtime.id || !sender.tab || sender.frameId !== 0) return;
      const w = Number(msg.w);
      const h = Number(msg.h);
      if (!(w > 0 && h > 0)) return;
      const pos = { t: 'pos', x: num(msg.x, 1), y: num(msg.y, 1), w: Math.round(w), h: Math.round(h) };
      for (const d of devices.values()) send(d.conn, pos);
      break;
    }
    case 'broadcast':
      for (const d of devices.values()) send(d.conn, msg.msg);
      break;
    case 'kick': {
      const d = devices.get(msg.id);
      if (d) {
        send(d.conn, { t: 'bye', reason: 'kicked' });
        setTimeout(() => d.conn.close(), 200);
      }
      break;
    }
    case 'stop':
      stopped = true;
      clearTimeout(retryTimer);
      clearInterval(previewTimer);
      for (const d of devices.values()) send(d.conn, { t: 'bye', reason: msg.reason || 'stopped' });
      setTimeout(() => {
        try { peer?.destroy(); } catch {}
        sendResponse({ ok: true });
      }, 250);
      return true;
  }
});

// ---------------------------------------------------------------- retransmisión (TURN)

// Pide al Worker de Cloudflare credenciales temporales de retransmisión. Si no
// responde, se sigue con la conexión directa de siempre.
async function loadIce() {
  if (!ICE_ENDPOINT) return FALLBACK_ICE;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 4000);
  try {
    const res = await fetch(ICE_ENDPOINT, { signal: ctrl.signal, cache: 'no-store' });
    if (!res.ok) throw new Error(String(res.status));
    const data = await res.json();
    if (!Array.isArray(data.iceServers) || !data.iceServers.length) throw new Error('sin servidores');
    return { iceServers: data.iceServers };
  } catch (err) {
    console.debug('[Presentazo] retransmisión no disponible:', err.message);
    return FALLBACK_ICE;
  } finally {
    clearTimeout(timer);
  }
}

// Las credenciales caducan: se renuevan para las conexiones nuevas.
setInterval(async () => {
  iceConfig = await loadIce();
  if (peer && !peer.destroyed) peer.options.config = iceConfig;
}, ICE_REFRESH_MS);

// ---------------------------------------------------------------- inicio

(async () => {
  identity = await toSW({ type: 'identity' });
  if (!identity?.peerId) {
    setStatus('error', 'identity');
    return;
  }
  iceConfig = await loadIce();
  connect();
})();
