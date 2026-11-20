// Fechas de venta y caducidad. Sin dependencias, para poder probarlo con Node.
import type { TipoBono } from './db.ts';

/** Fecha de hoy en España, AAAA-MM-DD. */
export const hoy = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Madrid' });

/** ¿Se puede comprar este tipo de bono hoy? */
export const enVenta = (t: TipoBono, dia = hoy()) =>
  t.activo && (!t.venta_desde || t.venta_desde <= dia) && (!t.venta_hasta || t.venta_hasta >= dia);

/** Caducidad de un bono comprado hoy: fecha fija del tipo o X meses (12 si no hay tipo). */
export function caducidad(t: Pick<TipoBono, 'validez_meses' | 'caduca_fija'> | null, desde = hoy()): string {
  if (t?.caduca_fija) return t.caduca_fija;
  const d = new Date(`${desde}T12:00:00Z`);
  const dia = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + (t?.validez_meses ?? 12));
  const ultimo = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(dia, ultimo)); // 31 de enero + 1 mes = 28/29 de febrero, como hace Postgres
  return d.toISOString().slice(0, 10);
}
