# Webs de restaurante (Eligemenú)

| Web | Carpeta | Estado |
| --- | --- | --- |
| sidreriavillaviciosa.es | `sites/sidreria-villaviciosa` | Vista previa; faltan fotos, textos originales y legales |
| lavacaasustada.com | `sites/la-vaca-asustada` | Vista previa; faltan fotos, reseñas y legales |

```bash
npm install
npm test             # pruebas del núcleo
npm run build        # compila todas las webs en sites/*/dist
cd sites/<web> && npx astro dev   # desarrollo local
```

Publicación prevista: Cloudflare Pages, un proyecto por web, con directorio raíz `sites/<web>`, comando `npm run build` y salida `dist`. Las redirecciones están en `public/_redirects`.

Lo pendiente de cada web está en `sites/<web>/PENDIENTE.md`.
