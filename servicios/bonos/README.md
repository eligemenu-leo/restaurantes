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

1. En el SQL Editor del proyecto, ejecutar `supabase/migrations/20261109120000_bonos.sql`.
   Crea las tablas y deja La Vaca Asustada con el **comercio público de pruebas de Redsys** (999008881).
2. Secretos de las funciones (Edge Functions → Secrets):
   - `REDSYS_CLAVE_LA_VACA_ASUSTADA`: clave SHA-256 del comercio. Para el comercio de pruebas es la
     pública de la documentación de Redsys, `sq7HjrUOBfKmC576ILgskD5srU870gJ7`.
   - `RESEND_API_KEY` y `CORREO_REMITENTE` (p. ej. `La Vaca Asustada <bonos@lavacaasustada.com>`).
     Sin ellos todo funciona pero no salen correos (queda en el registro de la función).
3. Desplegar las funciones con la verificación de JWT desactivada (ya está en `config.toml`). Con la CLI:
   `supabase functions deploy bonos-pedido bonos-notificacion --project-ref <ref>`.
   Sin CLI, desde el panel: `sh scripts/empaquetar.sh salida/` deja cada función en un solo archivo para pegarla
   en Edge Functions → Deploy a new function → Via editor, y luego desactivar "Verify JWT" en sus ajustes.
4. En la web, `src/data/bonos.json`: `endpoint` = `https://<ref>.supabase.co/functions/v1/bonos-pedido`
   y `activo: true`. Los importes deben coincidir con `comercios.importes_cent`.

Tarjeta de pruebas de Redsys: 4548810000000003, caducidad 12/49, CVV 123.

## Pasar a real

Con los datos del banco: actualizar `redsys_fuc` y `redsys_terminal` en `comercios`, cambiar el secreto de la
clave por la de producción y poner `redsys_entorno = 'real'`. Cambiar `web` al dominio definitivo cuando se
mueva el DNS.

## Pruebas

`npm test`: firma y 3DES comprobados contra OpenSSL, decodificación de notificaciones y formatos.
