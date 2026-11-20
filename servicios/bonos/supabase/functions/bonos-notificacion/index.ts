// Notificación online de Redsys: llega cuando el cliente termina el pago, con éxito o sin él.
// Comprueba la firma, marca el pedido, crea el bono y envía los correos. Se puede repetir sin efectos duplicados.
import { db, claveRedsys, caducidad, type Bono, type Comercio, type TipoBono } from '../_shared/db.ts';
import { decodeParams, verificarNotificacion, pagoAutorizado, codigoBono } from '../_shared/redsys.ts';
import { enviarCorreo } from '../_shared/correo.ts';
import { correoAviso, correoBono } from '../_shared/plantillas.ts';

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

  const { data: tipo } = pedido.tipo_id
    ? await supabase.from('tipos_bono').select('validez_meses, caduca_fija').eq('id', pedido.tipo_id).maybeSingle<TipoBono>()
    : { data: null };
  let bono: Bono | null = null;
  for (let i = 0; i < 5 && !bono; i++) {
    const { data, error } = await supabase.from('bonos').insert({
      codigo: codigoBono(comercio.prefijo_codigo), pedido_id: pedido.id, comercio_id: comercio.id, tipo_id: pedido.tipo_id,
      importe_cent: pedido.importe_cent, saldo_cent: pedido.importe_cent, caduca: caducidad(tipo), origen: 'web',
      titular_nombre: pedido.comprador_nombre, titular_email: pedido.comprador_email,
      destinatario_nombre: pedido.destinatario_nombre, mensaje: pedido.mensaje,
    }).select().single<Bono>();
    if (!error) bono = data;
    else if (error.code !== '23505') { console.error(error); break; }
  }
  if (!bono) { console.error(`Pedido ${numPedido} pagado pero sin bono creado`); return texto('OK'); }
  await supabase.from('eventos').insert({
    comercio_id: comercio.id, bono_codigo: bono.codigo, tipo: 'venta_web',
    detalle: { pedido: numPedido, importe_cent: bono.importe_cent, autorizacion: p.Ds_AuthorisationCode?.trim() },
  });

  const cliente = correoBono(comercio, bono, `Pedido ${numPedido}.`);
  await enviarCorreo({ para: pedido.comprador_email, responderA: comercio.email_avisos, ...cliente });
  const aviso = correoAviso(bono, { pedido: numPedido, autorizacion: p.Ds_AuthorisationCode?.trim() });
  await enviarCorreo({ para: comercio.email_avisos, ...aviso });
  return texto('OK');
});
