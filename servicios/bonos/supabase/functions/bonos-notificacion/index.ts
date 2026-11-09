// Notificación online de Redsys: llega cuando el cliente termina el pago, con éxito o sin él.
// Comprueba la firma, marca el pedido, crea el bono y envía los correos. Se puede repetir sin efectos duplicados.
import { db, claveRedsys, type Comercio } from '../_shared/db.ts';
import { decodeParams, verificarNotificacion, pagoAutorizado, codigoBono } from '../_shared/redsys.ts';
import { enviarCorreo, esc, euros } from '../_shared/correo.ts';

const texto = (body: string, status = 200) => new Response(body, { status, headers: { 'Content-Type': 'text/plain' } });

Deno.serve(async (req) => {
  if (req.method !== 'POST') return texto('Método no permitido', 405);
  const form = await req.formData().catch(() => null);
  const paramsB64 = String(form?.get('Ds_MerchantParameters') ?? '');
  const firma = String(form?.get('Ds_Signature') ?? '');
  if (!paramsB64 || !firma) return texto('Faltan parámetros', 400);

  let sinVerificar: Record<string, string>;
  try { sinVerificar = decodeParams(paramsB64); } catch { return texto('Parámetros ilegibles', 400); }
  const numPedido = sinVerificar.Ds_Order ?? '';

  const supabase = db();
  const { data: pedido } = await supabase.from('pedidos').select('*, comercios(*)').eq('num_pedido', numPedido).maybeSingle();
  if (!pedido) { console.error(`Notificación de un pedido desconocido: ${numPedido}`); return texto('Pedido desconocido', 404); }
  const comercio = pedido.comercios as Comercio;

  const clave = claveRedsys(comercio.id);
  const p = clave ? await verificarNotificacion(clave, paramsB64, firma) : null;
  if (!p) { console.error(`Firma no válida en el pedido ${numPedido}`); return texto('Firma no válida', 400); }

  if (pedido.estado !== 'pendiente') return texto('OK'); // ya procesado (Redsys puede reintentar)

  const coincide = p.Ds_MerchantCode === comercio.redsys_fuc && Number(p.Ds_Amount) === pedido.importe_cent && p.Ds_Currency === '978';
  const pagado = coincide && pagoAutorizado(p.Ds_Response);
  if (!coincide) console.error(`Datos que no coinciden en el pedido ${numPedido}`, p);

  // Solo el primero que cambie el estado de "pendiente" sigue adelante.
  const { data: cambiado } = await supabase.from('pedidos')
    .update({
      estado: pagado ? 'pagado' : 'denegado', redsys_respuesta: p.Ds_Response ?? null,
      redsys_autorizacion: p.Ds_AuthorisationCode?.trim() || null, notificacion: p, actualizado: new Date().toISOString(),
    })
    .eq('id', pedido.id).eq('estado', 'pendiente').select('id');
  if (!cambiado?.length || !pagado) return texto('OK');

  const caduca = new Date();
  caduca.setUTCMonth(caduca.getUTCMonth() + comercio.validez_meses);
  const caducaISO = caduca.toISOString().slice(0, 10);
  let codigo = '';
  for (let i = 0; i < 5 && !codigo; i++) {
    const c = codigoBono(comercio.prefijo_codigo);
    const { error } = await supabase.from('bonos').insert({
      codigo: c, pedido_id: pedido.id, comercio_id: comercio.id, importe_cent: pedido.importe_cent, caduca: caducaISO,
    });
    if (!error) codigo = c;
    else if (error.code !== '23505') { console.error(error); break; }
  }
  if (!codigo) { console.error(`Pedido ${numPedido} pagado pero sin bono creado`); return texto('OK'); }

  const importe = euros(pedido.importe_cent);
  const caducaTexto = caduca.toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
  const para = pedido.destinatario_nombre ? `<p>Para: <strong>${esc(pedido.destinatario_nombre)}</strong></p>` : '';
  const mensaje = pedido.mensaje ? `<p style="font-style:italic">«${esc(pedido.mensaje)}»</p>` : '';

  await enviarCorreo({
    para: pedido.comprador_email,
    responderA: comercio.email_avisos,
    asunto: `Tu bono regalo de ${comercio.nombre}`,
    html: `<div style="font-family:Georgia,serif;max-width:32rem;margin:auto;padding:2rem;background:#131110;color:#f2ebe0">
      <p style="letter-spacing:.16em;text-transform:uppercase;color:#e4c590;font:600 12px Arial,sans-serif">Bono regalo</p>
      <h1 style="margin:.2em 0">${esc(comercio.nombre)}</h1>
      <p style="font-size:2rem;color:#e4c590;margin:.5em 0">${importe}</p>
      ${para}${mensaje}
      <p>Código: <strong style="font-size:1.4rem;letter-spacing:.1em">${codigo}</strong></p>
      <p>Válido hasta el ${caducaTexto}. Para usarlo, enseña este correo o di el código al pedir la cuenta.</p>
      <p style="color:#b5aa9a;font-size:13px">Gracias por tu compra, ${esc(pedido.comprador_nombre)}. Pedido ${numPedido}.</p>
    </div>`,
  });
  await enviarCorreo({
    para: comercio.email_avisos,
    asunto: `Bono vendido: ${importe} (${codigo})`,
    html: `<p>Se ha vendido un bono regalo de <strong>${importe}</strong>.</p>
      <p>Código: <strong>${codigo}</strong><br>Caduca: ${caducaTexto}<br>Comprador: ${esc(pedido.comprador_nombre)} (${esc(pedido.comprador_email)})<br>
      ${pedido.destinatario_nombre ? `Para: ${esc(pedido.destinatario_nombre)}<br>` : ''}Pedido Redsys: ${numPedido} · autorización ${esc(p.Ds_AuthorisationCode ?? '')}</p>`,
  });
  return texto('OK');
});
