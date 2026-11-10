// Correos de los bonos. Los usan la notificación de Redsys y el reenvío desde el panel.
import { esc, euros } from './correo.ts';
import type { Bono, Comercio } from './db.ts';

const fechaLarga = (iso: string) =>
  new Date(`${iso}T12:00:00Z`).toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });

/** Imagen del QR (la sirve la función bonos-api). Al escanearlo se abre la ficha del bono en el panel. */
export const urlQr = (codigo: string) =>
  `${Deno.env.get('SUPABASE_URL')}/functions/v1/bonos-api/qr?c=${encodeURIComponent(codigo)}`;

export function correoBono(c: Pick<Comercio, 'nombre'>, b: Bono, pie = '') {
  const parcial = b.saldo_cent < b.importe_cent
    ? `<p style="margin:0 0 1em">Saldo disponible: <strong>${euros(b.saldo_cent)}</strong></p>` : '';
  const para = b.destinatario_nombre ? `<p style="margin:0 0 1em">Para: <strong>${esc(b.destinatario_nombre)}</strong></p>` : '';
  const mensaje = b.mensaje ? `<p style="margin:0 0 1em;font-style:italic">«${esc(b.mensaje)}»</p>` : '';
  return {
    asunto: `Tu bono regalo de ${c.nombre}`,
    html: `<div style="font-family:Georgia,serif;max-width:32rem;margin:auto;padding:2rem;background:#131110;color:#f2ebe0">
      <p style="margin:0 0 .5em;letter-spacing:.16em;text-transform:uppercase;color:#e4c590;font:600 12px Arial,sans-serif">Bono regalo</p>
      <h1 style="margin:0 0 .2em;font-size:28px">${esc(c.nombre)}</h1>
      <p style="font-size:2rem;color:#e4c590;margin:.3em 0 .6em">${euros(b.importe_cent)}</p>
      ${para}${mensaje}${parcial}
      <table role="presentation" cellpadding="0" cellspacing="0" style="margin:1.2em 0"><tr>
        <td style="background:#fff;padding:10px"><img src="${urlQr(b.codigo)}" width="150" height="150" alt="Código QR del bono ${b.codigo}" style="display:block"></td>
        <td style="padding-left:18px;vertical-align:middle">
          <div style="font:600 11px Arial,sans-serif;letter-spacing:.14em;text-transform:uppercase;color:#b5aa9a">Código</div>
          <div style="font-size:22px;letter-spacing:.08em;font-weight:bold">${b.codigo}</div></td>
      </tr></table>
      <p style="margin:0 0 1em">Válido hasta el ${fechaLarga(b.caduca)}. Para usarlo, enseña este correo (el QR o el código) al pedir la cuenta.</p>
      ${b.titular_nombre ? `<p style="color:#b5aa9a;font-size:13px;margin:0">Gracias por tu compra, ${esc(b.titular_nombre)}.${pie ? ' ' + esc(pie) : ''}</p>` : ''}
    </div>`,
  };
}

export function correoAviso(b: Bono, extra: { pedido?: string; autorizacion?: string; email?: string } = {}) {
  return {
    asunto: `Bono vendido: ${euros(b.importe_cent)} (${b.codigo})`,
    html: `<p>Se ha vendido un bono regalo de <strong>${euros(b.importe_cent)}</strong>.</p>
      <p>Código: <strong>${b.codigo}</strong><br>Caduca: ${fechaLarga(b.caduca)}<br>
      Comprador: ${esc(b.titular_nombre ?? '')} (${esc(extra.email ?? b.titular_email ?? '')})<br>
      ${b.destinatario_nombre ? `Para: ${esc(b.destinatario_nombre)}<br>` : ''}
      ${extra.pedido ? `Pedido Redsys: ${extra.pedido} · autorización ${esc(extra.autorizacion ?? '')}` : ''}</p>`,
  };
}
