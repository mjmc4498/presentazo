// Presentazo: modo aire.
// Convierte el giro del celular en movimiento del puntero, como un control remoto.
//
// Mejoras respecto a usar el giroscopio «en crudo»:
//  · Los ejes se calculan respecto a la vertical real (con la inclinación del celular),
//    así funciona igual con el celular plano, inclinado o de pie y aunque esté un poco torcido.
//  · Un filtro adaptativo (1€) quita el temblor de la mano sin hacer lento el movimiento rápido.
//  · Zona muerta y curva de aceleración: lento = preciso, rápido = recorre la pantalla.
//
// Salida: fracciones del ancho de la pantalla (dx, dy), lo mismo que usa el resto del control.

(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.PresentazoAir = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const RAD = Math.PI / 180;
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

  // Grados de giro que recorren todo el ancho de la pantalla con sensibilidad 1 y velocidad baja.
  const DEGREES_PER_WIDTH = 38;
  const DEAD_ZONE = 1.1; // °/s por debajo de esto se considera quieto
  const MAX_STEP = 0.1; // tope por evento (fracción del ancho), contra picos del sensor

  // Dirección «hacia arriba» (opuesta a la gravedad) en los ejes del celular, a partir de
  // los ángulos de DeviceOrientation (beta, gamma en grados). Es igual en iOS y Android.
  function upVector(beta, gamma) {
    const b = beta * RAD;
    const g = gamma * RAD;
    return [-Math.cos(b) * Math.sin(g), Math.sin(b), Math.cos(b) * Math.cos(g)];
  }

  // Filtro 1€ (Casiez et al.): suaviza mucho a baja velocidad y poco a alta velocidad.
  function createOneEuro({ minCutoff = 1.4, beta = 0.015, dCutoff = 1 } = {}) {
    let x = null;
    let dx = 0;
    const alpha = (cutoff, dt) => 1 / (1 + 1 / (2 * Math.PI * cutoff) / dt);
    return {
      reset() { x = null; dx = 0; },
      filter(value, dt) {
        if (x === null) { x = value; dx = 0; return value; }
        dx += alpha(dCutoff, dt) * ((value - x) / dt - dx);
        x += alpha(minCutoff + beta * Math.abs(dx), dt) * (value - x);
        return x;
      },
    };
  }

  // Ganancia según la velocidad angular (°/s): 0,85× si es lenta, hasta 2× si es rápida.
  function gainCurve(speed) {
    return 0.85 + 1.15 * clamp((speed - 6) / 84, 0, 1);
  }

  // emit(dx, dy): recibe el movimiento. sens(): multiplicador de sensibilidad (1 = normal).
  function create({ emit, sens = () => 1 }) {
    const yawFilter = createOneEuro();
    const pitchFilter = createOneEuro();
    let up = [0, 0, 1]; // sin datos de orientación se supone el celular plano
    let hasOrientation = false;

    return {
      get hasOrientation() { return hasOrientation; },

      start() {
        yawFilter.reset();
        pitchFilter.reset();
      },

      // Evento deviceorientation: solo se usa la inclinación (beta, gamma).
      orientation(e) {
        if (e.beta == null || e.gamma == null) return;
        const target = upVector(e.beta, e.gamma);
        if (!hasOrientation) {
          up = target;
          hasOrientation = true;
          return;
        }
        // Se promedia despacio: la inclinación cambia lento y así no mete ruido.
        const mixed = up.map((v, i) => v + (target[i] - v) * 0.2);
        const n = Math.hypot(...mixed) || 1;
        up = mixed.map((v) => v / n);
      },

      // Evento devicemotion. Devuelve false si el celular no entrega el giroscopio.
      motion(e) {
        const r = e.rotationRate;
        if (!r) return false;
        let interval = e.interval || 16;
        if (interval < 1) interval *= 1000; // iOS lo informa en segundos
        const dt = clamp(interval, 4, 50) / 1000;

        // Velocidades angulares (°/s) en los ejes del celular: x = beta, y = gamma, z = alpha.
        const wx = r.beta || 0;
        const wy = r.gamma || 0;
        const wz = r.alpha || 0;
        const [ux, uy, uz] = up;

        // Giro a izquierda/derecha = giro alrededor de la vertical.
        const yaw = wx * ux + wy * uy + wz * uz;
        // Giro arriba/abajo = giro alrededor del eje horizontal del celular, sin la parte vertical.
        const rx = 1 - ux * ux;
        const ry = -ux * uy;
        const rz = -ux * uz;
        const pitch = (wx * rx + wy * ry + wz * rz) / Math.sqrt(Math.max(1 - ux * ux, 0.04));

        const fy = yawFilter.filter(yaw, dt);
        const fp = pitchFilter.filter(pitch, dt);
        const speed = Math.hypot(fy, fp);
        if (speed < DEAD_ZONE) return true;

        const k = (dt * gainCurve(speed) * sens()) / DEGREES_PER_WIDTH;
        emit(clamp(-fy * k, -MAX_STEP, MAX_STEP), clamp(-fp * k, -MAX_STEP, MAX_STEP));
        return true;
      },
    };
  }

  return { create, upVector, createOneEuro, gainCurve, DEGREES_PER_WIDTH };
});
