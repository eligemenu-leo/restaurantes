import { load, Site, Menu } from '@rea/core/lib/schema.ts';
import siteRaw from './site.json';
import menuRaw from './menu.json';

export const site = load(Site, siteRaw, 'src/data/site.json');
export const menu = load(Menu, menuRaw, 'src/data/menu.json');
