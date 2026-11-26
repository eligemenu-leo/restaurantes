import { groupHours } from '@rea/core/lib/hours.ts';
import type { Day, LocationData } from '@rea/core/lib/schema.ts';

const ORDER: Day[] = ['mo', 'tu', 'we', 'th', 'fr', 'sa', 'su'];
const NAMES: Record<Day, string> = {
  mo: 'lunes', tu: 'martes', we: 'miércoles', th: 'jueves', fr: 'viernes', sa: 'sábado', su: 'domingo',
};

/** "Lunes y jueves a domingo", "Martes y miércoles", "Domingo": tramos seguidos de 3 o más días van con "a". */
function dias(days: Day[]): string {
  const idx = days.map((d) => ORDER.indexOf(d)).sort((a, b) => a - b);
  const runs: number[][] = [];
  for (const i of idx) {
    const last = runs.at(-1);
    if (last && i === last.at(-1)! + 1) last.push(i);
    else runs.push([i]);
  }
  const parts = runs.flatMap((r) =>
    r.length >= 3 ? [`${NAMES[ORDER[r[0]]]} a ${NAMES[ORDER[r.at(-1)!]]}`] : r.map((i) => NAMES[ORDER[i]]),
  );
  const txt = parts.length === 1 ? parts[0] : `${parts.slice(0, -1).join(', ')} y ${parts.at(-1)}`;
  return txt === 'lunes a domingo' ? 'De lunes a domingo' : txt[0].toUpperCase() + txt.slice(1);
}

/** Hora como en la web original: sin cero inicial ("1:00", "12:30"). */
const hora = (t: string) => t.replace(/^0(\d)/, '$1');

export type LineaHorario = { dias: string; tramos: Array<[string, string]>; estado: 'open' | 'closed' | 'unknown' };

/** Horario de un local agrupado por días con el mismo horario, en el orden de la semana. */
export function horario(loc: Pick<LocationData, 'hours' | 'closedDays'>): LineaHorario[] {
  return groupHours(loc).map((r) => ({
    dias: dias(r.days),
    estado: r.status,
    tramos: r.slots.map((s) => {
      const [a, b] = s.split('–');
      return [hora(a), hora(b === '00:00' ? '24:00' : b)] as [string, string];
    }),
  }));
}

type FilaHorario = { local: string; dia: number; abre: string | null; cierra: string | null; cerrado: boolean };

/**
 * Horario de cada local desde la base de datos de La Vaca (tabla `horarios`, Supabase propio,
 * no Eligemenú). Se lee al publicar la web; un cambio en la tabla vuelve a publicarla.
 * Devuelve null si no se puede leer: entonces se usa el de site.json.
 */
export async function horariosDeLaBaseDeDatos(cfg: { url: string; clavePublicable: string; comercio: string }) {
  const url = `${cfg.url}/rest/v1/horarios?select=local,dia,abre,cierra,cerrado&comercio_id=eq.${encodeURIComponent(cfg.comercio)}`;
  let filas: FilaHorario[];
  try {
    const res = await fetch(url, { headers: { apikey: cfg.clavePublicable }, signal: AbortSignal.timeout(10_000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    filas = await res.json();
  } catch (e) {
    console.warn(`[horarios] no se pudo leer la base de datos de La Vaca (${(e as Error).message}); se usa site.json`);
    return null;
  }
  if (!filas.length) {
    console.warn('[horarios] la tabla horarios está vacía; se usa site.json');
    return null;
  }
  const t = (x: string) => x.slice(0, 5);
  const porLocal = new Map<string, Pick<LocationData, 'hours' | 'closedDays'>>();
  for (const f of filas) {
    const loc = porLocal.get(f.local) ?? { hours: [], closedDays: [] };
    porLocal.set(f.local, loc);
    const day = ORDER[f.dia - 1];
    if (!day) continue;
    if (f.cerrado) {
      if (!loc.closedDays.includes(day)) loc.closedDays.push(day);
      continue;
    }
    if (!f.abre || !f.cierra) continue;
    const open = t(f.abre);
    const close = t(f.cierra) === '00:00' ? '24:00' : t(f.cierra);
    const slot = loc.hours.find((h) => h.open === open && h.close === close);
    if (slot) slot.days.push(day);
    else loc.hours.push({ days: [day], open, close });
  }
  // Un día marcado cerrado no puede tener tramos a la vez.
  for (const loc of porLocal.values()) {
    loc.hours = loc.hours
      .map((h) => ({ ...h, days: h.days.filter((d) => !loc.closedDays.includes(d)) }))
      .filter((h) => h.days.length);
  }
  console.log(`[horarios] horario de la base de datos de La Vaca: ${[...porLocal.keys()].join(', ')}`);
  return porLocal;
}
