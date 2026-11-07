# Integración EligeMenu: cómo obtienen la carta las webs WordPress

Revisado el 2026-11-07 en los paneles de WordPress de las dos webs, solo en modo lectura: no se guardó ni se cambió nada. **Este documento no incluye ninguna clave.**

## Plugin

- Nombre: **EligeMenu Integration Pro** (`eligemenu-integration`), versión **2.17.3.3608056638**, la misma en las dos webs.
- Ofrece widgets de Elementor (`em_*`), shortcodes y un selector de idioma.
- Ajustes en *Ajustes › EligeMenu* (`admin.php?page=eligemenu-settings`). Tiene también una página de *Diagnóstico*.

## Ajustes configurados

| Campo (`eligemenu_settings[...]`) | Sidrería Villaviciosa | La Vaca Asustada |
|---|---|---|
| `supabase_url` (URL de Supabase) | `https://jcfiarsoqvczjavikgoh.supabase.co` | `https://jcfiarsoqvczjavikgoh.supabase.co` |
| `api_key` (API Key, Anon Key de Supabase) | **Existe** (valor no copiado) | **Existe** (valor no copiado) |
| `cache_duration` (segundos) | 120 | 3600 |
| `eligemenu_hide_zero_decimals` (opción aparte) | No | Sí (10,00 € se muestra como 10 €) |

Las dos webs usan el mismo proyecto Supabase de EligeMenu. Para la web nueva hará falta la *anon key*, que se puede copiar del panel de WordPress o pedir en EligeMenu. Es una clave pública de Supabase, pero aun así conviene guardarla como variable de entorno de Cloudflare Pages y no dejarla en el repositorio.

## Cómo llama a la API (`includes/api-client.php`)

Todas las peticiones pasan por el método `get($endpoint, $params)`:

- **URL:** `{supabase_url}/functions/v1/{endpoint}`, con `$params` añadidos como query string mediante `add_query_arg`. Si la URL configurada ya acaba en `/functions/v1`, no lo duplica.
- **Método:** `GET` (`wp_remote_get`).
- **Cabeceras:**
  - `apikey: <anon key>`
  - `Authorization: Bearer <anon key>`
  - `Content-Type: application/json`
  - `X-Plugin-Version`
  - `Referer`
  - `If-None-Match` (ETag), cuando hay una versión en caché.
- **Idioma:**
  - Añade el parámetro `lang` (`$params['lang']`).
  - Idiomas admitidos además del español: `en`, `fr`, `de`, `it`.
  - El idioma se toma primero del parámetro de URL `eligemenu_lang` y luego de la cookie o `localStorage` `eligemenu_lang`, que escribe el selector `em_lang_selector`. Si no hay ninguno, usa el idioma de WordPress. Por defecto es `es`.
- **Respuesta y errores:**
  - Hace `json_decode` del cuerpo y lo devuelve tal cual, sin desempaquetar ningún campo `data`.
  - `200` es correcto. `304` reutiliza la caché.
  - Cualquier otro código devuelve un `WP_Error` (`api_error`, `json_error`, `missing_config`).
  - Tiene un *circuit breaker*: tras varios errores seguidos deja de llamar durante un tiempo.
- **Caché:** transients de WordPress, guardando `data`, `etag` y `timestamp`, durante el tiempo de `cache_duration`.

### Endpoints (todos bajo `/functions/v1/`)

| Método PHP | Endpoint | Parámetros |
|---|---|---|
| `get_restaurant($slug)` | `wordpress-api/restaurant` | `slug` |
| `get_restaurant_by_id($id)` | `wordpress-api/restaurant` | `id` |
| `get_restaurant_complete($slug)` | `wordpress-api/restaurant-with-menus` | `slug` |
| `get_restaurants()` | `wordpress-api/restaurants` | — |
| `get_menu_by_id($id)` | `wordpress-api/menu` | `id` |
| `get_menus($slug)` (y a partir de él `get_menu_groups`, `get_menus_structured`, `get_single_menu_group`) | `wordpress-api/menus` | `restaurant_slug` |
| `get_daily_menus($slug, $date)` | `wordpress-api/daily-menus` | `restaurant_slug`, `date` (YYYY-MM-DD) |
| **`get_menu_group_by_id($id)`** (el que usan las cartas actuales) | **`wordpress-api/menu-group`** | **`id`** |
| `get_dish($id)` | `wordpress-api/dish` | `id` |
| `get_restaurant_specialties($slug)` | `wordpress-api/specialties` | `restaurant_slug` |
| `get_restaurant_suggestions($slug)` | `wordpress-api/suggestions` | `restaurant_slug` |

Ejemplo de la llamada que hace la carta, con la clave sustituida por un marcador:

```
GET https://jcfiarsoqvczjavikgoh.supabase.co/functions/v1/wordpress-api/menu-group?id=<menu_group_id>&lang=en
apikey: <ANON_KEY>
Authorization: Bearer <ANON_KEY>
```

Además, `includes/tracking.php` envía estadísticas de visitas a otra función bajo `/functions/v1`. No pude leer el nombre exacto porque el navegador bloqueó esa línea por llevar query string. Si se quiere mantener el tracking, hay que revisarlo.

### Formato de la respuesta

