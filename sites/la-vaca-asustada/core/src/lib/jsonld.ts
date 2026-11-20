import type { LocationData, MenuData, SiteData } from './schema.ts';
import { openingHoursSpec } from './hours.ts';

function restaurant(site: SiteData, loc: LocationData, menuUrl?: string) {
  return {
    '@type': 'Restaurant',
    '@id': `${site.url}#${loc.id}`,
    name: site.locations.length > 1 ? `${site.name} ${loc.name}` : site.name,
    url: site.url,
    telephone: loc.phone,
    ...(loc.email && { email: loc.email }),
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
    openingHoursSpecification: openingHoursSpec(loc.hours),
    ...(menuUrl && { hasMenu: menuUrl }),
    ...(loc.reservationUrl && { acceptsReservations: true }),
  };
}

export function restaurantGraph(site: SiteData, menuUrl?: string) {
  return {
    '@context': 'https://schema.org',
    '@graph': site.locations.map((l) => restaurant(site, l, menuUrl)),
  };
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
