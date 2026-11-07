# Webs de restaurante (Eligemenú)

| Web | Carpeta | Estado |
| --- | --- | --- |
| sidreriavillaviciosa.es | `sites/sidreria-villaviciosa` | Vista previa; faltan fotos, carta vía Eligemenú, textos originales y legales |
| lavacaasustada.com | `sites/la-vaca-asustada` | Vista previa; faltan fotos, carta vía Eligemenú, reseñas y legales |

## Estructura

```
packages/core/          núcleo maestro (componentes, esquemas, pruebas)
sites/<web>/            web autosuficiente
sites/<web>/core/       copia del núcleo que usa esa web (no editar a mano)
sites/<web>/src/data/   contenido: datos del local, carta, horarios
scripts/sync-core.mjs   lleva el núcleo a una web
```

Cada web se instala, compila y despliega por separado. Para sacar una web a otro proveedor basta con copiar su carpeta: no depende del resto del repositorio.

## Uso

```bash
npm ci && npm test                     # pruebas del núcleo
cd sites/<web> && npm ci && npm run dev  # trabajar en una web
npm run core:status                    # qué webs van por detrás del núcleo
npm run core:sync -- <web>             # actualizar el núcleo de una web
```

## Publicación en Cloudflare Pages (un proyecto por web)

- Directorio raíz: `sites/<web>`
- Comando de compilación: `npm run build` · Directorio de salida: `dist` · Node 22 (`.nvmrc`)
- Rutas que disparan compilación: solo `sites/<web>/*`, para que un cambio en una web no recompile la otra.
- Variable de entorno `ELIGEMENU_API_KEY` (la anon key pública de Eligemenú), en cada proyecto por separado.
- Redirecciones 301 de las URLs antiguas: `sites/<web>/public/_redirects`. Cabeceras (y `noindex` en *.pages.dev): `public/_headers`.

### Cartas desde Eligemenú

Las cartas se piden a la API de Eligemenú **al compilar** (`restaurant-with-menus?slug=…`) y quedan escritas en el HTML. Slugs: `sidreria-villaviciosa`, `la-vaca-asustada-oviedo`, `la-vaca-asustada-gijon-restaurante`.

- Sin `ELIGEMENU_API_KEY` (en local o en CI) se usa la copia guardada en `src/data/eligemenu/*.json`.
- Con la clave, si la API falla la compilación falla a propósito y Cloudflare sigue sirviendo la versión anterior.
- Para que un cambio en Eligemenú llegue a la web hay que recompilar: un *deploy hook* de Cloudflare Pages llamado cada hora (o desde Eligemenú al guardar la carta).
- El horario de la sidrería también sale de Eligemenú.

## Ver las webs sin tocar el DNS

Cada proyecto de Pages tiene una dirección de prueba (`https://<proyecto>.pages.dev`) y otra por rama o pull request. Los dominios siguen apuntando a WordPress hasta el cambio final. Esas direcciones llevan `X-Robots-Tag: noindex` y, si se quiere, se pueden cerrar con Cloudflare Access.

## Dominio y correo (OVH)

El correo sigue en OVH. Para usar el dominio raíz en Cloudflare Pages, la zona DNS tiene que estar en Cloudflare. Antes de cambiar los servidores DNS hay que copiar a Cloudflare, exactamente, los registros de correo de OVH (MX, SPF, DKIM, DMARC y autodiscover si existe) y comprobar el envío y la recepción tras el cambio.

Lo pendiente de cada web está en `sites/<web>/PENDIENTE.md`.
