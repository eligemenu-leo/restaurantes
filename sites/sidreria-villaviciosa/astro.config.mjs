import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';
import { existsSync, readFileSync } from 'node:fs';

const dist = new URL('./dist/', import.meta.url);

// El sitemap solo lista páginas indexables: fuera los textos legales y cualquier página ya compilada
// que lleve noindex (p. ej. una carta cuya traducción no llegó y sale en español).
const indexable = (page) => {
  if (/(aviso-legal|politica-de)/.test(page)) return false;
  const file = new URL(`.${new URL(page).pathname}index.html`, dist);
  if (!existsSync(file)) return true;
  return !/<meta name="robots" content="[^"]*noindex/.test(readFileSync(file, 'utf8'));
};

export default defineConfig({
  site: 'https://sidreriavillaviciosa.es',
  trailingSlash: 'always',
  build: { format: 'directory' },
  integrations: [sitemap({ filter: indexable })],
});
