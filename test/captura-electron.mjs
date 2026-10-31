// Script que corre DENTRO de Electron (lo lanza test/escritorio-captura.mjs):
// captura la pantalla principal con el mismo código que usa la app y describe el resultado.
import { app, screen, systemPreferences } from 'electron';
import { pathToFileURL } from 'node:url';
import path from 'node:path';

const root = path.resolve(process.argv[2]);

app.on('window-all-closed', () => {});

// Sin «await app.whenReady()» al nivel superior: Electron espera a que este archivo termine
// de cargarse antes de avisar que está listo, y se quedaría esperando a sí mismo.
app.whenReady().then(async () => {
  const { captureDisplay } = await import(pathToFileURL(path.join(root, 'escritorio', 'src', 'captura.js')).href);
  const display = screen.getPrimaryDisplay();
  const status = process.platform === 'darwin' ? systemPreferences.getMediaAccessStatus('screen') : 'granted';
  // En Mac sin permiso no se pide captura: abriría el aviso del sistema y esperaría a alguien.
  const result = status === 'granted' ? await captureDisplay(display) : { error: 'permission' };
  const m = typeof result.img === 'string' ? result.img.match(/^data:image\/jpeg;base64,(.+)$/) : null;
  const bytes = m ? Buffer.from(m[1], 'base64') : null;
  console.log(`RESULTADO ${JSON.stringify({
    permiso: status,
    error: result.error || null,
    jpeg: !!bytes && bytes[0] === 0xff && bytes[1] === 0xd8,
    bytes: bytes ? bytes.length : 0,
    base64: m ? m[1].length : 0,
    pantalla: [result.w, result.h],
  })}`);
  app.exit(0);
});
