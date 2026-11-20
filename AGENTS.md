# Instrucciones para asistentes (Claude Code y Codex)

Repositorio de webs de restaurante de Eligemenú. Núcleo común en `packages/core`, una carpeta por web en `sites/`.

## Independencia de cada web
Cada web es autosuficiente: `sites/<web>` tiene su propia copia del núcleo (`sites/<web>/core`), su `package-lock.json` y su proyecto de despliegue. Se puede llevar a otro proveedor copiando solo su carpeta.
- No edites `sites/<web>/core` a mano. Los cambios del núcleo se hacen en `packages/core` y se llevan a cada web con `npm run core:sync -- <web>`, una web cada vez, revisándola antes de publicar.
- `npm run core:status` muestra qué webs van por detrás del núcleo.
- Una web nunca importa nada de otra web ni de `packages/` directamente.

## Reglas
- El contenido de cada web vive en `sites/<web>/src/data/*.json` y se valida con `packages/core/src/lib/schema.ts`. Para cambiar textos, precios u horarios, edita el JSON, no las páginas.
- Nada entra en `packages/core` hasta que lo usan dos webs. Lo específico de una web se queda en su carpeta.
- Cada web define su identidad en `src/styles/theme.css` (tokens `--c-*`, `--f-*`). Los componentes del núcleo no imponen estética.
- Sin JavaScript en cliente salvo necesidad justificada. Sin cookies ni analítica sin consentimiento.
- Un día sin horario y no declarado en `closedDays` se muestra como "Consultar". No inventes horarios ni cierres.
- Las URLs antiguas de WordPress se redirigen con 301 en `public/_redirects`. Ninguna URL indexada puede quedar en 404.
- Nunca publiques en producción ni cambies DNS sin aprobación explícita.

## Comprobaciones antes de entregar
- `npm test` (núcleo) y `npm run build` (todas las webs) sin errores.
- Accesibilidad sin violaciones de axe (WCAG 2.2 AA) y Lighthouse móvil ≥ 95 en las cuatro categorías.
