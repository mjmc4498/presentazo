// Pruebas del modo aire (remote/air.js): ejes según la postura del celular, suavizado y zona muerta.
//
//   npm run test:air
//
// Se simulan eventos de giroscopio como los que entrega el navegador (rotationRate en °/s).

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

// air.js es un script de navegador: se carga igual, en un contexto con `self`.
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sandbox = { self: {} };
vm.runInNewContext(fs.readFileSync(path.join(ROOT, 'remote', 'air.js'), 'utf8'), sandbox);
const Air = sandbox.self.PresentazoAir;

const results = [];
const check = (name, ok, detail = '') => {
  results.push(ok);
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
};
const near = (a, b, tol) => Math.abs(a - b) <= tol;

// Simula `seconds` de giro constante (rates en °/s en los ejes del celular) y suma el movimiento.
function spin({ beta = 0, gamma = 0 }, rates, seconds = 1, { sens = 1, noise = 0 } = {}) {
  let sx = 0;
  let sy = 0;
  const air = Air.create({ emit: (dx, dy) => { sx += dx; sy += dy; }, sens: () => sens });
  air.orientation({ beta, gamma });
  air.start();
  const steps = Math.round(seconds / 0.016);
  for (let i = 0; i < steps; i++) {
    const n = noise ? (i % 2 ? noise : -noise) : 0;
    air.motion({ interval: 16, rotationRate: { alpha: (rates.z || 0) + n, beta: (rates.x || 0) + n, gamma: (rates.y || 0) + n } });
  }
  return { sx, sy };
}

// ---- vector «hacia arriba»
const flat = Air.upVector(0, 0);
check('Celular plano: arriba es el eje z', near(flat[0], 0, 1e-9) && near(flat[1], 0, 1e-9) && near(flat[2], 1, 1e-9));
const upright = Air.upVector(90, 0);
check('Celular de pie: arriba es el eje y', near(upright[0], 0, 1e-9) && near(upright[1], 1, 1e-9) && near(upright[2], 0, 1e-9));

// ---- postura plana (como un control remoto sobre la mesa)
{
  const r = spin({ beta: 0, gamma: 0 }, { z: -30 }); // giro horario visto desde arriba = apuntar a la derecha
  check('Plano: girar a la derecha mueve el puntero a la derecha', r.sx > 0.1 && near(r.sy, 0, 0.005), `dx=${r.sx.toFixed(3)} dy=${r.sy.toFixed(3)}`);
  const l = spin({ beta: 0, gamma: 0 }, { z: 30 });
  check('Plano: girar a la izquierda lo mueve a la izquierda', l.sx < -0.1);
  const up = spin({ beta: 0, gamma: 0 }, { x: 20 }); // levantar el borde superior
  check('Plano: levantar la punta mueve el puntero hacia arriba', up.sy < -0.05 && near(up.sx, 0, 0.005), `dy=${up.sy.toFixed(3)}`);
}

// ---- postura de pie (como una cámara): el giro a los lados es alrededor del eje y del celular
{
  const r = spin({ beta: 90, gamma: 0 }, { y: -30 });
  check('De pie: girar a la derecha mueve el puntero a la derecha', r.sx > 0.1 && near(r.sy, 0, 0.005), `dx=${r.sx.toFixed(3)}`);
  const wrong = spin({ beta: 90, gamma: 0 }, { z: -30 }); // girar la pantalla sobre sí misma no es apuntar
  check('De pie: girar la pantalla sobre sí misma no mueve el puntero', near(wrong.sx, 0, 0.01) && near(wrong.sy, 0, 0.01), `dx=${wrong.sx.toFixed(3)}`);
}

// ---- postura inclinada 45°: el mismo giro real da el mismo resultado
{
  const flatYaw = spin({ beta: 0, gamma: 0 }, { z: -30 });
  const a = (45 * Math.PI) / 180;
  const up = Air.upVector(45, 0);
  // Un giro de -30°/s alrededor de la vertical expresado en los ejes del celular inclinado
  const tilted = spin({ beta: 45, gamma: 0 }, { x: -30 * up[0], y: -30 * up[1], z: -30 * up[2] });
  check('Inclinado 45°: el giro a la derecha rinde igual que con el celular plano', near(tilted.sx, flatYaw.sx, flatYaw.sx * 0.08), `plano=${flatYaw.sx.toFixed(3)} inclinado=${tilted.sx.toFixed(3)}`);
  check('Inclinado 45°: no aparece movimiento vertical', near(tilted.sy, 0, 0.01), `dy=${tilted.sy.toFixed(3)}`);
  void a;
}

