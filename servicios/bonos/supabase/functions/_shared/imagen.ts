// Imagen del bono con su importe encima, igual que la vista previa de la web (/bonos-regalo/).
// La usan el correo del bono y los pases de Apple y Google Wallet.
//
// Cada web publica en /bonos-regalo/:
//   bono-base.jpg    la foto del bono sin importe (la de La Vaca es cuadrada, de 1120 px)
//   bono-fuente.ttf  la letra del importe (TTF, OTF o WOFF)
// La posición, el tamaño, el giro y el color del importe están en IMPORTE y se miden sobre la foto
// igual que en la web: left/top y font-size en fracción del ancho, y rotate en grados.
//
// Todo es JavaScript puro (sin WebAssembly ni archivos del paquete) para que funcione igual en el
// editor de funciones de Supabase: jpeg-js lee y escribe el JPEG, opentype.js da el contorno de
// las letras y aquí se rellenan con suavizado.
import jpeg from 'npm:jpeg-js@0.4.4';
import opentype from 'npm:opentype.js@1.3.4';
import { zlibSync } from 'npm:fflate@0.8.2';

export const IMPORTE = {
  x: 0.556, y: 0.565, tam: 0.113, giro: 7, eur: 0.75, espaciado: -0.01,
  // Degradado dorado de arriba abajo de la caja del texto, como el background-clip: text de la web.
  degradado: [[0, 0xf3, 0xcd, 0x8c], [0.55, 0xe0, 0xa5, 0x5d], [1, 0xb9, 0x82, 0x3f]] as [number, number, number, number][],
};

/** Franja 3:1 para los pases: centro vertical de la franja, en fracción del alto de la foto. */
export const BANDA = { centro: 0.48 };

export interface Lienzo { width: number; height: number; data: Uint8Array } // RGBA

const cifra = (cent: number) => (cent % 100 ? (cent / 100).toFixed(2).replace('.', ',') : String(cent / 100));

function colorEn(t: number) {
  const d = IMPORTE.degradado;
  let i = 0; while (i < d.length - 2 && t > d[i + 1][0]) i++;
  const [t0, r0, g0, b0] = d[i], [t1, r1, g1, b1] = d[i + 1];
  const k = Math.min(1, Math.max(0, (t - t0) / (t1 - t0)));
  return [r0 + (r1 - r0) * k, g0 + (g1 - g0) * k, b0 + (b1 - b0) * k];
}

type Punto = [number, number];

/** Contornos del importe ("100 €", con el € más pequeño) en coordenadas de su caja, y el tamaño de la caja. */
function contornos(fuente: opentype.Font, cent: number, px: number) {
  const upm = fuente.unitsPerEm, hhea = fuente.tables.hhea;
  // Caja con line-height: 1, como en la web: la línea base queda donde la pone el navegador.
  const base = (px - (hhea.ascender - hhea.descender) / upm * px) / 2 + hhea.ascender / upm * px;
  const trozos: [string, number][] = [[`${cifra(cent)} `, px], ['€', px * IMPORTE.eur]];
  const polis: Punto[][] = [];
  let x = 0;
  for (const [texto, tam] of trozos) {
    for (const g of fuente.stringToGlyphs(texto)) {
      polis.push(...aplanar(g.getPath(x, base, tam).commands));
      x += (g.advanceWidth ?? 0) / upm * tam + IMPORTE.espaciado * tam;
    }
  }
  return { polis, ancho: x, alto: px };
}

/** Pasa las curvas del contorno a polígonos. */
function aplanar(cmds: opentype.PathCommand[]) {
  const polis: Punto[][] = [];
  let p: Punto[] = [], cx = 0, cy = 0;
  const N = 8;
  for (const c of cmds) {
    if (c.type === 'M') { if (p.length) polis.push(p); p = [[c.x, c.y]]; cx = c.x; cy = c.y; }
    else if (c.type === 'L') { p.push([c.x, c.y]); cx = c.x; cy = c.y; }
    else if (c.type === 'Q') {
      for (let i = 1; i <= N; i++) { const t = i / N, u = 1 - t; p.push([u * u * cx + 2 * u * t * c.x1 + t * t * c.x, u * u * cy + 2 * u * t * c.y1 + t * t * c.y]); }
      cx = c.x; cy = c.y;
    } else if (c.type === 'C') {
      for (let i = 1; i <= N; i++) {
        const t = i / N, u = 1 - t;
        p.push([u * u * u * cx + 3 * u * u * t * c.x1 + 3 * u * t * t * c.x2 + t * t * t * c.x, u * u * u * cy + 3 * u * u * t * c.y1 + 3 * u * t * t * c.y2 + t * t * t * c.y]);
      }
      cx = c.x; cy = c.y;
    } else if (c.type === 'Z') { if (p.length) polis.push(p); p = []; }
  }
  if (p.length) polis.push(p);
  return polis;
}

