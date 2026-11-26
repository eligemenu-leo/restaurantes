// Pruebas de la imagen del bono (correo y Cartera). Usan Deno porque el módulo importa paquetes npm: como en Supabase.
//   deno test --allow-read --allow-env --node-modules-dir=none test/imagen.deno.ts
// Pinta el importe sobre la foto de La Vaca Asustada y comprueba que queda dorado en su sitio y que los archivos son válidos.
import { assert, assertEquals } from 'jsr:@std/assert@1';
import jpeg from 'npm:jpeg-js@0.4.4';
import { aJpeg, aPng, banda, IMPORTE, imagenBono, leerFuente, type Lienzo } from '../supabase/functions/_shared/imagen.ts';

const web = new URL('../../../sites/la-vaca-asustada/public/bonos-regalo/', import.meta.url);
const base = await Deno.readFile(new URL('bono-base.jpg', web));
const fuente = leerFuente(await Deno.readFile(new URL('bono-fuente.ttf', web)));
const dorados = (img: Lienzo, x0: number, y0: number, x1: number, y1: number) => {
  let n = 0;
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
    const o = (y * img.width + x) * 4, [r, g, b] = [img.data[o], img.data[o + 1], img.data[o + 2]];
    if (r > 170 && r > b + 50 && g > b + 15) n++;
  }
  return n;
};

Deno.test('el importe queda pintado en dorado en el sitio de la web', () => {
  const sin = jpeg.decode(base, { useTArray: true, formatAsRGBA: true }) as Lienzo;
  const img = imagenBono(base, fuente, 10000);
  const w = img.width, cx = Math.round(w * IMPORTE.x), cy = Math.round(w * IMPORTE.y), r = Math.round(w * 0.05);
  const antes = dorados(sin, cx - 3 * r, cy - r, cx + 3 * r, cy + r), despues = dorados(img, cx - 3 * r, cy - r, cx + 3 * r, cy + r);
  assert(despues > antes + 2000, `${antes} → ${despues}`);
  // Fuera de la zona del importe la foto no cambia.
  assertEquals(dorados(img, 0, 0, w, Math.round(w * 0.4)), dorados(sin, 0, 0, w, Math.round(w * 0.4)));
});

Deno.test('céntimos con coma y archivos JPEG y PNG válidos con la medida pedida', () => {
  const img = imagenBono(base, fuente, 3750);
  const j = aJpeg(img);
  assertEquals([j[0], j[1]], [0xff, 0xd8]);
  const tira = banda(img, 750, 246);
  assertEquals([tira.width, tira.height], [750, 246]);
  const p = aPng(tira);
  assertEquals(Array.from(p.slice(1, 4)), [80, 78, 71]);
  const dv = new DataView(p.buffer);
  assertEquals([dv.getUint32(16), dv.getUint32(20)], [750, 246]);
});
