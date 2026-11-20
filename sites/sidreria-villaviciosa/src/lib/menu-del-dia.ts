// Menú del día de la Sidrería, leído de Eligemenú AL COMPILAR (como la carta).
//   GET {apiBase}/wordpress-api/daily-menus?restaurant_slug=<slug>
// La web se recompila sola al cambiar el menú en Eligemenú y cada noche, para que el
// de ayer desaparezca. Solo se muestra el menú del día de HOY (hora de Madrid); los
// menús de grupo (Espicha, Compartir, Carta) no salen aquí.
import { DEFAULT_API_BASE, cleanName } from '@rea/core/lib/eligemenu.ts';

type EMDailyDish = { name: string; description: string | null; display_order: number | null };
type EMDailyGroup = { name: string; description: string | null; display_order: number | null; daily_menu_dishes: EMDailyDish[] | null };
export type EMDailyMenu = {
  name: string; is_group_menu: boolean; price: number | null; half_price: number | null; prices_visible: boolean;
  start_date: string; end_date: string; available_days: number[] | null; meal_times: string[] | null;
  description: string | null; observations: string | null; display_order: number | null;
  daily_menu_dish_groups: EMDailyGroup[] | null;
};

export type MenuDelDia = {
  name: string;
  date: string; // AAAA-MM-DD
  price?: number;
  halfPrice?: number;
  mealTimes: string[];
  note?: string;
  groups: { name: string; note?: string; dishes: { name: string; description?: string }[] }[];
};

const byOrder = (a: { display_order: number | null }, b: { display_order: number | null }) => (a.display_order ?? 0) - (b.display_order ?? 0);
const txt = (s: string | null | undefined) => s?.trim() || undefined;

/** Fecha de hoy en Madrid (AAAA-MM-DD). HOY=AAAA-MM-DD la fija para probar. */
export function todayInMadrid(now = new Date()): string {
  return process.env.HOY || now.toLocaleDateString('en-CA', { timeZone: 'Europe/Madrid' });
}

/** Menús del día (no de grupo) válidos en la fecha dada y ese día de la semana. */
export function menusForDate(menus: EMDailyMenu[], date: string): MenuDelDia[] {
  const dow = new Date(`${date}T12:00:00Z`).getUTCDay();
  return menus
    .filter((m) => !m.is_group_menu && m.start_date <= date && date <= m.end_date)
    .filter((m) => !m.available_days?.length || m.available_days.includes(dow))
    .sort(byOrder)
    .map((m) => ({
      name: cleanName(m.name),
      date,
      ...(m.prices_visible !== false && m.price != null && Number(m.price) > 0 ? { price: Number(m.price) } : {}),
      ...(m.prices_visible !== false && m.half_price != null && Number(m.half_price) > 0 ? { halfPrice: Number(m.half_price) } : {}),
      mealTimes: m.meal_times ?? [],
      ...(txt(m.observations) || txt(m.description) ? { note: txt(m.observations) ?? txt(m.description) } : {}),
      groups: [...(m.daily_menu_dish_groups ?? [])].sort(byOrder)
        .map((g) => ({
          name: cleanName(g.name),
          ...(txt(g.description) ? { note: txt(g.description) } : {}),
          dishes: [...(g.daily_menu_dishes ?? [])].sort(byOrder)
            .map((d) => ({ name: cleanName(d.name), ...(txt(d.description) ? { description: txt(d.description) } : {}) })),
        }))
        .filter((g) => g.dishes.length),
    }))
    .filter((m) => m.groups.length);
}

/**
 * Con clave, pide los menús a Eligemenú; sin clave usa la copia guardada (que casi nunca
 * es de hoy, así que en desarrollo no sale nada salvo con HOY=2026-11-06).
 * Si Eligemenú falla, la sección se oculta y la compilación sigue: la carta no depende de esto.
 */
export async function loadMenuDelDia(opts: { slug: string; apiKey?: string; snapshot: EMDailyMenu[] }): Promise<MenuDelDia[]> {
  const date = todayInMadrid();
  let data = opts.snapshot;
  if (opts.apiKey) {
    try {
      const u = new URL(`${DEFAULT_API_BASE}/wordpress-api/daily-menus`);
      u.searchParams.set('restaurant_slug', opts.slug);
      u.searchParams.set('date', date);
      const res = await fetch(u, { headers: { apikey: opts.apiKey, 'Content-Type': 'application/json' } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      data = (await res.json()) as EMDailyMenu[];
    } catch (e) {
      console.warn(`[eligemenu] ${opts.slug}: no se pudo leer el menú del día (${(e as Error).message}); la sección no se muestra`);
      return [];
    }
  }
  const out = menusForDate(Array.isArray(data) ? data : [], date);
  console.log(`[eligemenu] ${opts.slug}: menú del día ${date}: ${out.length ? out.map((m) => m.name).join(', ') : 'ninguno'}${opts.apiKey ? '' : ' (copia guardada)'}`);
  return out;
}
