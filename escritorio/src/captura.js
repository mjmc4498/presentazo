// Presentazo para escritorio: captura reducida de una pantalla para la vista previa del celular.
// Está aparte del proceso principal para poder probarla sola (test/escritorio-captura.mjs).

import { desktopCapturer } from 'electron';

export const PREVIEW_WIDTH = 480;
export const PREVIEW_MAX_BYTES = 42000;

// JPEG en data URL; baja la calidad hasta que la imagen quepa en un mensaje del canal.
export function jpegOf(image) {
  let jpeg = null;
  for (const quality of [62, 50, 40, 30]) {
    jpeg = image.toJPEG(quality);
    if (jpeg.length <= PREVIEW_MAX_BYTES) break;
  }
  return `data:image/jpeg;base64,${jpeg.toString('base64')}`;
}

// display: un Display de Electron. Devuelve { img, w, h } o { error: 'fail' }.
export async function captureDisplay(display) {
  try {
    const { width, height } = display.size;
    const sources = await desktopCapturer.getSources({
      types: ['screen'],
      thumbnailSize: { width: PREVIEW_WIDTH, height: Math.round((PREVIEW_WIDTH * height) / width) },
    });
    const source = sources.find((s) => s.display_id === String(display.id)) || sources[0];
    if (!source || source.thumbnail.isEmpty()) return { error: 'fail' };
    return { img: jpegOf(source.thumbnail), w: width, h: height };
  } catch {
    return { error: 'fail' };
  }
}
