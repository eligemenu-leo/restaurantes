// Cliente de la API pública de Eligemenú (la misma que usan el plugin de WordPress
// y el componente EligeMenuCard). Se llama AL COMPILAR la web: la carta llega al
// HTML ya escrita (buena para SEO y sin JavaScript) y la web publicada no depende
// de que la API esté disponible.
//
//   GET {apiBase}/wordpress-api/restaurant-with-menus?slug=<slug>&lang=es
//   cabecera: apikey: <anon key pública>
import { ALLERGENS, Menu, type MenuData } from './schema.ts';

export const DEFAULT_API_BASE = 'https://jcfiarsoqvczjavikgoh.supabase.co/functions/v1';

// Tipos de la respuesta, tomados del componente oficial (EligeMenuCardTypes.ts).
export interface EMAllergen { id: string; name: string; icon_url: string | null }
export interface EMDish {
  id: string;
  name: string;
  description: string | null;
  image_url: string | null;
  price_1: number | null;
  price_2: number | null;
  price_unit: string | null;
  price_unit_2: string | null;
  price_unit_suffix: string | null;
  price_unit_2_suffix: string | null;
  display_order: number | null;
  is_specialty: boolean;
  is_suggestion: boolean;
  dish_allergens: { allergen: EMAllergen }[];
}
export interface EMMenuGroup {
  id: string;
  name: string;
  description: string | null;
  display_order: number | null;
  image_url: string | null;
  prices_visible: boolean;
  has_dual_pricing: boolean;
  price_header_1: string | null;
  price_header_2: string | null;
  parent_group_id?: string | null;
  dishes: EMDish[];
}
export interface EMMenu { id: string; name: string; description: string | null; display_order: number | null; prices_visible: boolean; menu_groups: EMMenuGroup[] }
export interface EMRestaurant { id: string; name: string; slug: string; logo_url: string | null; image_url: string | null }
export interface EMApiResponse { restaurant: EMRestaurant; menus: EMMenu[] }

export type EligemenuConfig = { slug: string; apiBase?: string; apiKey: string; lang?: string; fetch?: typeof fetch };

export async function fetchRestaurantWithMenus(cfg: EligemenuConfig): Promise<EMApiResponse> {
  const base = (cfg.apiBase ?? DEFAULT_API_BASE).replace(/\/+$/, '');
  const u = new URL(`${base}/wordpress-api/restaurant-with-menus`);
  u.searchParams.set('slug', cfg.slug);
  if (cfg.lang && cfg.lang !== 'es') u.searchParams.set('lang', cfg.lang);
  const res = await (cfg.fetch ?? fetch)(u, { headers: { apikey: cfg.apiKey, 'Content-Type': 'application/json' } });
  if (!res.ok) throw new Error(`Eligemenú (${cfg.slug}): HTTP ${res.status}${res.status === 404 ? ', restaurante no encontrado' : ''}`);
  return (await res.json()) as EMApiResponse;
}

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
const ALLERGEN_BY_NAME = new Map<string, keyof typeof ALLERGENS>();
for (const [key, label] of Object.entries(ALLERGENS) as [keyof typeof ALLERGENS, string][]) {
  ALLERGEN_BY_NAME.set(norm(label), key);
  ALLERGEN_BY_NAME.set(norm(key.replace('_', ' ')), key);
}
for (const [alias, key] of Object.entries({
  huevos: 'huevo', cacahuetes: 'cacahuete', 'frutos secos': 'frutos_cascara', crustaceo: 'crustaceos', molusco: 'moluscos',
  leche: 'lacteos', lacteo: 'lacteos', altramuz: 'altramuces', sulfito: 'sulfitos', 'dioxido de azufre y sulfitos': 'sulfitos',
  'granos de sesamo': 'sesamo', 'cereales con gluten': 'gluten',
  eggs: 'huevo', fish: 'pescado', milk: 'lacteos', peanuts: 'cacahuete', soy: 'soja', nuts: 'frutos_cascara', celery: 'apio',
  mustard: 'mostaza', sesame: 'sesamo', sulphites: 'sulfitos', lupin: 'altramuces', molluscs: 'moluscos', crustaceans: 'crustaceos',
} as Record<string, keyof typeof ALLERGENS>)) ALLERGEN_BY_NAME.set(alias, key);

