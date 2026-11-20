# Servicio de bonos regalo (Redsys)

Venta de bonos regalo con el TPV virtual de Redsys. Vive en un proyecto de Supabase propio, separado de Eligemenú
y de las webs: cualquier web (esté donde esté alojada) puede vender bonos con un formulario HTML normal.

## Cómo funciona

1. La web (`/bonos-regalo/`) envía el formulario a la función **bonos-pedido**.
2. `bonos-pedido` comprueba los datos, guarda el pedido y firma la petición para Redsys. Redirige a
   `/bonos-regalo/pago/` de la web con el pedido firmado en el `#`, y esa página lo envía a Redsys
   (Supabase no sirve HTML desde sus funciones).
3. El cliente paga en la página de Redsys. La tarjeta nunca pasa por nuestros servidores.
4. Redsys llama a **bonos-notificacion**: se comprueba la firma, se marca el pedido, se crea el bono
   (`VACA-XXXX-XXXX`) y se envía por correo al comprador, con aviso al restaurante.
5. Redsys devuelve al cliente a `/bonos-regalo/gracias/` o `/bonos-regalo/pago-no-completado/`.

## Puesta en marcha

1. En el SQL Editor del proyecto, ejecutar las migraciones de `supabase/migrations/` en orden.
   Crean las tablas y dejan La Vaca Asustada con el **comercio público de pruebas de Redsys** (999008881).
2. Secretos de las funciones (Edge Functions → Secrets):
   - `REDSYS_CLAVE_LA_VACA_ASUSTADA`: clave SHA-256 del comercio. Para el comercio de pruebas es la
     pública de la documentación de Redsys, `sq7HjrUOBfKmC576ILgskD5srU870gJ7`.
   - `RESEND_API_KEY` y `CORREO_REMITENTE` (p. ej. `La Vaca Asustada <bonos@lavacaasustada.com>`).
     Sin ellos todo funciona pero no salen correos (queda en el registro de la función).
3. Desplegar las funciones con la verificación de JWT desactivada (ya está en `config.toml`). Con la CLI:
   `supabase functions deploy bonos-pedido bonos-notificacion bonos-api --project-ref <ref>`.
   Sin CLI, desde el panel: `sh scripts/empaquetar.sh salida/` deja cada función en un solo archivo para pegarla
   en Edge Functions → Deploy a new function → Via editor, y luego desactivar "Verify JWT" en sus ajustes.
4. En la web, `src/data/bonos.json`: `endpoint` = `https://<ref>.supabase.co/functions/v1/bonos-pedido`
   y `activo: true`. Los importes deben coincidir con `comercios.importes_cent`.

Tarjeta de pruebas de Redsys: 4548810000000003, caducidad 12/49, CVV 123.

## Panel de gestión (`panel/`)

Web estática (HTML, CSS y JS, sin compilación) para el restaurante: resumen de ventas, buscar y canjear bonos
(también escaneando el QR), canje parcial con saldo, editar caducidad y datos, reenviar el correo, anular,
crear bonos a mano, tipos de bono con validez y periodo de venta, ajustes y usuarios (administrador / personal).

- Lee con RLS (cada usuario solo ve su restaurante) y modifica con funciones SQL que comprueban el rol y dejan
  registro en `eventos`. Usuarios y reenvío de correos van por la función `bonos-api`.
- Se publica dentro de cada web que vende bonos, en `/gestion/`. El original está aquí; cada web lleva su copia
  en `public/gestion/`, igual que con el núcleo: `node servicios/bonos/scripts/copiar-panel.mjs <web>`
  (y `--comprobar <web>`, que usa la CI). Las cabeceras de seguridad de `/gestion/*` van en el `_headers` de la web.
  El `_headers` de esta carpeta es para publicarlo suelto, si algún día se prefiere un panel único.
- El QR del correo abre `<web del restaurante>/gestion/#/bono/<código>` (o `PANEL_URL`, si se define ese secreto).
- `config.js` lleva la clave publicable de Supabase (es pública por diseño).
- En Supabase → Authentication: desactivar el registro público ("Allow new users to sign up") y poner la URL
  del panel como Site URL, para que funcione "He olvidado la contraseña".
- Primer administrador: crearlo en Authentication → Users → Add user y darle acceso con
  `insert into miembros (user_id, comercio_id, rol, email) select id, 'la-vaca-asustada', 'admin', email from auth.users where email = '…';`
  Los demás usuarios se añaden desde el propio panel.

## Bono en la Cartera del móvil (Apple Wallet y Google Wallet)

El correo del bono muestra "Añadir a Apple Wallet" y "Añadir a Google Wallet" en cuanto existen los secretos de
cada plataforma (si faltan, no aparece el botón). El pase se genera al pulsar, con el saldo de ese momento, en
`bonos-api/cartera/apple` y `bonos-api/cartera/google` (`_shared/cartera.ts`).

- Imágenes: cada web publica `/bonos-regalo/cartera/` con `icon.png` (29 px, @2x, @3x), `logo.png` (alto 50 px,
  @2x, @3x) y `logo-google.png` (660×660; Google lo recorta en círculo).
- Apple (secretos): `APPLE_TEAM_ID`, `APPLE_PASS_TYPE_ID` (p. ej. `pass.com.eligemenu.bonos`) y, en base64,
  `APPLE_PASS_CERT` (el `.cer` del Pass Type ID), `APPLE_PASS_KEY` (la clave privada PEM con la que se hizo
  la solicitud del certificado) y `APPLE_WWDR_CERT` (intermedio de Apple "Worldwide Developer Relations G4").
  El certificado de Pass Type ID caduca al año: hay que renovarlo y cambiar `APPLE_PASS_CERT`.
- Google (secretos): `GOOGLE_WALLET_EMISOR` (Issuer ID de la consola de Google Pay & Wallet) y
  `GOOGLE_WALLET_CUENTA` (el JSON de la clave de una cuenta de servicio de Google Cloud con la API de Google
  Wallet activada y añadida como usuario del emisor). Hasta que Google apruebe el emisor, solo pueden guardar
  el bono las cuentas de prueba del emisor.
- Pruebas: `deno test --allow-env --allow-read --allow-write --allow-run --node-modules-dir=none test/cartera.deno.ts`
  (firma un .pkpass con certificados falsos y lo comprueba con OpenSSL).

## Pasar a real

Con los datos del banco: actualizar `redsys_fuc` y `redsys_terminal` en `comercios`, cambiar el secreto de la
clave por la de producción y poner `redsys_entorno = 'real'`. Cambiar `web` al dominio definitivo cuando se
mueva el DNS.

## Pruebas

`npm test`: firma y 3DES comprobados contra OpenSSL, decodificación de notificaciones, fechas, y las migraciones
y funciones SQL del panel (permisos, canjes, anulaciones…) sobre un Postgres en memoria (PGlite).