/** Cobertura (0..1) de los polígonos en cada píxel del lienzo, con relleno nonzero y 5 sublíneas por píxel. */
function cobertura(polis: Punto[][], w: number, h: number) {
  const cov = new Float32Array(w * h);
  const aristas: [number, number, number, number, number][] = [];
  let y0 = Infinity, y1 = -Infinity;
  for (const p of polis) for (let i = 0; i < p.length; i++) {
    const [ax, ay] = p[i], [bx, by] = p[(i + 1) % p.length];
    if (ay === by) continue;
    aristas.push(ay < by ? [ax, ay, bx, by, 1] : [bx, by, ax, ay, -1]);
    y0 = Math.min(y0, ay, by); y1 = Math.max(y1, ay, by);
  }
  const S = 5;
  for (let py = Math.max(0, Math.floor(y0)); py < Math.min(h, Math.ceil(y1)); py++) {
    for (let s = 0; s < S; s++) {
      const sy = py + (s + 0.5) / S;
      const cortes: [number, number][] = [];
      for (const [ax, ay, bx, by, d] of aristas) if (sy >= ay && sy < by) cortes.push([ax + (sy - ay) / (by - ay) * (bx - ax), d]);
      cortes.sort((a, b) => a[0] - b[0]);
      let giro = 0;
      for (let i = 0; i < cortes.length - 1; i++) {
        giro += cortes[i][1];
        if (!giro) continue;
        const xa = Math.max(0, cortes[i][0]), xb = Math.min(w, cortes[i + 1][0]);
        if (xb <= xa) continue;
        const fila = py * w;
        const ia = Math.floor(xa), ib = Math.floor(xb);
        if (ia === ib) { cov[fila + ia] += (xb - xa) / S; continue; }
        cov[fila + ia] += (ia + 1 - xa) / S;
        for (let x = ia + 1; x < ib; x++) cov[fila + x] += 1 / S;
        if (ib < w) cov[fila + ib] += (xb - ib) / S;
      }
    }
  }
  return cov;
}

/** Pinta el importe sobre la foto (RGBA), centrado y girado como en la web. */
export function pintarImporte(img: Lienzo, fuente: opentype.Font, cent: number) {
  const { polis, ancho, alto } = contornos(fuente, cent, img.width * IMPORTE.tam);
  const a = IMPORTE.giro * Math.PI / 180, cos = Math.cos(a), sin = Math.sin(a);
  const cx = img.width * IMPORTE.x, cy = img.height * IMPORTE.y;
  // De la caja del texto a la foto: centrar en (0,0), girar y llevar al sitio.
  const aFoto = ([x, y]: Punto): Punto => { const u = x - ancho / 2, v = y - alto / 2; return [cx + u * cos - v * sin, cy + u * sin + v * cos]; };
  const cov = cobertura(polis.map((p) => p.map(aFoto)), img.width, img.height);
  const d = img.data;
  for (let i = 0; i < cov.length; i++) {
    const c = Math.min(1, cov[i]);
    if (c <= 0) continue;
    const px = i % img.width + 0.5, py = Math.floor(i / img.width) + 0.5;
    // Altura dentro de la caja del texto (sin girar), para el degradado.
    const v = -(px - cx) * sin + (py - cy) * cos + alto / 2;
    const [r, g, b] = colorEn(v / alto);
    const o = i * 4;
    d[o] = d[o] * (1 - c) + r * c; d[o + 1] = d[o + 1] * (1 - c) + g * c; d[o + 2] = d[o + 2] * (1 - c) + b * c;
  }
  return img;
}

export const leerFuente = (bytes: Uint8Array) =>
  opentype.parse(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));

/** La foto del bono (JPEG) con el importe ya pintado. */
export function imagenBono(baseJpg: Uint8Array, fuente: opentype.Font, cent: number): Lienzo {
  const img = jpeg.decode(baseJpg, { useTArray: true, formatAsRGBA: true }) as Lienzo;
  return pintarImporte(img, fuente, cent);
}

