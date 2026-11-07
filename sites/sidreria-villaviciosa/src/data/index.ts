import { load, Site, Menu } from '@rea/core/lib/schema.ts';
import siteRaw from './site.json';
import cartaRaw from './carta.json';
import bodegaRaw from './bodega.json';
import sugRaw from './sugerencias.json';

export const site = load(Site, siteRaw, 'src/data/site.json');
export const carta = load(Menu, cartaRaw, 'src/data/carta.json');
export const bodega = load(Menu, bodegaRaw, 'src/data/bodega.json');
export const sugerencias = load(Menu, sugRaw, 'src/data/sugerencias.json');
export const local = site.locations[0];
