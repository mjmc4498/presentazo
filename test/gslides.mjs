// Prueba manual con una presentación REAL de Google Slides (necesita internet).
//
//   npm run serve          (otra terminal)
//   npm run test:slides
//
// Abre una presentación pública, la inicia en modo presentación con la extensión de verdad
// (solo con el permiso activeTab) y comprueba, desde un celular conectado, que:
//   · la miniatura de la diapositiva SIGUIENTE aparece desde la primera, sin haberla visitado;
//   · cambia al pasar de diapositiva y en la última dice «Última diapositiva».
// No forma parte de la prueba automática de GitHub porque depende de Google.
//
//   DECK=<id>   otra presentación pública (por defecto, una plantilla de 12 diapositivas)

import puppeteer from 'puppeteer';

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BASE = process.env.BASE || 'http://localhost:8765';
const DECK = process.env.DECK || '1hdL63zAVk0KAt_JrhJXrUBI_FCgKQqTd';
const OUT = path.join(ROOT, 'test', 'out');
fs.mkdirSync(OUT, { recursive: true });

const results = [];
const check = (name, ok, detail = '') => {
  results.push(ok);
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function waitFor(fn, { timeout = 15000, interval = 200 } = {}) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    try { const v = await fn(); if (v) return v; } catch {}
    await sleep(interval);
  }
  return null;
}

const browser = await puppeteer.launch({
  headless: true,
  pipe: true,
  enableExtensions: [path.join(ROOT, 'extension')],
  defaultViewport: { width: 1280, height: 800 },
  args: ['--lang=es'],
});

try {
  const swTarget = await browser.waitForTarget((t) => t.type() === 'service_worker' && t.url().endsWith('/background.js'), { timeout: 15000 });
  const extId = new URL(swTarget.url()).host;
  const ctl = (await waitFor(async () => (await browser.pages()).find((p) => p.url().includes('options.html')), { timeout: 8000 })) || (await browser.newPage());
  if (!ctl.url().includes('options.html')) await ctl.goto(`chrome-extension://${extId}/options.html`);
  const sw = (msg) => ctl.evaluate((m) => chrome.runtime.sendMessage({ to: 'sw', ...m }), msg);

  const deck = await browser.newPage();
  await deck.goto(`https://docs.google.com/presentation/d/${DECK}/edit`, { waitUntil: 'networkidle2', timeout: 60000 });
  await sleep(2500);
  check('Se abre la presentación de Google Slides', /Presentaciones de Google|Google Slides/.test(await deck.title()), await deck.title());

  // Pulsar el ícono de la extensión en esa pestaña (da acceso a ella con activeTab).
  await deck.bringToFront();
  const cdp = await browser.target().createCDPSession();
  const { targetInfos } = await cdp.send('Target.getTargets', { filter: [{ type: 'tab' }] });
  await cdp.send('Extensions.triggerAction', { id: extId, targetId: targetInfos.find((t) => t.url === deck.url()).targetId });
  await cdp.detach();
  await waitFor(async () => (await ctl.evaluate(() => chrome.storage.session.get('state'))).state?.status === 'ready', { timeout: 20000 });
  for (const p of await browser.pages()) if (p.url().includes('/popup.html')) await p.close().catch(() => {});
  await deck.bringToFront();

  const { identity } = await ctl.evaluate(() => chrome.storage.local.get('identity'));
  const phone = await (await browser.createBrowserContext()).newPage();
  await phone.setViewport({ width: 390, height: 844, isMobile: true, deviceScaleFactor: 2 });
  await phone.goto(`${BASE}/remote/#id=${identity.peerId}&k=${identity.token}`);
  check('El celular se conecta', !!(await waitFor(() => phone.evaluate(() => document.getElementById('app').dataset.conn === 'connected'), { timeout: 30000 })));

  // Iniciar el modo presentación desde el celular
  await phone.click('[data-nav="start"]');
  const presenting = await waitFor(() => deck.evaluate(() => !!document.querySelector('iframe.punch-present-iframe')), { timeout: 10000 });
  check('«Presentar» inicia el modo presentación', !!presenting);
  await deck.bringToFront();

  const peek = () => phone.evaluate(() => ({
    state: document.getElementById('peek').dataset.state,
    nextShown: !document.getElementById('peek-next').hidden,
    nextSrc: document.getElementById('peek-next').src || '',
    nextText: document.getElementById('peek-next-empty').textContent,
    nowShown: !document.getElementById('peek-now').hidden,
  }));
  const slideId = () => deck.evaluate(() => new URL(location.href).searchParams.get('slide'));

  const first = await waitFor(async () => { const p = await peek(); return p.state === 'ok' && p.nextShown ? p : null; }, { timeout: 25000 });
  check('Se ve la diapositiva siguiente desde la primera, sin haberla visitado', !!first, first ? '' : JSON.stringify(await peek()));
  const id1 = await slideId();
  check('Muestra también lo que está en pantalla', first?.nowShown === true, id1);
  const imgInfo = await phone.evaluate(() => { const i = document.getElementById('peek-next'); return { w: i.naturalWidth, h: i.naturalHeight, bytes: i.src.length }; });
  check('La miniatura de la siguiente es una imagen razonable (≤ 480 px, ≤ 60 KB)', imgInfo.w > 100 && imgInfo.w <= 480 && imgInfo.bytes < 60000, JSON.stringify(imgInfo));
  await phone.screenshot({ path: `${OUT}/gslides-celular-1.png` });
  await fs.promises.writeFile(`${OUT}/gslides-siguiente-1.jpg`, Buffer.from((await phone.evaluate(() => document.getElementById('peek-next').src)).split(',')[1], 'base64'));

  // Pasar de diapositiva: la siguiente cambia por la que viene después. Google tarda en dejar
  // lista la presentación y una tecla enviada antes se pierde: se reintenta hasta que cambie.
  const before = first.nextSrc;
  for (let i = 0; i < 4 && (await slideId()) === id1; i++) {
    await phone.click('#next');
    await waitFor(async () => (await slideId()) !== id1, { timeout: 3000 });
  }
  const changed = await waitFor(async () => { const p = await peek(); return p.nextShown && p.nextSrc && p.nextSrc !== before ? p : null; }, { timeout: 15000 });
  check('Al avanzar, «Siguiente» muestra la diapositiva que viene después', !!changed, `${id1} → ${await slideId()}`);
  await phone.screenshot({ path: `${OUT}/gslides-celular-2.png` });

  // Avanzar hasta la última diapositiva y comprobar el aviso
  let last = null;
  for (let i = 0; i < 40 && !last; i++) {
    await phone.click('#next');
    await sleep(900);
    const p = await peek();
    if (p.nextText === 'Última diapositiva') last = p;
  }
  check('En la última diapositiva el celular lo indica', !!last, JSON.stringify(await peek()));
  await phone.screenshot({ path: `${OUT}/gslides-celular-ultima.png` });
} catch (err) {
  check('Sin errores inesperados', false, err.stack || String(err));
} finally {
  await browser.close();
}

const failed = results.filter((r) => !r).length;
console.log(`\n${results.length - failed}/${results.length} comprobaciones correctas`);
process.exit(failed ? 1 : 0);
