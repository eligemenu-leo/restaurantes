// API del servicio de bonos, todo en una función para no tener que desplegar muchas:
//   GET  /bonos-api/config?comercio=…   tipos de bono en venta (público, lo lee la web)
//   GET  /bonos-api/qr?c=VACA-XXXX-XXXX imagen del QR del bono (público, va en el correo; abre /gestion/ de la web)
//   POST /bonos-api/reenviar            reenvía el correo del bono (panel, administrador)
//   POST /bonos-api/usuarios            listar, crear, cambiar rol y quitar usuarios (panel, administrador)
import qrcode from 'npm:qrcode-generator@1.4.4';
import { db, enVenta, type Bono, type Comercio, type TipoBono } from '../_shared/db.ts';
import { b64decode } from '../_shared/redsys.ts';
import { enviarCorreo } from '../_shared/correo.ts';
import { correoBono } from '../_shared/plantillas.ts';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type, apikey, x-client-info',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};
const json = (data: unknown, status = 200, extra: Record<string, string> = {}) =>
  new Response(JSON.stringify(data), { status, headers: { ...CORS, 'Content-Type': 'application/json', ...extra } });
const error = (mensaje: string, status = 400) => json({ error: mensaje }, status);
const FORMATO_CODIGO = /^[A-Z]{2,6}-[2-9A-Z]{4}-[2-9A-Z]{4}$/;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  const url = new URL(req.url);
  const ruta = url.pathname.split('/').filter(Boolean).pop();
  try {
    if (req.method === 'GET' && ruta === 'config') return await config(url);
    if (req.method === 'GET' && ruta === 'qr') return await qr(url);
    if (req.method === 'POST' && ruta === 'reenviar') return await reenviar(req);
    if (req.method === 'POST' && ruta === 'usuarios') return await usuarios(req);
    return error('No encontrado', 404);
  } catch (e) {
    console.error(e);
    return error('Error interno', 500);
  }
});

async function config(url: URL) {
  const supabase = db();
  const { data: c } = await supabase.from('comercios').select('id, venta_activa, activo')
    .eq('id', url.searchParams.get('comercio') ?? '').maybeSingle<Comercio>();
  if (!c || !c.activo) return error('Comercio desconocido', 404);
  const { data: tipos } = await supabase.from('tipos_bono').select('*').eq('comercio_id', c.id)
    .order('orden').order('importe_cent').returns<TipoBono[]>();
  const enVentaHoy = c.venta_activa ? (tipos ?? []).filter((t) => enVenta(t)) : [];
  return json({
    venta_activa: c.venta_activa && enVentaHoy.length > 0,
    tipos: enVentaHoy.map(({ id, nombre, descripcion, importe_cent, validez_meses, caduca_fija }) =>
      ({ id, nombre, descripcion, importe_cent, validez_meses, caduca_fija })),
  }, 200, { 'Cache-Control': 'public, max-age=60' });
}

async function qr(url: URL) {
  const codigo = (url.searchParams.get('c') ?? '').toUpperCase();
  if (!FORMATO_CODIGO.test(codigo)) return error('Código no válido');
  // El QR lleva a la ficha del bono en el panel, que está en /gestion/ de la web del restaurante
  // (o en PANEL_URL si se configura). Si no se encuentra el restaurante, lleva solo el código.
  const { data: c } = await db().from('comercios').select('web').eq('prefijo_codigo', codigo.split('-')[0]).limit(1).maybeSingle();
  const panel = Deno.env.get('PANEL_URL')?.replace(/\/$/, '') || (c?.web ? `${c.web.replace(/\/$/, '')}/gestion` : '');
  const q = qrcode(0, 'M');
  q.addData(panel ? `${panel}/#/bono/${codigo}` : codigo);
  q.make();
  const gif = b64decode(q.createDataURL(6, 4).split(',')[1]);
  return new Response(gif, { headers: { ...CORS, 'Content-Type': 'image/gif', 'Cache-Control': 'public, max-age=31536000, immutable' } });
}

