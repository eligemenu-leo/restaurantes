// Correos de los bonos. Los usan la notificación de Redsys y el reenvío desde el panel.
import { esc, euros } from './correo.ts';
import type { Bono, Comercio } from './db.ts';
import { urlImagen } from './imagen.ts';

export const fechaLarga = (iso: string) =>
  new Date(`${iso}T12:00:00Z`).toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });

/** Imagen del QR (la sirve la función bonos-api). Al escanearlo se abre la ficha del bono en el panel. */
export const urlQr = (codigo: string) =>
  `${Deno.env.get('SUPABASE_URL')}/functions/v1/bonos-api/qr?c=${encodeURIComponent(codigo)}`;

/** Lo que lleva dentro el QR: la ficha del bono en el panel (/gestion/ de la web, o PANEL_URL si se configura). */
export function urlFicha(web: string | null | undefined, codigo: string) {
  const panel = Deno.env.get('PANEL_URL')?.replace(/\/$/, '') || (web ? `${web.replace(/\/$/, '')}/gestion` : '');
  return panel ? `${panel}/#/bono/${codigo}` : codigo;
}

/** Enlaces para añadir el bono a la Cartera del móvil (solo si están configurados los secretos). */
export function urlsCartera(codigo: string, web?: string | null) {
  const base = `${Deno.env.get('SUPABASE_URL')}/functions/v1/bonos-api/cartera`;
  const c = encodeURIComponent(codigo);
  const sitio = (web || '').replace(/\/+$/, '');
  return {
    // Apple pasa por una página de la web, para que tras "Añadir" no quede una página en blanco.
    apple: Deno.env.get('APPLE_PASS_CERT') ? (sitio ? `${sitio}/bonos-regalo/anadir-a-cartera/?c=${c}` : `${base}/apple?c=${c}`) : null,
    google: Deno.env.get('GOOGLE_WALLET_CUENTA') ? `${base}/google?c=${c}` : null,
  };
}

// Colores y letras de la web (las de La Vaca Asustada por defecto). Arriba va la foto del bono con
// el importe, la misma que en la web (ver imagen.ts: cada web publica bono-base.jpg y bono-fuente.ttf).
const C = { fondo: '#0e0d0c', tarjeta: '#151616', linea: '#2a2826', oro: '#e4c590', oro2: '#ab9066', texto: '#d8cfc2', suave: '#a3998b', blanco: '#ffffff' };
const SERIF = "Forum, Georgia, 'Times New Roman', serif";
const SANS = "'DM Sans', Arial, Helvetica, sans-serif";
const etiqueta = (t: string) =>
  `<div style="font:700 11px/1.3 ${SANS};letter-spacing:3px;text-transform:uppercase;color:${C.oro}">${t}</div>`;

