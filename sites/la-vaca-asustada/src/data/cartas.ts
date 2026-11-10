// Cartas de cada local en los cinco idiomas del selector (ES, EN, FR, DE, IT).
// Eligemenú devuelve la carta traducida con ?lang=xx y traduce al momento lo que aún no tenga.
// Si una traducción falla al compilar, esa página sale en español con un aviso, en vez de
// romper la publicación: la carta en español nunca se queda sin actualizar por una traducción.
import { loadMenus, type EMApiResponse } from '@rea/core/lib/eligemenu.ts';
import type { MenuData } from '@rea/core/lib/schema.ts';
import { locales } from './index.ts';
import oviedoSnapshot from './eligemenu/la-vaca-asustada-oviedo.json';
import gijonSnapshot from './eligemenu/la-vaca-asustada-gijon-restaurante.json';

export const LANGS = ['es', 'en', 'fr', 'de', 'it'] as const;
export type Lang = (typeof LANGS)[number];
export type LocalId = 'oviedo' | 'gijon';

const snapshots: Record<LocalId, unknown> = { oviedo: oviedoSnapshot, gijon: gijonSnapshot };
const apiKey = import.meta.env.ELIGEMENU_API_KEY;

export interface Carta { lang: Lang; translated: boolean; platos: MenuData; bebidas?: MenuData }

const cache = new Map<string, Promise<Carta>>();

async function build(id: LocalId, lang: Lang): Promise<Carta> {
  const l = locales.find((x) => x.id === id)!;
  if (lang === 'es') return { lang, translated: true, platos: l.platos, bebidas: l.bebidas };
  if (!apiKey) {
    console.log(`[eligemenu] ${l.slug} (${lang}): sin ELIGEMENU_API_KEY, se usa la carta en español`);
    return { lang, translated: false, platos: l.platos, bebidas: l.bebidas };
  }
  try {
    // La primera vez, Eligemenú traduce con IA todo lo que falta y puede tardar: como mucho 2 minutos
    // por carta; si no llega, esa carta sale en español y la siguiente compilación ya la tendrá en caché.
    const conLimite: typeof fetch = (u, init) => fetch(u, { ...init, signal: AbortSignal.timeout(120_000) });
    const em = await loadMenus({ slug: l.slug, apiKey, lang, snapshot: snapshots[id] as EMApiResponse, fetch: conLimite });
    // Mismo orden y misma elección de cartas que en español (los títulos ya vienen traducidos).
    const idx = (m?: MenuData) => (m ? l.em.menus.indexOf(m) : -1);
    const platos = em.menus[idx(l.platos)] ?? em.menus[0];
    const bebidas = l.bebidas ? em.menus[idx(l.bebidas)] : undefined;
    return { lang, translated: true, platos, bebidas };
  } catch (e) {
    console.warn(`[eligemenu] ${l.slug} (${lang}): no llegó la traducción (${(e as Error).message}); se usa la carta en español`);
    return { lang, translated: false, platos: l.platos, bebidas: l.bebidas };
  }
}

export function carta(id: LocalId, lang: Lang): Promise<Carta> {
  const k = `${id}:${lang}`;
  if (!cache.has(k)) cache.set(k, build(id, lang));
  return cache.get(k)!;
}