/** Usuario del panel a partir de su token, y su rol en el restaurante. */
async function quien(req: Request, comercio: string) {
  const token = req.headers.get('Authorization')?.replace(/^Bearer\s+/i, '');
  if (!token) return null;
  const supabase = db();
  const { data: { user } } = await supabase.auth.getUser(token);
  if (!user) return null;
  const { data: m } = await supabase.from('miembros').select('rol').eq('user_id', user.id).eq('comercio_id', comercio).maybeSingle();
  return m ? { user, rol: m.rol as 'admin' | 'personal' } : null;
}

async function reenviar(req: Request) {
  const body = await req.json().catch(() => ({}));
  const supabase = db();
  const { data: b } = await supabase.from('bonos').select('*, comercios(nombre, email_avisos)').eq('codigo', String(body.codigo ?? '')).maybeSingle();
  if (!b) return error('Ese código no existe', 404);
  const yo = await quien(req, b.comercio_id);
  if (yo?.rol !== 'admin') return error('No tienes permiso para esto', 403);
  const para = String(body.email || b.titular_email || '').trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(para)) return error('El bono no tiene un correo válido');
  const comercio = b.comercios as Pick<Comercio, 'nombre' | 'email_avisos'>;
  const ok = await enviarCorreo({ para, responderA: comercio.email_avisos, ...correoBono(comercio, b as Bono) });
  if (!ok) return error('No se pudo enviar el correo', 502);
  await supabase.from('eventos').insert({ comercio_id: b.comercio_id, bono_codigo: b.codigo, tipo: 'reenviado',
    detalle: { para }, usuario: yo.user.id, usuario_email: yo.user.email });
  return json({ ok: true, para });
}

async function usuarios(req: Request) {
  const body = await req.json().catch(() => ({}));
  const comercio = String(body.comercio ?? '');
  const yo = await quien(req, comercio);
  if (yo?.rol !== 'admin') return error('No tienes permiso para esto', 403);
  const supabase = db();
  const rol = body.rol === 'admin' ? 'admin' : 'personal';
  const registrar = (tipo: string, detalle: unknown) => supabase.from('eventos').insert({
    comercio_id: comercio, tipo, detalle, usuario: yo.user.id, usuario_email: yo.user.email });

  switch (body.accion) {
    case 'listar': {
      const { data } = await supabase.from('miembros').select('user_id, email, rol, creado').eq('comercio_id', comercio).order('creado');
      return json({ usuarios: data ?? [] });
    }
    case 'crear': {
      const email = String(body.email ?? '').trim().toLowerCase();
      const password = String(body.password ?? '');
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return error('Correo no válido');
      // Si ya tiene cuenta (por ejemplo, en otro restaurante), solo se le da acceso a este.
      let { data: id } = await supabase.rpc('usuario_por_email', { p_email: email });
      if (!id) {
        if (password.length < 8) return error('La contraseña debe tener al menos 8 caracteres');
        const { data, error: e } = await supabase.auth.admin.createUser({ email, password, email_confirm: true });
        if (e || !data.user) return error(e?.message ?? 'No se pudo crear el usuario');
        id = data.user.id;
      }
      const { error: e } = await supabase.from('miembros').upsert({ user_id: id, comercio_id: comercio, rol, email });
      if (e) return error(e.message);
      await registrar('usuario_creado', { email, rol });
      return json({ ok: true });
    }
    case 'rol':
    case 'quitar': {
      const id = String(body.user_id ?? '');
      if (id === yo.user.id) return error('No puedes cambiar tu propio acceso');
      const q = body.accion === 'rol'
        ? supabase.from('miembros').update({ rol }).eq('user_id', id).eq('comercio_id', comercio).select('email')
        : supabase.from('miembros').delete().eq('user_id', id).eq('comercio_id', comercio).select('email');
      const { data, error: e } = await q;
      if (e) return error(e.message);
      if (!data?.length) return error('Ese usuario no existe', 404);
      await registrar(body.accion === 'rol' ? 'usuario_rol' : 'usuario_quitado', { email: data[0].email, rol });
      return json({ ok: true });
    }
  }
  return error('Acción desconocida');
}
