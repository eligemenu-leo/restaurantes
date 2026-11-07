import type { Day, LocationData, OpeningSlotData } from './schema.ts';

const ORDER: Day[] = ['mo', 'tu', 'we', 'th', 'fr', 'sa', 'su'];
const NAMES: Record<Day, string> = {
  mo: 'Lunes', tu: 'Martes', we: 'Miércoles', th: 'Jueves', fr: 'Viernes', sa: 'Sábado', su: 'Domingo',
};
const SCHEMA_DAYS: Record<Day, string> = {
  mo: 'Monday', tu: 'Tuesday', we: 'Wednesday', th: 'Thursday', fr: 'Friday', sa: 'Saturday', su: 'Sunday',
};

export type HoursRow = { days: Day[]; label: string; status: 'open' | 'closed' | 'unknown'; slots: string[] };

const fmt = (t: string) => (t === '24:00' ? '00:00' : t);

function slotsFor(day: Day, hours: OpeningSlotData[]): string[] {
  return hours
    .filter((h) => h.days.includes(day))
    .sort((a, b) => a.open.localeCompare(b.open))
    .map((h) => `${fmt(h.open)}–${fmt(h.close)}`);
}

/** Etiqueta en español para un grupo de días: "Lunes", "Lunes a jueves", "Lunes, miércoles y jueves". */
export function dayLabel(days: Day[]): string {
  const idx = days.map((d) => ORDER.indexOf(d)).sort((a, b) => a - b);
  if (idx.length === 7) return 'Todos los días';
  const names = idx.map((i) => NAMES[ORDER[i]]);
  const consecutive = idx.every((v, i) => i === 0 || v === idx[i - 1] + 1);
  if (idx.length >= 3 && consecutive) return `${names[0]} a ${names.at(-1)!.toLowerCase()}`;
  if (names.length === 1) return names[0];
  const rest = names.slice(1).map((n) => n.toLowerCase());
  return `${names[0]}${rest.length > 1 ? ', ' + rest.slice(0, -1).join(', ') : ''} y ${rest.at(-1)}`;
}

/**
 * Agrupa los días con el mismo horario. Un día sin tramos y no declarado cerrado
 * sale como "por confirmar": preferimos avisar a inventar que está cerrado.
 */
export function groupHours(loc: Pick<LocationData, 'hours' | 'closedDays'>): HoursRow[] {
  const key = (d: Day) =>
    loc.closedDays.includes(d) ? 'closed' : slotsFor(d, loc.hours).join('|') || 'unknown';
  const groups = new Map<string, Day[]>();
  for (const d of ORDER) {
    const k = key(d);
    groups.set(k, [...(groups.get(k) ?? []), d]);
  }
  return [...groups.entries()]
    .map(([k, days]) => ({
      days,
      label: dayLabel(days),
      status: (k === 'closed' ? 'closed' : k === 'unknown' ? 'unknown' : 'open') as HoursRow['status'],
      slots: k === 'closed' || k === 'unknown' ? [] : k.split('|'),
    }))
    .sort((a, b) => ORDER.indexOf(a.days[0]) - ORDER.indexOf(b.days[0]));
}

/** Para Schema.org: un OpeningHoursSpecification por tramo. */
export function openingHoursSpec(hours: OpeningSlotData[]) {
  return hours.map((h) => ({
    '@type': 'OpeningHoursSpecification',
    dayOfWeek: h.days.map((d) => SCHEMA_DAYS[d]),
    opens: h.open,
    closes: h.close === '24:00' ? '23:59' : h.close,
  }));
}
