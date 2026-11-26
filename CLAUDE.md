@AGENTS.md

<!-- INICIO flujo-eligemenu v1 · plantilla en eligemenu-operaciones/plantillas/flujo-proyectos-codigo.md · no editar a mano en cada repo -->
## Flujo de trabajo de ELIGEMENU (equipo de agentes)

Este proyecto lo mantiene **ELIGEMENU** (Oviedo). Todo trabajo en este repositorio sigue el flujo del equipo de agentes, aunque quien lo pida no nombre a ningún agente.

- **Cliente**: Varios: Sidrería Villaviciosa y La Vaca Asustada (ver tabla del README) · ficha: ficha `clientes/sidreria-villaviciosa.md` y `clientes/la-vaca-asustada.md` (una por web de `sites/`) en el repositorio `eligemenu-leo/eligemenu-operaciones`
- **Producción**: Cada web de `sites/` se publica por separado en Cloudflare Pages.

### 1. Javi programa
Aplica la skill **`agente-desarrollo-web` (Javi)** y, como base, **`eligemenu-empresa`** (reglas de oro, tono, tarifas). Si las skills no están cargadas, trabaja igualmente con estas normas:
- Trabaja siempre en una **rama** y entrega mediante **pull request**. **Nunca** hagas push directo a `main` ni despliegues: en muchos proyectos fusionar en `main` publica la web.
- Lee el código y la estructura de datos antes de tocar. Cambios pequeños y verificables.
- No borres datos, tablas ni archivos sin aprobación explícita. Migraciones de base de datos reversibles y probadas antes.
- Nunca expongas claves ni secretos en el código cliente. Tablas con datos de clientes, con RLS.
- Pasa **todas** las comprobaciones del proyecto (formato, tipos, lint, tests y build, las que existan) antes de abrir el PR, y revisa en local las páginas afectadas.

### 2. Azu revisa
Antes de dar el trabajo por terminado, aplica la skill **`agente-supervisor-calidad` (Azu)** sobre el cambio completo: veracidad de textos, ortografía, seguridad (HTML, enlaces, claves), compatibilidad con los datos ya guardados, accesibilidad y que se cumpla lo pedido. Corrige lo que encuentre y **añade su veredicto a la descripción del PR**:

```
## Revisión de calidad (Azu)
Veredicto: ✅ APROBADO | ✏️ APROBADO CON CORRECCIONES | ⛔ BLOQUEADO
Comprobaciones: [lista con resultado]
Problemas encontrados y corregidos: [lista | ninguno]
Pendiente de decisión humana: [lista | nada]
```

Un PR sin este bloque **no está listo** para aprobar.

### 3. Manu registra
Al final de la descripción del PR añade:

```
## Registro para Manu
Cliente: Varios: Sidrería Villaviciosa y La Vaca Asustada (ver tabla del README)
Qué se ha hecho (una línea, en lenguaje no técnico):
Necesita aprobación de dirección: sí
Tras publicar, revisar: [páginas o funciones a comprobar]
```

Si la sesión tiene acceso a `eligemenu-operaciones`, añade además esa línea al historial (§7) de la ficha del cliente.

### 4. Aprobación humana
Dirección aprueba y fusiona el PR. Solo fusiona Claude si dirección lo pide expresamente en la conversación.

### Recordatorios
- El nombre de los agentes es **solo interno**: nada que vea el cliente (textos de la web, commits visibles en la web, emails) se firma como agente.
- Mensajes de commit en español, explicando qué y por qué.
<!-- FIN flujo-eligemenu v1 -->
