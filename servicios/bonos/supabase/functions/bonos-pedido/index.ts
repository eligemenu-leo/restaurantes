// Recibe el formulario de /bonos-regalo/, guarda el pedido y manda al cliente a pagar a Redsys.
// Responde con una redirección 303 a la página /bonos-regalo/pago/ de la web, que envía el formulario firmado a Redsys.
// (Supabase no sirve HTML desde sus funciones, por eso el formulario hacia Redsys lo monta la web.)
import { db, claveRedsys, enVenta, type Comercio, type TipoBono } from '../_shared/db.ts';
import { encodeParams, firmar, numeroPedido, VERSION_FIRMA } from '../_shared/redsys.ts';

const redirect = (url: string) => new Response(null, { status: 303, headers: { Location: url } });
const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('Método no permitido', { status: 405 });
  const form = await req.formData().catch(() => null);
  const campo = (k: string) => String(form?.get(k) ?? '').trim();

  const supabase = db();
  const { data: comercio } = await supabase.from('comercios').select('*').eq('id', campo('comercio')).eq('activo', true).maybeSingle<Comercio>();
  if (!comercio) return new Response('Comercio desconocido', { status: 404 });
  const volver = (error: string) => redirect(`${comercio.web}/bonos-regalo/?error=${error}#comprar`);

  // Campo trampa: las personas no lo ven; si viene relleno es un robot.
  if (campo('web')) return volver('datos');

  if (!comercio.venta_activa) return volver('cerrado');

  // El formulario manda el tipo de bono; si la web no pudo cargarlos, manda solo el importe.
  const { data: tipos } = await supabase.from('tipos_bono').select('*').eq('comercio_id', comercio.id).returns<TipoBono[]>();
  const importePedido = Math.round(Number(campo('importe').replace(',', '.')) * 100);
  const tipo = (tipos ?? []).filter((t) => enVenta(t))
    .find((t) => (campo('tipo') ? t.id === campo('tipo') : t.importe_cent === importePedido));
  if (!tipo) return volver('importe');
  const importe = tipo.importe_cent;

  const nombre = campo('nombre'), email = campo('email').toLowerCase();
  const para = campo('para') || null, mensaje = campo('mensaje') || null;
  if (!nombre || nombre.length > 120 || !EMAIL.test(email) || (para?.length ?? 0) > 120 || (mensaje?.length ?? 0) > 500) {
    return volver('datos');
  }
  if (campo('acepto') !== 'si') return volver('condiciones');

  const clave = claveRedsys(comercio.id);
  if (!clave) {
    console.error(`Falta el secreto de la clave de Redsys para ${comercio.id}`);
    return volver('servicio');
  }

  // El número de pedido es aleatorio: si coincide con uno existente (muy improbable), se prueba otro.
  let numPedido = '';
  for (let i = 0; i < 3 && !numPedido; i++) {
    const n = numeroPedido();
    const { error } = await supabase.from('pedidos').insert({
      comercio_id: comercio.id, num_pedido: n, importe_cent: importe, tipo_id: tipo.id,
      comprador_nombre: nombre, comprador_email: email, destinatario_nombre: para, mensaje,
    });
    if (!error) numPedido = n;
    else if (error.code !== '23505') { console.error(error); return volver('servicio'); }
  }
  if (!numPedido) return volver('servicio');

  const params = encodeParams({
    DS_MERCHANT_AMOUNT: String(importe),
    DS_MERCHANT_ORDER: numPedido,
    DS_MERCHANT_MERCHANTCODE: comercio.redsys_fuc,
    DS_MERCHANT_TERMINAL: comercio.redsys_terminal,
    DS_MERCHANT_CURRENCY: '978',
    DS_MERCHANT_TRANSACTIONTYPE: '0',
    DS_MERCHANT_MERCHANTNAME: comercio.nombre,
    DS_MERCHANT_PRODUCTDESCRIPTION: tipo.nombre.slice(0, 125),
    DS_MERCHANT_TITULAR: nombre.slice(0, 60),
    DS_MERCHANT_CONSUMERLANGUAGE: '001',
    DS_MERCHANT_MERCHANTURL: `${Deno.env.get('SUPABASE_URL')}/functions/v1/bonos-notificacion`,
    DS_MERCHANT_URLOK: `${comercio.web}/bonos-regalo/gracias/`,
    DS_MERCHANT_URLKO: `${comercio.web}/bonos-regalo/pago-no-completado/`,
  });
  const firma = await firmar(clave, numPedido, params);

  // En el fragmento (#) para que no quede en los registros del servidor de la web.
  const datos = new URLSearchParams({ e: comercio.redsys_entorno, v: VERSION_FIRMA, p: params, s: firma });
  return redirect(`${comercio.web}/bonos-regalo/pago/#${datos}`);
});