export function correoBono(c: Pick<Comercio, 'nombre' | 'web' | 'locales'>, b: Bono, pie = '') {
  const web = (c.web || '').replace(/\/+$/, '');
  const caduca = fechaLarga(b.caduca);
  const parcial = b.saldo_cent < b.importe_cent;
  const locales = (c.locales ?? []).filter(Boolean);
  const dondeUsar = locales.length ? `en nuestros locales de ${esc(locales.length > 1 ? `${locales.slice(0, -1).join(', ')} y ${locales.at(-1)}` : locales[0])}` : 'en el restaurante';
  const cartera = urlsCartera(b.codigo, c.web);
  const fila = (html: string, estilo = '') => `<tr><td class="px" style="padding:0 40px;${estilo}">${html}</td></tr>`;

  const html = `<!doctype html>
<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="dark"><meta name="supported-color-schemes" content="dark">
<title>Bono regalo de ${esc(c.nombre)}</title>
<link href="https://fonts.googleapis.com/css2?family=Forum&family=DM+Sans:wght@400;700&display=swap" rel="stylesheet">
<style>@media (max-width:620px){.px{padding-left:24px!important;padding-right:24px!important}}</style>
</head>
<body style="margin:0;padding:0;background:${C.fondo};-webkit-text-size-adjust:100%">
<div style="display:none;max-height:0;overflow:hidden;opacity:0">${parcial ? `Saldo disponible: ${euros(b.saldo_cent)}` : euros(b.importe_cent)} para disfrutar en ${esc(c.nombre)}. Válido hasta el ${caduca}.</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.fondo}"><tr><td align="center" style="padding:32px 12px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:${C.tarjeta};border:1px solid ${C.linea}">
  <tr><td style="height:4px;background:${C.oro};font-size:0;line-height:0">&nbsp;</td></tr>
  <tr><td style="padding:0;font-size:0;line-height:0">
    <img src="${urlImagen(b.codigo, parcial ? b.saldo_cent : b.importe_cent)}" width="558" alt="Bono regalo de ${esc(c.nombre)}: ${euros(parcial ? b.saldo_cent : b.importe_cent)}" style="display:block;border:0;width:100%;max-width:558px;height:auto;background:#1b1b1b;font:400 26px/1.4 ${SERIF};color:${C.oro};text-align:center">
  </td></tr>
  <tr><td align="center" class="px" style="padding:26px 40px 0">
    ${parcial
      ? `${etiqueta('Saldo disponible')}<div style="margin-top:8px;font:400 15px/1.5 ${SANS};color:${C.suave}">de un bono de ${euros(b.importe_cent)}</div>`
      : `<div style="font:italic 400 22px/1.35 ${SERIF};color:${C.blanco}">Un regalo para disfrutar, compartir y recordar.</div>`}
    <div style="width:48px;height:1px;margin:18px auto 0;background:${C.oro};font-size:0;line-height:0">&nbsp;</div>
  </td></tr>
  ${b.destinatario_nombre || b.mensaje ? `<tr><td class="px" style="padding:30px 40px 0">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td style="border-left:2px solid ${C.oro2};padding:4px 0 4px 18px">
      ${b.destinatario_nombre ? `<div style="font:400 15px/1.5 ${SANS};color:${C.suave}">Para <span style="color:${C.blanco};font-weight:700">${esc(b.destinatario_nombre)}</span>${b.titular_nombre ? `, de parte de <span style="color:${C.blanco}">${esc(b.titular_nombre)}</span>` : ''}</div>` : ''}
      ${b.mensaje ? `<div style="margin-top:${b.destinatario_nombre ? 8 : 0}px;font:italic 400 19px/1.45 ${SERIF};color:${C.texto}">«${esc(b.mensaje)}»</div>` : ''}
    </td></tr></table></td></tr>` : ''}
  <tr><td align="center" class="px" style="padding:34px 40px 0">
    <table role="presentation" cellpadding="0" cellspacing="0" style="border:1px solid ${C.linea}"><tr><td align="center" style="padding:24px 28px">
      <table role="presentation" cellpadding="0" cellspacing="0"><tr><td style="background:#ffffff;padding:10px">
        <img src="${urlQr(b.codigo)}" width="160" height="160" alt="Código QR del bono ${b.codigo}" style="display:block;border:0;width:160px;height:160px">
      </td></tr></table>
      <div style="margin-top:18px">${etiqueta('Código')}</div>
      <div style="margin-top:6px;font:700 22px/1.2 'Courier New',Courier,monospace;letter-spacing:3px;color:${C.blanco}">${b.codigo}</div>
    </td></tr></table>
  </td></tr>
  ${cartera.apple || cartera.google ? `<tr><td align="center" class="px" style="padding:22px 40px 0">
    <div style="font:400 13px/1.5 ${SANS};color:${C.suave};margin-bottom:10px">Llévalo en el móvil</div>
    <table role="presentation" cellpadding="0" cellspacing="0" align="center">
      ${cartera.apple ? `<tr><td style="padding:4px"><a href="${esc(cartera.apple)}" style="display:inline-block;background:#000;border:1px solid #5c5c5c;border-radius:8px;padding:12px 0;width:210px;text-align:center;font:600 14px/1 ${SANS};color:#fff;text-decoration:none">Añadir a Apple Wallet</a></td></tr>` : ''}
      ${cartera.google ? `<tr><td style="padding:4px"><a href="${esc(cartera.google)}" style="display:inline-block;background:#000;border:1px solid #5c5c5c;border-radius:8px;padding:12px 0;width:210px;text-align:center;font:600 14px/1 ${SANS};color:#fff;text-decoration:none">Añadir a Google Wallet</a></td></tr>` : ''}
    </table></td></tr>` : ''}
  ${fila(`<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:30px;border-top:1px solid ${C.linea};border-bottom:1px solid ${C.linea}"><tr>
      <td width="50%" style="padding:16px 8px 16px 0;vertical-align:top">${etiqueta('Válido hasta')}<div style="margin-top:6px;font:400 18px/1.3 ${SERIF};color:${C.blanco}">${caduca}</div></td>
      <td width="50%" style="padding:16px 0 16px 8px;vertical-align:top">${etiqueta('Dónde')}<div style="margin-top:6px;font:400 18px/1.3 ${SERIF};color:${C.blanco}">${esc(locales.join(' · ') || c.nombre)}</div></td>
    </tr></table>`, '')}
  <tr><td class="px" style="padding:26px 40px 0;font:400 15px/1.65 ${SANS};color:${C.texto}">
    <div style="font:400 22px/1.2 ${SERIF};color:${C.blanco};margin-bottom:10px">Cómo usarlo</div>
    Úsalo ${dondeUsar}: al pedir la cuenta, enseña este correo (el QR o el código). Se descuenta del total${parcial ? '' : ' y, si no lo gastas entero, el saldo que quede sigue disponible hasta la fecha de caducidad'}.
  </td></tr>
  ${web ? `<tr><td align="center" style="padding:30px 40px 0">
    <table role="presentation" cellpadding="0" cellspacing="0"><tr><td style="border:1px solid ${C.oro}">
      <a href="${esc(web)}/" style="display:inline-block;padding:15px 34px;font:400 12px/1 ${SERIF};letter-spacing:3.6px;text-transform:uppercase;color:${C.oro};text-decoration:none">Reservar mesa</a>
    </td></tr></table></td></tr>` : ''}
  <tr><td class="px" style="padding:34px 40px 36px;font:400 12px/1.6 ${SANS};color:${C.suave}" align="center">
    ${b.titular_nombre ? `Gracias por tu compra, ${esc(b.titular_nombre)}.<br>` : ''}${pie ? `${esc(pie)}<br>` : ''}Guarda este correo: es tu bono. Si tienes cualquier duda, responde a este mensaje.
  </td></tr>
</table>
${web ? `<div style="padding:18px 0 0;font:400 11px/1.5 ${SANS};color:#6f675d"><a href="${esc(web)}/" style="color:#6f675d;text-decoration:none">${esc(web.replace(/^https?:\/\//, ''))}</a></div>` : ''}
</td></tr></table>
</body></html>`;
  return { asunto: `Tu bono regalo de ${c.nombre}`, html };
}

export function correoAviso(b: Bono, extra: { pedido?: string; autorizacion?: string; email?: string } = {}) {
  return {
    asunto: `Bono vendido: ${euros(b.importe_cent)} (${b.codigo})`,
    html: `<p>Se ha vendido un bono regalo de <strong>${euros(b.importe_cent)}</strong>.</p>
      <p>Código: <strong>${b.codigo}</strong><br>Caduca: ${fechaLarga(b.caduca)}<br>
      Comprador: ${esc(b.titular_nombre ?? '')} (${esc(extra.email ?? b.titular_email ?? '')})<br>
      ${b.titular_telefono ? `Teléfono: ${esc(b.titular_telefono)}<br>` : ''}
      ${b.destinatario_nombre ? `Para: ${esc(b.destinatario_nombre)}<br>` : ''}
      ${extra.pedido ? `Pedido Redsys: ${extra.pedido} · autorización ${esc(extra.autorizacion ?? '')}` : ''}</p>`,
  };
}
