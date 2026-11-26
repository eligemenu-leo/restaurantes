// Carta y bodega en los cinco idiomas del selector (ES, EN, FR, DE, IT), como en la web de La Vaca Asustada.
// Eligemenú devuelve la carta traducida con ?lang=xx y traduce al momento lo que aún no tenga.
// Si una traducción falla al compilar, esa página sale en español con un aviso y noindex, en vez de
// romper la publicación: la carta en español nunca se queda sin actualizar por una traducción.
import { loadMenus, type EMApiResponse } from '@rea/core/lib/eligemenu.ts';
import type { MenuData } from '@rea/core/lib/schema.ts';
import { ELIGEMENU_SLUG, carta as cartaEs, bodega as bodegaEs, emMenus, cartaCompletaPos, bodegaPos, sugerenciasPos } from './index.ts';
import snapshot from './eligemenu/sidreria-villaviciosa.json';

export const LANGS = ['es', 'en', 'fr', 'de', 'it'] as const;
export type Lang = (typeof LANGS)[number];
export type CartaId = 'carta' | 'bodega';

const apiKey = import.meta.env.ELIGEMENU_API_KEY;

export interface CartaIdioma { lang: Lang; translated: boolean; carta: MenuData; bodega: MenuData }

const spanish = (lang: Lang): CartaIdioma => ({ lang, translated: lang === 'es', carta: cartaEs, bodega: bodegaEs });

async function build(lang: Lang): Promise<CartaIdioma> {
  if (lang === 'es') return spanish(lang);
  if (!apiKey) {
    console.log(`[eligemenu] ${ELIGEMENU_SLUG} (${lang}): sin ELIGEMENU_API_KEY, se usa la carta en español`);
    return spanish(lang);
  }
  try {
    // La primera vez, Eligemenú traduce con IA todo lo que falta y puede tardar: como mucho 2 minutos;
    // si no llega, esa carta sale en español y la siguiente compilación ya la tendrá en caché.
    const conLimite: typeof fetch = (u, init) => fetch(u, { ...init, signal: AbortSignal.timeout(120_000) });
    const em = await loadMenus({ slug: ELIGEMENU_SLUG, apiKey, lang, snapshot: snapshot as unknown as EMApiResponse, fetch: conLimite });
    // Los títulos y los nombres de sección vienen traducidos: se eligen por la misma posición que en español.
    const completa = em.menus[cartaCompletaPos];
    const bodega = em.menus[bodegaPos];
    if (!completa || !bodega || em.menus.length !== emMenus.length) throw new Error('la carta traducida no tiene las mismas cartas que la española');
    const carta: MenuData = { ...completa, sections: completa.sections.filter((_, i) => i !== sugerenciasPos) };
    if (carta.sections.length !== cartaEs.sections.length) throw new Error('la carta traducida no tiene las mismas secciones que la española');
    return { lang, translated: true, carta, bodega };
  } catch (e) {
    console.warn(`[eligemenu] ${ELIGEMENU_SLUG} (${lang}): no llegó la traducción (${(e as Error).message}); se usa la carta en español`);
    return spanish(lang);
  }
}

const cache = new Map<Lang, Promise<CartaIdioma>>();
/** Carta y bodega en un idioma (una sola petición a Eligemenú por idioma y compilación). */
export function cartaIdioma(lang: Lang): Promise<CartaIdioma> {
  if (!cache.has(lang)) cache.set(lang, build(lang));
  return cache.get(lang)!;
}

const BASE: Record<CartaId, string> = { carta: '/nuestra-carta/', bodega: '/bodega/' };
/** Ruta de una carta en un idioma: /nuestra-carta/ en español, /nuestra-carta/en/ en inglés. */
export const cartaPath = (id: CartaId, lang: Lang) => `${BASE[id]}${lang === 'es' ? '' : lang + '/'}`;

type Textos = {
  name: string; locale: string; lang: string; toc: string; allergens: string; fallback: string;
  prices: (month: string) => string; askAllergens: string;
  carta: { title: string; description: string; eyebrow: string; h1: string; lead: [string, string, string, string, string] };
  bodega: { title: string; description: string; eyebrow: string; h1: string; lead: string };
};

/**
 * Textos fijos de las páginas de carta en cada idioma. La entradilla de la carta va en trozos para
 * poner los enlaces: [antes, "sugerencias del día", entre medias, "bodega", final].
 */
