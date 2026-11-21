// Imágenes para buscadores y redes sociales, compiladas una sola vez para toda la web.
import { getImage } from 'astro:assets';
import { restaurantGraph } from '@rea/core/lib/jsonld.ts';
import { site } from './index.ts';
import despiece from '../assets/web/MG_6319-2.jpg';
import brasa from '../assets/web/brasa-poster.jpg';
import logoDorado from '../assets/web/Logo-vaca-dorado.png';

/** Imagen al compartir la web (WhatsApp, Facebook…): 1200×630, el tamaño que piden las redes. */
const og = await getImage({ src: despiece, width: 1200, height: 630, fit: 'cover', format: 'jpg', quality: 75 });
export const ogImage = { src: og.src, size: [1200, 630] as [number, number] };

const fotos = await Promise.all([
  getImage({ src: despiece, width: 1600, format: 'jpg', quality: 75 }),
  getImage({ src: brasa, width: 1280, format: 'jpg', quality: 75 }),
]);
const logo = await getImage({ src: logoDorado, width: 484, format: 'png' });

/** Datos estructurados de los locales (todos o solo los indicados), con fotos y logo. */
export const restaurants = (only?: string[]) =>
  restaurantGraph(site, { images: fotos.map((f) => f.src), logo: logo.src, only });
