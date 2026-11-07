import { load, Site, type MenuData } from '@rea/core/lib/schema.ts';
import { loadMenus, type EMApiResponse, type LoadedMenus } from '@rea/core/lib/eligemenu.ts';
import siteRaw from './site.json';
// Copias de Eligemenú (7 de noviembre de 2026) para compilar sin ELIGEMENU_API_KEY.
import oviedoSnapshot from './eligemenu/la-vaca-asustada-oviedo.json';
import gijonSnapshot from './eligemenu/la-vaca-asustada-gijon-restaurante.json';

export const site = load(Site, siteRaw, 'src/data/site.json');
/** La Vaca muestra los precios enteros sin decimales (18 € en vez de 18,00 €), como en su web anterior. */
export const HIDE_ZERO_DECIMALS = true;

const apiKey = import.meta.env.ELIGEMENU_API_KEY;
const get = (slug: string, snapshot: unknown) =>
  loadMenus({ slug, apiKey, snapshot: snapshot as EMApiResponse, snapshotDate: '2026-11-07' });

/** Una carta por local, cada una con su slug de Eligemenú. */
export const locales: Array<{ id: 'oviedo' | 'gijon'; name: string; path: string; slug: string; em: LoadedMenus; platos: MenuData; bebidas?: MenuData }> = [];
for (const [id, name, slug, snap] of [
  ['oviedo', 'Oviedo', 'la-vaca-asustada-oviedo', oviedoSnapshot],
  ['gijon', 'Gijón', 'la-vaca-asustada-gijon-restaurante', gijonSnapshot],
] as const) {
  const em = await get(slug, snap);
  const platos = em.menus.find((m) => /platos/i.test(m.title)) ?? em.menus[0];
  const bebidas = em.menus.find((m) => /bebida/i.test(m.title));
  locales.push({ id, name, path: `/menu-${id}/`, slug, em, platos, bebidas });
}

const oviedo = locales[0].platos.sections.flatMap((s) => s.items);
const find = (re: RegExp) => oviedo.find((i) => re.test(i.name));
/** Las tres carnes destacadas de la portada, buscadas por nombre en la carta de Oviedo. */
export const top = [
  { item: find(/^chuleta selecci/i), title: 'Chuleta Vaca Asustada', origin: 'Península ibérica', photo: 'chuleta' },
  { item: find(/^t-bone/i), title: 'T-bone', origin: 'Angus nacional', photo: 't-bone' },
  { item: find(/^tomahawk/i), title: 'Tomahawk', origin: 'Escocia', photo: 'tomahawk' },
] as const;
