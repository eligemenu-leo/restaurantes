import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';
import bonos from './src/data/bonos.json' with { type: 'json' };

export default defineConfig({
  site: 'https://lavacaasustada.com',
  trailingSlash: 'always',
  build: { format: 'directory' },
  integrations: [sitemap({ filter: (page) => !/(aviso-legal|politica-de)/.test(page) && !(bonos.activo ? /bonos-regalo\/./ : /bonos-regalo/).test(page) })],
});
