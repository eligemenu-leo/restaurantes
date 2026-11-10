import { load, Site, type MenuData } from '@rea/core/lib/schema.ts';
import { loadMenus, hoursFromSchedules, type EMApiResponse } from '@rea/core/lib/eligemenu.ts';
import siteRaw from './site.json';
// Copia de la respuesta de Eligemenú (7 de noviembre de 2026). Se usa cuando la
// compilación no tiene ELIGEMENU_API_KEY (desarrollo y CI). En Cloudflare se pide en vivo.
import snapshot from './eligemenu/sidreria-villaviciosa.json';

export const ELIGEMENU_SLUG = 'sidreria-villaviciosa';
const em = await loadMenus({
  slug: ELIGEMENU_SLUG,
  apiKey: import.meta.env.ELIGEMENU_API_KEY,
  snapshot: snapshot as unknown as EMApiResponse,
  snapshotDate: '2026-11-07',
});
export const menuSource = em.source;
export const restaurantId = em.restaurant.id;

const siteData = load(Site, siteRaw, 'src/data/site.json');
// El horario se mantiene en Eligemenú: si lo trae, manda sobre el de site.json.
const emHours = em.restaurant.schedules?.length ? hoursFromSchedules(em.restaurant.schedules) : null;
export const site = {
  ...siteData,
  locations: siteData.locations.map((l, i) => (i === 0 && emHours?.hours.length ? { ...l, ...emHours } : l)),
};
export const local = site.locations[0];

const pick = (re: RegExp) => {
  const m = em.menus.find((x) => re.test(x.title));
  if (!m) throw new Error(`Eligemenú: no hay carta que case con ${re} (hay: ${em.menus.map((x) => x.title).join(', ')})`);
  return m;
};
const cartaCompleta = pick(/^carta$/i);
/**
 * Sugerencias para hoy: los platos visibles del grupo "Sugerencias" de la carta en Eligemenú
 * (los ocultos no llegan en la API). La bombilla de "sugerencia" de cada plato no se usa aquí.
 */
const grupoSugerencias = cartaCompleta.sections.find((s) => s.id === 'sugerencias');
export const sugerencias = grupoSugerencias?.items.length
  ? grupoSugerencias
  : { items: cartaCompleta.sections.flatMap((s) => s.items).filter((i) => i.suggestion) };
export const carta: MenuData = { ...cartaCompleta, sections: cartaCompleta.sections.filter((s) => s.id !== 'sugerencias') };
export const bodega = pick(/bodega/i);

const platos = carta.sections.flatMap((s) => s.items);
/** Platos destacados de reserva: se buscan por nombre en la carta de Eligemenú. */
const destacadosFijos = [
  { match: /^tomates seleccionados/i, tagline: 'Fresca y sabrosa' },
  { match: /^fabada/i, tagline: 'La mejor tradición' },
  { match: /^pix[ií]n/i, tagline: 'De nuestro mar Cantábrico' },
  { match: /^cachopo de ternera/i, tagline: 'Grande, tierno y jugoso' },
  { match: /^arroz con leche/i, tagline: 'Auténticamente delicioso' },
].map((d) => ({ tagline: d.tagline, item: platos.find((i) => d.match.test(i.name)) }));

/**
 * Especialidades de la portada: los platos marcados como "especialidad" en Eligemenú.
 * Mientras no haya ninguno marcado, se muestran los cinco platos fijos de arriba
 * (nombre y precio salen igualmente de Eligemenú).
 */
const especialidadesEM = platos.filter((i) => i.featured).map((item) => ({ item, tagline: item.tagline }));
export const especialidades = especialidadesEM.length ? especialidadesEM : destacadosFijos.filter((d) => d.item);
export const especialidadesDesdeEligemenu = especialidadesEM.length > 0;

/** Menú del día de hoy, de Eligemenú (vacío si hoy no hay). */
import { loadMenuDelDia, type EMDailyMenu } from '../lib/menu-del-dia.ts';
import menuDiaSnapshot from './eligemenu/menu-del-dia.json';
export const menuDelDia = await loadMenuDelDia({
  slug: ELIGEMENU_SLUG,
  apiKey: import.meta.env.ELIGEMENU_API_KEY,
  snapshot: menuDiaSnapshot as unknown as EMDailyMenu[],
});