/** Reduce o recorta un trozo del lienzo a un tamaño dado, promediando los píxeles. */
export function recortar(img: Lienzo, x0: number, y0: number, w0: number, h0: number, w: number, h: number): Lienzo {
  const out = new Uint8Array(w * h * 4);
  const fx = w0 / w, fy = h0 / h;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const xa = x0 + x * fx, xb = xa + fx, ya = y0 + y * fy, yb = ya + fy;
    let r = 0, g = 0, b = 0, n = 0;
    for (let sy = Math.floor(ya); sy < Math.ceil(yb); sy++) for (let sx = Math.floor(xa); sx < Math.ceil(xb); sx++) {
      const peso = (Math.min(xb, sx + 1) - Math.max(xa, sx)) * (Math.min(yb, sy + 1) - Math.max(ya, sy));
      const o = (Math.min(img.height - 1, sy) * img.width + Math.min(img.width - 1, sx)) * 4;
      r += img.data[o] * peso; g += img.data[o + 1] * peso; b += img.data[o + 2] * peso; n += peso;
    }
    const o = (y * w + x) * 4;
    out[o] = r / n; out[o + 1] = g / n; out[o + 2] = b / n; out[o + 3] = 255;
  }
  return { width: w, height: h, data: out };
}

/** Franja apaisada de la foto (3:1 si no se da el alto) (tira de Apple Wallet y cabecera de Google Wallet). */
export function banda(img: Lienzo, ancho: number, alto = Math.round(ancho / 3)) {
  const h = Math.round(img.width * alto / ancho);
  const y = Math.min(img.height - h, Math.max(0, Math.round(img.height * BANDA.centro - h / 2)));
  return recortar(img, 0, y, img.width, h, ancho, alto);
}

export const aJpeg = (img: Lienzo, calidad = 80) => new Uint8Array(jpeg.encode(img, calidad).data);

/** PNG sin transparencia (Apple Wallet solo acepta PNG). */
export function aPng(img: Lienzo) {
  const { width: w, height: h, data } = img;
  const filas = new Uint8Array((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) {
    filas[y * (w * 3 + 1)] = 0;
    for (let x = 0; x < w; x++) { const o = (y * w + x) * 4, p = y * (w * 3 + 1) + 1 + x * 3; filas[p] = data[o]; filas[p + 1] = data[o + 1]; filas[p + 2] = data[o + 2]; }
  }
  const crcT = new Uint32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
  const crc = (b: Uint8Array) => { let c = 0xffffffff; for (const x of b) c = crcT[(c ^ x) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const trozo = (tipo: string, datos: Uint8Array) => {
    const t = new Uint8Array(4 + datos.length); t.set(new TextEncoder().encode(tipo)); t.set(datos, 4);
    const out = new Uint8Array(12 + datos.length), dv = new DataView(out.buffer);
    dv.setUint32(0, datos.length); out.set(t, 4); dv.setUint32(8 + datos.length, crc(t));
    return out;
  };
  const ihdr = new Uint8Array(13), dv = new DataView(ihdr.buffer);
  dv.setUint32(0, w); dv.setUint32(4, h); ihdr[8] = 8; ihdr[9] = 2; // 8 bits, RGB
  const partes = [new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]), trozo('IHDR', ihdr), trozo('IDAT', zlibSync(filas, { level: 9 })), trozo('IEND', new Uint8Array())];
  const out = new Uint8Array(partes.reduce((n, p) => n + p.length, 0));
  let o = 0; for (const p of partes) { out.set(p, o); o += p.length; }
  return out;
}

// Foto y letra de cada web, guardadas mientras la función sigue encendida.
const recursos = new Map<string, Promise<{ base: Uint8Array; fuente: opentype.Font }>>();
async function bajar(url: string) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`No se pudo descargar ${url}: ${r.status}`);
  return new Uint8Array(await r.arrayBuffer());
}
function recursosDe(web: string) {
  let p = recursos.get(web);
  if (!p) {
    p = Promise.all([bajar(`${web}/bonos-regalo/bono-base.jpg`), bajar(`${web}/bonos-regalo/bono-fuente.ttf`)])
      .then(([base, fuente]) => ({ base, fuente: leerFuente(fuente) }));
    p.catch(() => recursos.delete(web));
    recursos.set(web, p);
  }
  return p;
}

/** La imagen del bono de una web con el importe dado, o null si esa web no publica la foto. */
export async function imagenDeWeb(web: string | null | undefined, cent: number) {
  const w = (web || '').replace(/\/+$/, '');
  if (!w) return null;
  try {
    const { base, fuente } = await recursosDe(w);
    return imagenBono(base, fuente, cent);
  } catch (e) {
    console.error(e);
    return null;
  }
}

/** Dirección de la imagen del bono (la sirve bonos-api). `banda` es la franja 3:1 de los pases. */
export const urlImagen = (codigo: string, cent: number, banda = false) =>
  `${Deno.env.get('SUPABASE_URL')}/functions/v1/bonos-api/imagen?c=${encodeURIComponent(codigo)}&i=${cent}${banda ? '&f=banda' : ''}`;