/** Textos fijos de la página de menú en cada idioma. */
export const T = {
  es: { menu: 'Menú', sub: 'Menú especializado en carnes maduradas', lang: 'Idioma de la carta', tabs: 'Secciones de la carta', allergens: 'Alérgenos', drinks: 'Bebidas', fallback: '', reserve: 'Reserva tu mesa en', other: 'Ver el menú de', pick: 'Elige restaurante', name: 'Español' },
  en: { menu: 'Menu', sub: 'Menu specialising in dry-aged beef', lang: 'Menu language', tabs: 'Menu sections', allergens: 'Allergens', drinks: 'Drinks', fallback: 'The English menu is not available right now. This is the Spanish menu.', reserve: 'Book your table in', other: 'See the menu of', pick: 'Choose restaurant', name: 'English' },
  fr: { menu: 'Menu', sub: 'Menu spécialisé en viandes maturées', lang: 'Langue de la carte', tabs: 'Sections de la carte', allergens: 'Allergènes', drinks: 'Boissons', fallback: 'La carte en français n’est pas disponible pour le moment. Voici la carte en espagnol.', reserve: 'Réservez votre table à', other: 'Voir le menu de', pick: 'Choisissez le restaurant', name: 'Français' },
  de: { menu: 'Speisekarte', sub: 'Speisekarte mit Spezialität auf trocken gereiftem Fleisch', lang: 'Sprache der Speisekarte', tabs: 'Abschnitte der Speisekarte', allergens: 'Allergene', drinks: 'Getränke', fallback: 'Die deutsche Speisekarte ist gerade nicht verfügbar. Hier ist die spanische Speisekarte.', reserve: 'Tisch reservieren in', other: 'Speisekarte von', pick: 'Restaurant wählen', name: 'Deutsch' },
  it: { menu: 'Menù', sub: 'Menù specializzato in carni frollate', lang: 'Lingua del menù', tabs: 'Sezioni del menù', allergens: 'Allergeni', drinks: 'Bevande', fallback: 'Il menù in italiano non è disponibile al momento. Questo è il menù in spagnolo.', reserve: 'Prenota il tuo tavolo a', other: 'Vedi il menù di', pick: 'Scegli il ristorante', name: 'Italiano' },
} satisfies Record<Lang, Record<string, string>>;

/** Nombres de los alérgenos en cada idioma (las claves son las del núcleo). */
export const ALLERGEN_NAMES: Record<Exclude<Lang, 'es'>, Record<string, string>> = {
  en: { gluten: 'Gluten', crustaceos: 'Crustaceans', huevo: 'Eggs', pescado: 'Fish', cacahuete: 'Peanuts', soja: 'Soy', lacteos: 'Milk', frutos_cascara: 'Tree nuts', apio: 'Celery', mostaza: 'Mustard', sesamo: 'Sesame', sulfitos: 'Sulphites', altramuces: 'Lupin', moluscos: 'Molluscs' },
  fr: { gluten: 'Gluten', crustaceos: 'Crustacés', huevo: 'Œufs', pescado: 'Poisson', cacahuete: 'Arachides', soja: 'Soja', lacteos: 'Lait', frutos_cascara: 'Fruits à coque', apio: 'Céleri', mostaza: 'Moutarde', sesamo: 'Sésame', sulfitos: 'Sulfites', altramuces: 'Lupin', moluscos: 'Mollusques' },
  de: { gluten: 'Gluten', crustaceos: 'Krebstiere', huevo: 'Eier', pescado: 'Fisch', cacahuete: 'Erdnüsse', soja: 'Soja', lacteos: 'Milch', frutos_cascara: 'Schalenfrüchte', apio: 'Sellerie', mostaza: 'Senf', sesamo: 'Sesam', sulfitos: 'Sulfite', altramuces: 'Lupinen', moluscos: 'Weichtiere' },
  it: { gluten: 'Glutine', crustaceos: 'Crostacei', huevo: 'Uova', pescado: 'Pesce', cacahuete: 'Arachidi', soja: 'Soia', lacteos: 'Latte', frutos_cascara: 'Frutta a guscio', apio: 'Sedano', mostaza: 'Senape', sesamo: 'Sesamo', sulfitos: 'Solfiti', altramuces: 'Lupini', moluscos: 'Molluschi' },
};

/** Ruta de la carta de un local en un idioma: /menu-gijon/ en español, /menu-gijon/en/ en inglés. */
export const cartaPath = (id: LocalId, lang: Lang) => `/menu-${id}/${lang === 'es' ? '' : lang + '/'}`;
