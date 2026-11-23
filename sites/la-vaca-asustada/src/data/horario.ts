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
