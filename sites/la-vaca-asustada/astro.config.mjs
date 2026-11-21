import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';
import { existsSync, readFileSync } from 'node:fs';

const dist = new URL('./dist/', import.meta.url);

// El sitemap solo lista páginas indexables: se lee cada página ya compilada y se deja fuera la que
// lleva noindex (legales, bonos mientras no sean públicos, cartas cuya traducción no llegó…).
// Así el sitemap nunca contradice a la propia página.
const indexable = (page) => {
  const file = new URL(`.${new URL(page).pathname}index.html`, dist);
  if (!existsSync(file)) return true;
  return !/<meta name="robots" content="[^"]*noindex/.test(readFileSync(file, 'utf8'));
};

export default defineConfig({
  site: 'https://lavacaasustada.com',
  trailingSlash: 'always',
  build: { format: 'directory' },
  integrations: [sitemap({ filter: indexable })],
});
