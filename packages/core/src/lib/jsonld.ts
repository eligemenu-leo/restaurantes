import type { LocationData, MenuData, SiteData } from './schema.ts';
import { openingHoursSpec } from './hours.ts';
import { intlPhone } from './format.ts';

/** Datos opcionales que no están en los JSON: imágenes ya compiladas (rutas o URLs). */
export interface GraphOptions {
  /** Carta común a todos los locales; si un local tiene `path`, se usa la suya. */
  menuUrl?: string;
  /** Fotos del restaurante (rutas absolutas dentro de la web o URLs). */
  images?: string[];
  /** Logo de la marca (ruta absoluta dentro de la web o URL). */
  logo?: string;
  /** Solo estos locales (por id). Por defecto, todos. */
  only?: string[];
}

const abs = (site: SiteData, u: string) => new URL(u, site.url).href;
const orgId = (site: SiteData) => `${site.url}/#marca`;

function restaurant(site: SiteData, loc: LocationData, opts: GraphOptions) {
  const page = loc.path ? abs(site, loc.path) : undefined;
  const menuUrl = page ?? (opts.menuUrl && abs(site, opts.menuUrl));
  const multi = site.locations.length > 1;
  return {
    '@type': 'Restaurant',
    '@id': `${site.url}/#${loc.id}`,
    name: multi ? `${site.name} ${loc.name}` : site.name,
    url: page ?? `${site.url}/`,
    telephone: intlPhone(loc.phone),
    ...(loc.email && { email: loc.email }),
    ...(opts.images?.length && { image: opts.images.map((i) => abs(site, i)) }),
    ...(site.priceRange && { priceRange: site.priceRange }),
    servesCuisine: site.cuisine,
    address: {
      '@type': 'PostalAddress',
      streetAddress: loc.address.street,
      postalCode: loc.address.postalCode,
      addressLocality: loc.address.locality,
      addressRegion: loc.address.region,
      addressCountry: loc.address.country,
    },
    ...(loc.geo && { geo: { '@type': 'GeoCoordinates', latitude: loc.geo.lat, longitude: loc.geo.lng } }),
    openingHoursSpecification: openingHoursSpec(loc.hours),
    ...(menuUrl && { hasMenu: menuUrl }),
    ...(loc.reservationUrl && { acceptsReservations: true }),
    ...(multi && { brand: { '@id': orgId(site) } }),
  };
}

/** La marca: nombre, web, logo y perfiles. Solo se añade cuando hay varios locales. */
function organization(site: SiteData, opts: GraphOptions) {
  return {
    '@type': 'Organization',
    '@id': orgId(site),
    name: site.name,
    url: `${site.url}/`,
    ...(opts.logo && { logo: abs(site, opts.logo) }),
    ...(site.social.length && { sameAs: site.social.map((s) => s.url) }),
  };
}

/**
 * Restaurante(s) de la web. El segundo argumento puede ser la URL de la carta (forma antigua)
 * o las opciones.
 */
export function restaurantGraph(site: SiteData, menuUrlOrOpts?: string | GraphOptions) {
  const opts: GraphOptions = typeof menuUrlOrOpts === 'string' ? { menuUrl: menuUrlOrOpts } : menuUrlOrOpts ?? {};
  const locs = site.locations.filter((l) => !opts.only || opts.only.includes(l.id));
  const graph: object[] = locs.map((l) => restaurant(site, l, opts));
  if (site.locations.length > 1) graph.push(organization(site, opts));
  return { '@context': 'https://schema.org', '@graph': graph };
}

export function menuJsonLd(site: SiteData, menu: MenuData, url: string) {
  return {
    '@context': 'https://schema.org',
    '@type': 'Menu',
    name: menu.title,
    url,
    inLanguage: site.lang,
    hasMenuSection: menu.sections.map((s) => ({
      '@type': 'MenuSection',
      name: s.name,
      hasMenuItem: s.items.map((i) => ({
        '@type': 'MenuItem',
        name: i.name,
        ...(i.description && { description: i.description }),
        ...(i.price != null && { offers: { '@type': 'Offer', price: i.price.toFixed(2), priceCurrency: 'EUR' } }),
      })),
    })),
  };
}