export const T: Record<Lang, Textos> = {
  es: {
    name: 'Español', locale: 'es-ES', lang: 'Idioma de la carta', toc: 'Secciones de la carta', allergens: 'Alérgenos', fallback: '',
    prices: (m) => `Precios en euros. Carta actualizada en ${m}.`,
    askAllergens: 'Si tienes alguna alergia o intolerancia, pregúntanos: te informamos de los alérgenos de cada plato.',
    carta: {
      title: 'Nuestra carta',
      description: 'Carta de Sidrería Villaviciosa en Oviedo: fabada asturiana IGP, cachopo, pixín, carnes al josper, tablas de quesos asturianos y postres caseros.',
      eyebrow: 'Cocina asturiana', h1: 'Nuestra carta',
      lead: ['Producto de aquí y recetas de siempre. Consulta también las ', 'sugerencias del día', ' y nuestra ', 'bodega', '.'],
    },
    bodega: {
      title: 'Bodega',
      description: 'Vinos de Sidrería Villaviciosa: espumosos, blancos de Rías Baixas y Rueda, rosado de Navarra y tintos de Rioja, Ribera del Duero, Bierzo y Toro.',
      eyebrow: 'Para acompañar', h1: 'Nuestra bodega', lead: 'Además de sidra natural, una selección corta de vinos para cada plato.',
    },
  },
  en: {
    name: 'English', locale: 'en-GB', lang: 'Menu language', toc: 'Menu sections', allergens: 'Allergens',
    fallback: 'The English menu is not available right now. This is the Spanish menu.',
    prices: (m) => `Prices in euros. Menu updated in ${m}.`,
    askAllergens: 'If you have any allergy or intolerance, please ask us: we will tell you the allergens in each dish.',
    carta: {
      title: 'Our menu',
      description: 'Menu of Sidrería Villaviciosa in Oviedo, Asturias: Asturian fabada (PGI), cachopo, monkfish, josper-grilled meats, Asturian cheese boards and homemade desserts.',
      eyebrow: 'Asturian cuisine', h1: 'Our menu',
      lead: ['Local produce and traditional recipes. See also the ', 'daily specials', ' and our ', 'wine list', '.'],
    },
    bodega: {
      title: 'Wine list',
      description: 'Wines at Sidrería Villaviciosa in Oviedo: sparkling wines, whites from Rías Baixas and Rueda, rosé from Navarra and reds from Rioja, Ribera del Duero, Bierzo and Toro.',
      eyebrow: 'To go with your meal', h1: 'Our wine list', lead: 'Besides natural cider, a short selection of wines for every dish.',
    },
  },
  fr: {
    name: 'Français', locale: 'fr-FR', lang: 'Langue de la carte', toc: 'Sections de la carte', allergens: 'Allergènes',
    fallback: 'La carte en français n’est pas disponible pour le moment. Voici la carte en espagnol.',
    prices: (m) => `Prix en euros. Carte mise à jour en ${m}.`,
    askAllergens: 'Si vous avez une allergie ou une intolérance, demandez-nous : nous vous indiquerons les allergènes de chaque plat.',
    carta: {
      title: 'Notre carte',
      description: 'Carte de Sidrería Villaviciosa à Oviedo, Asturies : fabada asturienne IGP, cachopo, lotte, viandes au four josper, plateaux de fromages asturiens et desserts maison.',
      eyebrow: 'Cuisine asturienne', h1: 'Notre carte',
      lead: ['Des produits d’ici et des recettes de toujours. Découvrez aussi les ', 'suggestions du jour', ' et notre ', 'carte des vins', '.'],
    },
    bodega: {
      title: 'Carte des vins',
      description: 'Vins de Sidrería Villaviciosa à Oviedo : mousseux, blancs de Rías Baixas et de Rueda, rosé de Navarre et rouges de Rioja, Ribera del Duero, Bierzo et Toro.',
      eyebrow: 'Pour accompagner', h1: 'Notre carte des vins', lead: 'En plus du cidre naturel, une petite sélection de vins pour chaque plat.',
    },
  },
  de: {
    name: 'Deutsch', locale: 'de-DE', lang: 'Sprache der Speisekarte', toc: 'Abschnitte der Speisekarte', allergens: 'Allergene',
    fallback: 'Die deutsche Speisekarte ist gerade nicht verfügbar. Hier ist die spanische Speisekarte.',
    prices: (m) => `Preise in Euro. Speisekarte aktualisiert im ${m}.`,
    askAllergens: 'Wenn Sie eine Allergie oder Unverträglichkeit haben, fragen Sie uns: Wir nennen Ihnen die Allergene jedes Gerichts.',
    carta: {
      title: 'Unsere Speisekarte',
      description: 'Speisekarte der Sidrería Villaviciosa in Oviedo, Asturien: asturische Fabada (g.g.A.), Cachopo, Seeteufel, Fleisch aus dem Josper-Ofen, asturische Käseplatten und hausgemachte Desserts.',
      eyebrow: 'Asturische Küche', h1: 'Unsere Speisekarte',
      lead: ['Produkte aus der Region und Rezepte von früher. Sehen Sie sich auch die ', 'Tagesempfehlungen', ' und unsere ', 'Weinkarte', ' an.'],
    },
    bodega: {
      title: 'Weinkarte',
      description: 'Weine der Sidrería Villaviciosa in Oviedo: Schaumweine, Weißweine aus Rías Baixas und Rueda, Rosé aus Navarra und Rotweine aus Rioja, Ribera del Duero, Bierzo und Toro.',
      eyebrow: 'Zum Essen', h1: 'Unsere Weinkarte', lead: 'Neben naturtrübem Apfelwein (Sidra) eine kleine Auswahl an Weinen zu jedem Gericht.',
    },
  },
  it: {
    name: 'Italiano', locale: 'it-IT', lang: 'Lingua del menù', toc: 'Sezioni del menù', allergens: 'Allergeni',
    fallback: 'Il menù in italiano non è disponibile al momento. Questo è il menù in spagnolo.',
    prices: (m) => `Prezzi in euro. Menù aggiornato a ${m}.`,
    askAllergens: 'Se hai allergie o intolleranze, chiedici pure: ti indicheremo gli allergeni di ogni piatto.',
    carta: {
      title: 'Il nostro menù',
      description: 'Menù della Sidrería Villaviciosa a Oviedo, Asturie: fabada asturiana IGP, cachopo, rana pescatrice, carni al forno josper, taglieri di formaggi asturiani e dolci fatti in casa.',
      eyebrow: 'Cucina asturiana', h1: 'Il nostro menù',
      lead: ['Prodotti locali e ricette di sempre. Guarda anche i ', 'suggerimenti del giorno', ' e la nostra ', 'carta dei vini', '.'],
    },
    bodega: {
      title: 'Carta dei vini',
      description: 'Vini della Sidrería Villaviciosa a Oviedo: spumanti, bianchi di Rías Baixas e Rueda, rosato di Navarra e rossi di Rioja, Ribera del Duero, Bierzo e Toro.',
      eyebrow: 'Da abbinare', h1: 'La nostra carta dei vini', lead: 'Oltre al sidro naturale, una piccola selezione di vini per ogni piatto.',
    },
  },
};

