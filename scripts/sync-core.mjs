#!/usr/bin/env node
// Copia el núcleo (packages/core) dentro de una web: sites/<web>/core.
// Cada web compila solo con su copia, así una actualización del núcleo
// no afecta a ninguna web hasta que se ejecuta este script para ella,
// y cualquier web puede sacarse del repositorio copiando su carpeta.
//
// Uso:  node scripts/sync-core.mjs <web>     (actualiza una web)
//       node scripts/sync-core.mjs --status  (muestra qué webs van por detrás)
import { cpSync, existsSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';

const root = new URL('..', import.meta.url).pathname;
const core = join(root, 'packages/core');
const sites = readdirSync(join(root, 'sites'), { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name);

function hashDir(dir) {
  const h = createHash('sha256');
  const walk = (d) => {
    for (const e of readdirSync(d, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      if (e.name === 'node_modules' || e.name === 'CORE_VERSION.json') continue;
      const p = join(d, e.name);
      if (e.isDirectory()) walk(p);
      else h.update(p.slice(dir.length) + '\0').update(readFileSync(p));
    }
  };
  walk(dir);
  return h.digest('hex').slice(0, 12);
}

const masterVersion = JSON.parse(readFileSync(join(core, 'package.json'), 'utf8')).version;
const masterHash = hashDir(core);

if (process.argv[2] === '--status' || !process.argv[2]) {
  for (const s of sites) {
    const f = join(root, 'sites', s, 'core', 'CORE_VERSION.json');
    const v = existsSync(f) ? JSON.parse(readFileSync(f, 'utf8')) : null;
    const state = !v ? 'sin núcleo' : v.hash === masterHash ? 'al día' : `por detrás (tiene ${v.version}/${v.hash})`;
    console.log(`${s.padEnd(28)} ${state}`);
  }
  console.log(`\nNúcleo actual: ${masterVersion}/${masterHash}`);
  process.exit(0);
}

const site = process.argv[2];
if (!sites.includes(site)) {
  console.error(`No existe sites/${site}. Webs: ${sites.join(', ')}`);
  process.exit(1);
}
const dest = join(root, 'sites', site, 'core');
rmSync(dest, { recursive: true, force: true });
cpSync(core, dest, { recursive: true, filter: (src) => !src.includes('node_modules') });
writeFileSync(join(dest, 'CORE_VERSION.json'), JSON.stringify({ version: masterVersion, hash: masterHash, copiedAt: new Date().toISOString().slice(0, 10) }, null, 2) + '\n');
console.log(`sites/${site}/core actualizado a ${masterVersion}/${masterHash}. Revisa la web, compílala y haz commit.`);