No hice ninguna llamada real a la API. Este formato sale de los campos que lee el código de los widgets y las plantillas:

- **Grupo de carta** (`menu-group`):
  - `id`, `name`, `description`
  - `dishes`, `menu_dishes` o `daily_menu_dishes`: lista de platos
- **Plato:**
  - `id`, `name`, `description`, `image_url`
  - `price_1`, `price_unit`, `price_unit_suffix`
  - `price_2`, `price_unit_2`, `price_unit_2_suffix`
  - `allergens` o `dish_allergens`: lista de alérgenos con `name`
  - `tags` o `dish_tags`
  - `is_specialty`
- **Carta o menú** (`menu`, `menus`):
  - `id` o `menu_id`, `restaurant_id`, `restaurant_name`, `name`, `description`
  - `menu_groups` o `groups`: lista de grupos, ordenados por `display_order`
  - `is_visible`, `prices_visible`, `is_group_menu`
  - `price`, `half_price`, `half_menu_price`, `people_count`
  - `start_date`, `end_date`, `show_dates`, `available_days`, `days_available`, `meal_times`
  - `observations`
  - `daily_menu_dish_groups`, solo en los menús del día
- **Restaurante** (`restaurant`):
  - `id`, `name`, `slug`, `description`
  - `phone`, `whatsapp`, `email`, `url`
  - `address`, `population`
  - `logo_url`, `image_url`
  - `schedule` o `schedules`

El plugin también genera JSON-LD de schema.org (`hasMenuItem`, `offers`, `suitableForDiet`), que conviene reproducir en la web nueva.

## Shortcodes disponibles

Según la ayuda del panel, son `[eligemenu_daily_menus slug="…" date="YYYY-MM-DD"]`, `[eligemenu_menus slug="…"]`, `[eligemenu_info slug="…"]` y `[eligemenu_full slug="…"]`. También existen `em_daily_menus_list`, `em_daily_menu_single`, `em_menu_groups`, `em_dish_card`, `em_filters` y `em_schedule_banner`.

**Ninguna de las páginas revisadas usa shortcodes.** Todas usan widgets de Elementor. Los datos salen de `_elementor_data`, leído por la REST API con una petición GET.

## Widgets usados en cada página

### Sidrería Villaviciosa – `/nuestra-carta/` (página 4894)

- `em_lang_selector`, con los valores por defecto: es, en, fr, de, it.
- Seis `em_menu_group_single`. Todos tienen `show_currency_symbol` desactivado. En los cuatro centrales también está desactivado `show_specialty_badge`.

| Sección (título renderizado) | `menu_group_id` |
|---|---|
| Ensaladas | `f5b6463d-e7c8-45dd-95d0-c5bc6e2181c9` |
| Entrantes | `bb7bbb08-ec56-4a9a-9395-eb60e919a0bf` |
| Pescados | `ef3e3948-b08a-4399-b06e-37f8dd78ee34` |
| Carnes | `974a1470-a5c0-4d01-b9a3-d6725aa88e3a` |
| Carnes al Josper | `41974a5b-7db5-4946-91ea-b2ac1fe931c8` |
| Postres | `e9553d2d-e50d-4c64-95bf-074fc4030532` |

### Sidrería Villaviciosa – `/bodega/` (página 6672)

- Un `em_menu_groups` con `menu_id = 08533334-d341-4659-b38f-0f1b78af9b56` y `display_mode = flat`, que muestra todos los grupos de esa carta seguidos: Espumosos, etc.
- Sin selector de idioma.
- No tiene `restaurant_slug` configurado: la carta se identifica solo por `menu_id`.

### La Vaca Asustada – `/menu-2026/` (página 1914)

- `em_lang_selector` (es, en, fr, de, it).
- Cuatro `em_menu_group_single` dentro de pestañas de Elementor (`nested-tabs`). Todos tienen `layout_style = grid`, y `show_group_title` y `show_column_dividers` desactivados, porque el título lo pone la pestaña.

| Pestaña | `menu_group_id` |
|---|---|
| ENTRANTES | `7ce78583-4b4f-4cf4-b8e3-e869daa03e34` |
| PRINCIPALES AL CARBÓN | `ae816c48-ee1d-4c28-8f0f-a7d065926f17` |
| GUARNICIONES | `a9f2945c-8c30-4327-b51a-35e43b4a5c2d` |
| POSTRES | `c7e2985e-1710-43f1-b3d6-f701e580c680` |

`/menu-oviedo/` (página 1769) usa exactamente los mismos cuatro grupos y la misma configuración, pero sin selector de idioma.

## Qué implica para la migración

- Basta con llamar a `GET /functions/v1/wordpress-api/menu-group?id=…&lang=…` por cada grupo, o a `wordpress-api/menu?id=…` para la bodega, con la anon key en las cabeceras `apikey` y `Authorization`.
- Se puede llamar en tiempo de build (SSG en Cloudflare Pages) o en el borde (Pages Functions con caché). En ambos casos la clave queda en el servidor y no en el navegador.
- Cada web tiene sus propios IDs de grupos y cartas. La configuración debe vivir en cada sitio por separado: URL, clave e IDs por web, sin compartirse, para que cada una se pueda mover de proveedor sin afectar a la otra.
- Idiomas: es (por defecto), en, fr, de, it.