// ---- celular torcido (inclinado de lado 40°): el giro vertical sigue siendo solo horizontal
{
  const up = Air.upVector(0, 40);
  const r = spin({ beta: 0, gamma: 40 }, { x: -30 * up[0], y: -30 * up[1], z: -30 * up[2] });
  const ref = spin({ beta: 0, gamma: 0 }, { z: -30 });
  check('Torcido 40°: el movimiento sigue siendo horizontal', r.sx > 0.1 && near(r.sy, 0, 0.012), `dx=${r.sx.toFixed(3)} dy=${r.sy.toFixed(3)}`);
  check('Torcido 40°: recorre lo mismo que con el celular derecho', near(r.sx, ref.sx, ref.sx * 0.1), `ref=${ref.sx.toFixed(3)}`);
}

// ---- sin datos de orientación se comporta como plano
{
  let sx = 0;
  const air = Air.create({ emit: (dx) => { sx += dx; } });
  air.start();
  for (let i = 0; i < 60; i++) air.motion({ interval: 16, rotationRate: { alpha: -30, beta: 0, gamma: 0 } });
  check('Sin orientación: se supone el celular plano', sx > 0.1 && !air.hasOrientation, `dx=${sx.toFixed(3)}`);
}

// ---- zona muerta y temblor
{
  const still = spin({ beta: 0, gamma: 0 }, { z: 0.6, x: -0.5 }, 2);
  check('Zona muerta: el ruido del sensor no mueve el puntero', still.sx === 0 && still.sy === 0);
  const shake = spin({ beta: 0, gamma: 0 }, {}, 2, { noise: 6 }); // ±6°/s alternando cada evento
  const rawTravel = 2 / 0.016 * (6 * 0.016) / Air.DEGREES_PER_WIDTH; // sin filtro recorrería esto en total
  check('Filtro: el temblor rápido casi no mueve el puntero', Math.abs(shake.sx) < rawTravel * 0.05 && Math.abs(shake.sy) < rawTravel * 0.05, `dx=${shake.sx.toFixed(4)} (sin filtro, hasta ${rawTravel.toFixed(2)} de ida y vuelta)`);
}

// ---- aceleración y sensibilidad
{
  const slow = spin({}, { z: -10 }, 1);
  const fast = spin({}, { z: -80 }, 1);
  check('Curva: el giro rápido recorre más que proporcional', fast.sx / slow.sx > 8.5, `x${(fast.sx / slow.sx).toFixed(1)} con 8× la velocidad`);
  check('Curva: el giro lento conserva precisión (ganancia baja)', Air.gainCurve(5) < 0.9 && Air.gainCurve(120) > 1.95);
  const base = spin({}, { z: -30 }, 1, { sens: 1 });
  const high = spin({}, { z: -30 }, 1, { sens: 2 });
  check('La sensibilidad escala el movimiento', near(high.sx / base.sx, 2, 0.05), `x${(high.sx / base.sx).toFixed(2)}`);
}

// ---- tope por evento y unidades de iOS
{
  let max = 0;
  const air = Air.create({ emit: (dx, dy) => { max = Math.max(max, Math.abs(dx), Math.abs(dy)); } });
  air.start();
  for (let i = 0; i < 20; i++) air.motion({ interval: 50, rotationRate: { alpha: -2000, beta: 0, gamma: 0 } });
  check('Un pico del sensor no lanza el puntero fuera de la pantalla', max <= 0.1 + 1e-9, `máx ${max.toFixed(3)}`);

  let a = 0;
  let b = 0;
  const ms = Air.create({ emit: (dx) => { a += dx; } });
  const sec = Air.create({ emit: (dx) => { b += dx; } });
  ms.start();
  sec.start();
  for (let i = 0; i < 60; i++) {
    ms.motion({ interval: 16, rotationRate: { alpha: -30, beta: 0, gamma: 0 } });
    sec.motion({ interval: 0.016, rotationRate: { alpha: -30, beta: 0, gamma: 0 } });
  }
  check('El intervalo en segundos (iOS) rinde igual que en milisegundos', near(a, b, 1e-9));
  check('Sin giroscopio, motion() lo indica', Air.create({ emit() {} }).motion({}) === false);
}

const failed = results.filter((r) => !r).length;
console.log(`\n${results.length - failed}/${results.length} comprobaciones correctas`);
process.exit(failed ? 1 : 0);