/** Nombres de los alérgenos en cada idioma (las claves son las del núcleo). */
export const ALLERGEN_NAMES: Record<Exclude<Lang, 'es'>, Record<string, string>> = {
  en: { gluten: 'Gluten', crustaceos: 'Crustaceans', huevo: 'Eggs', pescado: 'Fish', cacahuete: 'Peanuts', soja: 'Soy', lacteos: 'Milk', frutos_cascara: 'Tree nuts', apio: 'Celery', mostaza: 'Mustard', sesamo: 'Sesame', sulfitos: 'Sulphites', altramuces: 'Lupin', moluscos: 'Molluscs' },
  fr: { gluten: 'Gluten', crustaceos: 'Crustacés', huevo: 'Œufs', pescado: 'Poisson', cacahuete: 'Arachides', soja: 'Soja', lacteos: 'Lait', frutos_cascara: 'Fruits à coque', apio: 'Céleri', mostaza: 'Moutarde', sesamo: 'Sésame', sulfitos: 'Sulfites', altramuces: 'Lupin', moluscos: 'Mollusques' },
  de: { gluten: 'Gluten', crustaceos: 'Krebstiere', huevo: 'Eier', pescado: 'Fisch', cacahuete: 'Erdnüsse', soja: 'Soja', lacteos: 'Milch', frutos_cascara: 'Schalenfrüchte', apio: 'Sellerie', mostaza: 'Senf', sesamo: 'Sesam', sulfitos: 'Sulfite', altramuces: 'Lupinen', moluscos: 'Weichtiere' },
  it: { gluten: 'Glutine', crustaceos: 'Crostacei', huevo: 'Uova', pescado: 'Pesce', cacahuete: 'Arachidi', soja: 'Soia', lacteos: 'Latte', frutos_cascara: 'Frutta a guscio', apio: 'Sedano', mostaza: 'Senape', sesamo: 'Sesamo', sulfitos: 'Solfiti', altramuces: 'Lupini', moluscos: 'Molluschi' },
};
