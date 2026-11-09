// Firma y verificación de Redsys (HMAC_SHA256_V1), sin dependencias: funciona en Deno (Supabase) y en Node (tests).
import { tripleDesCbc } from './des.ts';

export type Entorno = 'pruebas' | 'real';
export const URL_PAGO: Record<Entorno, string> = {
  pruebas: 'https://sis-t.redsys.es:25443/sis/realizarPago',
  real: 'https://sis.redsys.es/sis/realizarPago',
};
export const VERSION_FIRMA = 'HMAC_SHA256_V1';

const enc = new TextEncoder();

export function b64encode(bytes: Uint8Array): string {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}

/** Acepta base64 normal y "url-safe" (Redsys usa este último en las notificaciones), con o sin relleno. */
export function b64decode(str: string): Uint8Array {
  let s = str.trim().replace(/-/g, '+').replace(/_/g, '/');
  while (s.length % 4) s += '=';
  const bin = atob(s);
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

export const encodeParams = (params: Record<string, string>): string => b64encode(enc.encode(JSON.stringify(params)));

export function decodeParams(paramsB64: string): Record<string, string> {
  const raw = JSON.parse(new TextDecoder().decode(b64decode(paramsB64))) as Record<string, unknown>;
  const out: Record<string, string> = {};
  // Redsys manda algunos valores codificados para URL (p. ej. Ds_Date "09%2F11%2F2026").
  for (const [k, v] of Object.entries(raw)) {
    const s = String(v ?? '');
    try { out[k] = decodeURIComponent(s); } catch { out[k] = s; }
  }
  return out;
}

/** Firma de Redsys: clave derivada = 3DES(número de pedido), firma = HMAC-SHA256(parámetros en base64). */
export async function firmar(claveB64: string, pedido: string, paramsB64: string): Promise<string> {
  const ped = enc.encode(pedido);
  const padded = new Uint8Array(Math.ceil(ped.length / 8) * 8);
  padded.set(ped);
  const derivada = tripleDesCbc(b64decode(claveB64), padded);
  const key = await crypto.subtle.importKey('raw', derivada, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const mac = new Uint8Array(await crypto.subtle.sign('HMAC', key, enc.encode(paramsB64)));
  return b64encode(mac);
}

const normaliza = (s: string) => s.trim().replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

/** Comprueba la firma de una notificación. Devuelve los parámetros decodificados si es válida, o null. */
export async function verificarNotificacion(
  claveB64: string,
  paramsB64: string,
  firmaRecibida: string,
): Promise<Record<string, string> | null> {
  const params = decodeParams(paramsB64);
  const pedido = params.Ds_Order ?? params.DS_ORDER;
  if (!pedido) return null;
  const esperada = normaliza(await firmar(claveB64, pedido, paramsB64));
  const recibida = normaliza(firmaRecibida);
  if (esperada.length !== recibida.length) return null;
  let diff = 0;
  for (let i = 0; i < esperada.length; i++) diff |= esperada.charCodeAt(i) ^ recibida.charCodeAt(i);
  return diff === 0 ? params : null;
}

/** Ds_Response de 0000 a 0099 es un pago autorizado; cualquier otro valor es denegado o cancelado. */
export function pagoAutorizado(dsResponse: string | undefined): boolean {
  if (!dsResponse || !/^\d{1,4}$/.test(dsResponse.trim())) return false;
  const n = Number(dsResponse);
  return n >= 0 && n <= 99;
}

const ALNUM = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const random = (alphabet: string, n: number) =>
  Array.from(crypto.getRandomValues(new Uint8Array(n)), (b) => alphabet[b % alphabet.length]).join('');

/** Número de pedido para Redsys: 12 caracteres, los 4 primeros numéricos (año y mes), el resto aleatorio. */
export function numeroPedido(fecha = new Date()): string {
  const yymm = String(fecha.getUTCFullYear() % 100).padStart(2, '0') + String(fecha.getUTCMonth() + 1).padStart(2, '0');
  return yymm + random(ALNUM, 8);
}

// Sin 0/O, 1/I/L ni U para que el código se pueda dictar por teléfono sin errores.
const CODIGO = '23456789ABCDEFGHJKMNPQRSTVWXYZ';
/** Código del bono, p. ej. "VACA-7K3M-QX9R". */
export const codigoBono = (prefijo: string) => `${prefijo}-${random(CODIGO, 4)}-${random(CODIGO, 4)}`;
