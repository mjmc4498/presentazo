// Prueba de la captura real de pantalla de la app de escritorio (vista previa del celular).
//
//   node test/escritorio-captura.mjs
//
// Usa la misma función que la app. En Windows no hace falta ningún permiso. En Mac solo
// puede capturar si el programa tiene el permiso de «Grabación de pantalla»; si no, se
// comprueba que la app no lo pida sola y se informa.

import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const electron = createRequire(path.join(ROOT, 'escritorio', 'package.json'))('electron');

const results = [];
const check = (name, ok, detail = '') => {
  results.push(ok);
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
};

const out = await new Promise((resolve) => {
  const proc = spawn(electron, [path.join(ROOT, 'test', 'captura-electron.mjs'), ROOT], { stdio: ['ignore', 'pipe', 'pipe'] });
  let text = '';
  proc.stdout.on('data', (d) => { text += d; });
  proc.stderr.on('data', (d) => { text += d; });
  const timer = setTimeout(() => { proc.kill(); resolve(`${text}\nTIEMPO AGOTADO`); }, 60000);
  proc.on('exit', () => { clearTimeout(timer); resolve(text); });
});

const line = out.split('\n').find((l) => l.startsWith('RESULTADO '));
const res = line ? JSON.parse(line.slice('RESULTADO '.length)) : null;
check('La captura termina sin quedarse esperando', !!res, res ? '' : out.slice(-300));

if (res && res.permiso !== 'granted') {
  console.log(`INFO  Sin el permiso de grabación de pantalla (${res.permiso}): no se captura ni se abre ningún aviso.`);
  check('Sin permiso, la app no captura por su cuenta', res.error === 'permission');
} else if (res) {
  check('Se obtiene una imagen JPEG válida', res.jpeg && !res.error, JSON.stringify(res));
  check('Cabe en un mensaje del canal (≤ 60 KB en base64)', res.base64 > 0 && res.base64 <= 60000, `${res.base64} caracteres`);
  check('Informa el tamaño real de la pantalla', res.pantalla[0] > 0 && res.pantalla[1] > 0, res.pantalla.join('×'));
}

const failed = results.filter((r) => !r).length;
console.log(`\n${results.length - failed}/${results.length} comprobaciones correctas`);
process.exit(failed ? 1 : 0);