export function allergenKey(name: string): keyof typeof ALLERGENS | undefined {
  return ALLERGEN_BY_NAME.get(norm(name));
}

/** Eligemenú devuelve a veces nombres entre comillas ("\"Menu\""). */
export const cleanName = (s: string) => s.trim().replace(/^["“”']+|["“”']+$/g, '').trim();
/** Quita de la descripción el "(PRECIO KG)" que la web ya indica junto al precio. */
const cleanDesc = (s: string | null) => (s ?? '').replace(/\s*\(?\s*precio\s*(por\s*)?kg\s*\)?\s*/gi, ' ').replace(/\s+/g, ' ').trim() || undefined;
const slugify = (s: string) => norm(s).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'seccion';
const unitOf = (u?: string | null) => (u && /kg|kilo/i.test(u) ? 'kg' : 'racion');
/** "€/ud" → "/ ud"; "€" o "€/kg" (ya cubierto por la unidad) → nada. */
function suffixLabel(suffix: string | null, unit: string | null): string | undefined {
  if (!suffix || unitOf(unit) === 'kg') return undefined;
  const rest = suffix.replace(/^\s*(€|eur)\s*/i, '').trim();
  return rest ? (rest.startsWith('/') ? `/ ${rest.slice(1).trim()}` : rest) : undefined;
}
const byOrder = (a: { display_order: number | null }, b: { display_order: number | null }) => (a.display_order ?? 0) - (b.display_order ?? 0);

export function toItem(d: EMDish, group: Pick<EMMenuGroup, 'prices_visible' | 'has_dual_pricing'>) {
  const allergens = (d.dish_allergens ?? [])
    .map((a) => allergenKey(a.allergen?.name ?? ''))
    .filter((a): a is keyof typeof ALLERGENS => Boolean(a));
  const showPrices = group.prices_visible !== false;
  return {
    name: cleanName(d.name),
    ...(cleanDesc(d.description) ? { description: cleanDesc(d.description) } : {}),
    ...(showPrices && d.price_1 != null ? { price: Number(d.price_1), unit: unitOf(d.price_unit) } : {}),
    ...(showPrices && suffixLabel(d.price_unit_suffix, d.price_unit) ? { priceLabel: suffixLabel(d.price_unit_suffix, d.price_unit) } : {}),
    ...(showPrices && group.has_dual_pricing && d.price_2 != null ? { price2: Number(d.price_2), ...(suffixLabel(d.price_unit_2_suffix, d.price_unit_2) ? { price2Label: suffixLabel(d.price_unit_2_suffix, d.price_unit_2) } : {}) } : {}),
    ...(allergens.length ? { allergens: [...new Set(allergens)] } : {}),
    featured: Boolean(d.is_specialty),
    suggestion: Boolean(d.is_suggestion),
    ...(d.image_url ? { image: d.image_url } : {}),
  };
}

/** Convierte una carta de la API en el modelo común; los subgrupos van detrás de su grupo. */
export function toMenu(menu: EMMenu, updated = new Date().toISOString().slice(0, 10)): MenuData {
  const groups = [...menu.menu_groups].sort(byOrder);
  const roots = groups.filter((g) => !g.parent_group_id || !groups.some((p) => p.id === g.parent_group_id));
  const ordered: Array<EMMenuGroup & { sub: boolean }> = [];
  for (const r of roots) {
    ordered.push({ ...r, sub: false });
    for (const s of groups.filter((g) => g.parent_group_id === r.id)) ordered.push({ ...s, sub: true });
  }
  const used = new Set<string>();
  const sections = ordered
    .map((g) => {
      let id = slugify(cleanName(g.name));
      while (used.has(id)) id += '-2';
      used.add(id);
      return {
        id,
        name: cleanName(g.name),
        sub: g.sub,
        ...(g.description?.trim() ? { note: g.description.trim() } : {}),
        ...(g.has_dual_pricing && (g.price_header_1 || g.price_header_2) ? { priceHeaders: [g.price_header_1 ?? '', g.price_header_2 ?? ''] } : {}),
        items: [...(g.dishes ?? [])].sort(byOrder).map((d) => toItem(d, { prices_visible: menu.prices_visible !== false && g.prices_visible !== false, has_dual_pricing: g.has_dual_pricing })),
      };
    })
    .filter((s) => s.items.length > 0);
  return Menu.parse({ title: cleanName(menu.name), updated, sections });
}

export type LoadedMenus = { source: 'eligemenu' | 'local'; restaurant: EMApiResponse['restaurant'] & { schedules?: EMSchedule[] }; menus: MenuData[] };

/**
 * Con clave configurada, la carta sale de Eligemenú y un fallo de la API hace fallar
 * la compilación a propósito: Cloudflare sigue sirviendo la versión anterior en vez
 * de publicar una carta vieja o vacía. Sin clave (desarrollo, CI) usa la copia guardada.
 */
export async function loadMenus(opts: { slug: string; apiKey?: string; apiBase?: string; lang?: string; snapshot: EMApiResponse; snapshotDate?: string; fetch?: typeof fetch }): Promise<LoadedMenus> {
  const fromLive = Boolean(opts.apiKey);
  const data = fromLive
    ? await fetchRestaurantWithMenus({ slug: opts.slug, apiKey: opts.apiKey!, apiBase: opts.apiBase, lang: opts.lang, fetch: opts.fetch })
    : opts.snapshot;
  const updated = fromLive ? undefined : opts.snapshotDate;
  const menus = [...(data.menus ?? [])].sort(byOrder).map((m) => toMenu(m, updated)).filter((m) => m.sections.length);
  if (!menus.length) throw new Error(`Eligemenú (${opts.slug}): la respuesta no trae ninguna carta con platos`);
  // Aparece en el registro de compilación de Cloudflare: así se ve de dónde salió la carta.
  console.log(fromLive ? `[eligemenu] ${opts.slug}: carta en directo de Eligemenú` : `[eligemenu] ${opts.slug}: copia guardada del ${opts.snapshotDate ?? '?'} (no hay ELIGEMENU_API_KEY)`);
  return { source: fromLive ? 'eligemenu' : 'local', restaurant: data.restaurant as LoadedMenus['restaurant'], menus };
}

export type EMSchedule = { day_of_week: number; start_time: string; end_time: string; is_closed: boolean; schedule_type: string };
const DOW = ['su', 'mo', 'tu', 'we', 'th', 'fr', 'sa'] as const;

/**
 * Horario de apertura desde Eligemenú (schedule_type "opening"; day_of_week 0 = domingo).
 * Los días marcados is_closed salen como cerrados; los que no aparecen, como "consultar".
 */
export function hoursFromSchedules(schedules: EMSchedule[]) {
  const opening = schedules.filter((s) => s.schedule_type === 'opening');
  const closedDays = [...new Set(opening.filter((s) => s.is_closed).map((s) => DOW[s.day_of_week]))];
  const t = (x: string) => x.slice(0, 5);
  const slots = new Map<string, { days: (typeof DOW)[number][]; open: string; close: string }>();
  for (const s of opening.filter((s) => !s.is_closed && !closedDays.includes(DOW[s.day_of_week]))) {
    const close = t(s.end_time) === '00:00' ? '24:00' : t(s.end_time);
    const key = `${t(s.start_time)}-${close}`;
    const slot = slots.get(key) ?? { days: [], open: t(s.start_time), close };
    slot.days.push(DOW[s.day_of_week]);
    slots.set(key, slot);
  }
  return { hours: [...slots.values()], closedDays };
}
