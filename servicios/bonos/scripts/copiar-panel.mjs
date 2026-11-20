#!/usr/bin/env node
// Copia el panel de gestión (servicios/bonos/panel) dentro de una web, en sites/<web>/public/gestion/.
// Cada web lleva su copia, igual que con el núcleo: se puede sacar del repositorio copiando solo su carpeta.
//
// Uso:  node servicios/bonos/scripts/copiar-panel.mjs <web>              (copia o actualiza)
//       node servicios/bonos/scripts/copiar-panel.mjs --comprobar <web>  (falla si la copia está desfasada)
import { cpSync, existsSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';

const root = new URL('../../../', import.meta.url).pathname;
const origen = join(root, 'servicios/bonos/panel');
// Las cabeceras y robots.txt los pone cada web en su public/.
const fuera = new Set(['_headers', 'robots.txt']);

const args = process.argv.slice(2);
const comprobar = args[0] === '--comprobar';
const web = comprobar ? args[1] : args[0];
if (!web || !existsSync(join(root, 'sites', web))) {
  console.error('Uso: copiar-panel.mjs [--comprobar] <web>');
  process.exit(1);
}
const destino = join(root, 'sites', web, 'public/gestion');

const archivos = (dir, base = dir) => readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
  e.isDirectory() ? archivos(join(dir, e.name), base) : [join(dir, e.name).slice(base.length + 1)]).sort();

if (comprobar) {
  const a = archivos(origen).filter((f) => !fuera.has(f));
  const b = existsSync(destino) ? archivos(destino) : [];
  const distintos = [...new Set([...a, ...b])].filter((f) =>
    !a.includes(f) || !b.includes(f) || !readFileSync(join(origen, f)).equals(readFileSync(join(destino, f))));
  if (distintos.length) {
    console.error(`El panel de ${web} está desfasado (${distintos.join(', ')}). Ejecuta: node servicios/bonos/scripts/copiar-panel.mjs ${web}`);
    process.exit(1);
  }
  console.log(`Panel de ${web} al día.`);
} else {
  rmSync(destino, { recursive: true, force: true });
  cpSync(origen, destino, { recursive: true, filter: (p) => !fuera.has(p.slice(origen.length + 1)) });
  console.log(`Panel copiado en sites/${web}/public/gestion/`);
}
