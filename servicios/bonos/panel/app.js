// Panel de gestión de bonos regalo. Sin compilación: HTML, CSS y este módulo.
// Lee con los permisos de la base de datos (cada usuario solo ve su restaurante) y modifica con funciones SQL.

const { supabaseUrl, supabaseKey } = window.BONOS_CONFIG;
const sb = window.supabase.createClient(supabaseUrl, supabaseKey, { auth: { persistSession: true, autoRefreshToken: true } });
const API = `${supabaseUrl}/functions/v1/bonos-api`;

const $vista = document.getElementById('vista');
const $nav = document.getElementById('nav');
const estado = { sesion: null, membresias: [], comercio: null, rol: null, recuperando: false };

// ───────────── Utilidades ─────────────
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const euros = (cent) => new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', minimumFractionDigits: cent % 100 ? 2 : 0 }).format((cent ?? 0) / 100);
const aCent = (v) => Math.round(Number(String(v).replace(/\s|€/g, '').replace(',', '.')) * 100);
const deCent = (c) => (c % 100 ? (c / 100).toFixed(2).replace('.', ',') : String(c / 100));
const hoy = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Madrid' });
const masDias = (iso, n) => { const d = new Date(`${iso}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const masMeses = (iso, n) => {
  const d = new Date(`${iso}T12:00:00Z`); const dia = d.getUTCDate(); d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth() + n);
  d.setUTCDate(Math.min(dia, new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate()));
  return d.toISOString().slice(0, 10);
};
const fecha = (iso) => (iso ? new Date(iso.length === 10 ? `${iso}T12:00:00Z` : iso).toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'Europe/Madrid' }) : '');
const fechaHora = (iso) => new Date(iso).toLocaleString('es-ES', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Madrid' });
const esAdmin = () => estado.rol === 'admin';
const FORMATO_CODIGO = /([A-Z]{2,6}-[2-9A-Z]{4}-[2-9A-Z]{4})/i;

/** Estado visible de un bono: activo, pronto (caduca en 30 días), caducado, canjeado o anulado. */
function situacion(b) {
  if (b.estado === 'anulado') return { clave: 'anulado', texto: 'Anulado' };
  if (b.estado === 'canjeado') return { clave: 'canjeado', texto: 'Canjeado' };
  if (b.caduca < hoy()) return { clave: 'caducado', texto: 'Caducado' };
  if (b.caduca <= masDias(hoy(), 30)) return { clave: 'pronto', texto: 'Caduca pronto' };
  return { clave: 'activo', texto: b.saldo_cent < b.importe_cent ? 'Activo (usado en parte)' : 'Activo' };
}
const etiqueta = (b) => { const s = situacion(b); return `<span class="estado estado--${s.clave === 'pronto' ? 'pronto' : s.clave}">${s.texto}</span>`; };

let toastTimer;
function aviso(texto, mal = false) {
  const t = document.getElementById('toast');
  t.textContent = texto; t.className = `aviso-flotante ver${mal ? ' mal' : ''}`;
  clearTimeout(toastTimer); toastTimer = setTimeout(() => { t.className = 'aviso-flotante'; }, mal ? 6000 : 3000);
}
const mensajeError = (e) => e?.message || String(e);

/** Ejecuta una operación mostrando el error, si lo hay. Devuelve los datos o undefined. */
async function hacer(promesa, ok) {
  const { data, error } = await promesa;
  if (error) { aviso(error.message || 'Algo ha fallado', true); return undefined; }
  if (ok) aviso(ok);
  return data ?? true;
}

async function api(ruta, cuerpo) {
  const { data: { session } } = await sb.auth.getSession();
  const r = await fetch(`${API}/${ruta}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` },
    body: JSON.stringify(cuerpo),
  });
  const j = await r.json().catch(() => ({}));
  return r.ok ? { data: j } : { error: { message: j.error || 'Algo ha fallado' } };
}

function pintar(html, titulo) {
  $vista.innerHTML = html;
  document.title = `${titulo ? `${titulo} · ` : ''}Bonos regalo`;
  $vista.focus({ preventScroll: true });
  window.scrollTo(0, 0);
}
const datosForm = (form) => Object.fromEntries(new FormData(form));
const enviar = (sel, fn) => {
  const f = $vista.querySelector(sel);
  f?.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const btn = f.querySelector('[type="submit"]'); if (btn) btn.disabled = true;
    try { await fn(datosForm(f), f); } finally { if (btn && btn.isConnected) btn.disabled = false; }
  });
};

// ───────────── Sesión y restaurante ─────────────
async function cargarMembresias() {
  const { data, error } = await sb.from('miembros').select('comercio_id, rol').eq('user_id', estado.sesion.user.id);
  if (error) throw error;
  const ids = data.map((m) => m.comercio_id);
  const { data: comercios } = ids.length
    ? await sb.from('comercios').select('id, nombre, web, email_avisos, venta_activa, locales, prefijo_codigo, redsys_entorno').in('id', ids)
    : { data: [] };
  estado.membresias = data.map((m) => ({ ...m, comercio: comercios.find((c) => c.id === m.comercio_id) })).filter((m) => m.comercio);
  let elegido = null;
  try { elegido = localStorage.getItem('bonos.comercio'); } catch {}
  const m = estado.membresias.find((x) => x.comercio_id === elegido) ?? estado.membresias[0];
  estado.comercio = m?.comercio ?? null;
  estado.rol = m?.rol ?? null;
}

function pintarCabecera() {
  const cab = document.getElementById('cabecera');
  cab.hidden = !estado.sesion || !estado.comercio;
  if (cab.hidden) return;
  const sel = document.getElementById('selector');
  const wrap = document.getElementById('selector-wrap');
  wrap.hidden = estado.membresias.length < 2;
  document.getElementById('restaurante').textContent = estado.membresias.length < 2 ? estado.comercio.nombre : '';
  sel.innerHTML = estado.membresias.map((m) => `<option value="${esc(m.comercio_id)}"${m.comercio_id === estado.comercio.id ? ' selected' : ''}>${esc(m.comercio.nombre)}</option>`).join('');
  sel.onchange = () => {
    try { localStorage.setItem('bonos.comercio', sel.value); } catch {}
    const m = estado.membresias.find((x) => x.comercio_id === sel.value);
    estado.comercio = m.comercio; estado.rol = m.rol; location.hash = '#/'; router();
  };
  const enlaces = [['#/', 'Inicio'], ['#/bonos', 'Bonos'], ['#/escanear', 'Escanear QR']];
  if (esAdmin()) enlaces.push(['#/nuevo', 'Nuevo bono'], ['#/tipos', 'Tipos de bono'], ['#/ajustes', 'Ajustes'], ['#/usuarios', 'Usuarios']);
  const actual = location.hash.split('?')[0] || '#/';
  $nav.innerHTML = enlaces.map(([h, t]) => `<a href="${h}"${actual === h || (h !== '#/' && actual.startsWith(h)) ? ' aria-current="page"' : ''}>${t}</a>`).join('');
}

// ───────────── Rutas ─────────────
const rutas = [
  [/^#\/?$/, vistaInicio],
  [/^#\/bonos$/, vistaBonos],
  [/^#\/bono\/([^/?]+)$/, vistaBono],
  [/^#\/escanear$/, vistaEscanear],
  [/^#\/nuevo$/, vistaNuevo, true],
  [/^#\/tipos$/, vistaTipos, true],
  [/^#\/tipo\/([^/?]+)$/, vistaTipo, true],
  [/^#\/ajustes$/, vistaAjustes, true],
  [/^#\/usuarios$/, vistaUsuarios, true],
  [/^#\/cuenta$/, vistaCuenta],
];

let escaner = null;
async function router() {
  if (escaner) { escaner.destroy(); escaner = null; }
  if (estado.recuperando) return vistaNuevaClave();
  // Enlaces de Supabase (recuperar contraseña): supabase-js lee el token del # y luego seguimos.
  if (/^#(access_token|error)=/.test(location.hash)) { history.replaceState(null, '', location.pathname + '#/'); }
  if (!estado.sesion) return vistaAcceso();
  if (!estado.comercio) return vistaSinAcceso();
  pintarCabecera();
  const [ruta, query = ''] = (location.hash || '#/').split('?');
  for (const [re, fn, soloAdmin] of rutas) {
    const m = ruta.match(re);
    if (!m) continue;
    if (soloAdmin && !esAdmin()) return pintar('<p class="alerta">Esta sección es solo para administradores.</p>', 'Sin permiso');
    try { return await fn(decodeURIComponent(m[1] ?? ''), new URLSearchParams(query)); } catch (e) {
      console.error(e); return pintar(`<p class="alerta alerta--mal">No se ha podido cargar: ${esc(mensajeError(e))}</p>`, 'Error');
    }
  }
  pintar('<p>Esta página no existe. <a href="#/">Volver al inicio</a></p>', 'No encontrada');
}

// ───────────── Acceso ─────────────
function vistaAcceso(mensaje = '') {
  document.getElementById('cabecera').hidden = true;
  pintar(`<div class="acceso tarjeta">
    <h1>Bonos regalo</h1>
    <p class="ayuda">Panel de gestión del restaurante.</p>
    ${mensaje}
    <form id="f-acceso">
      <label class="campo"><span>Correo</span><input name="email" type="email" autocomplete="username" required></label>
      <label class="campo"><span>Contraseña</span><input name="password" type="password" autocomplete="current-password" required></label>
      <button class="btn btn--grande" type="submit">Entrar</button>
    </form>
    <details style="margin-top:1rem"><summary>He olvidado la contraseña</summary>
      <form id="f-olvido" style="margin-top:.6rem">
        <label class="campo"><span>Correo</span><input name="email" type="email" autocomplete="username" required></label>
        <button class="btn btn--sec" type="submit">Enviarme un enlace</button>
      </form>
    </details>
  </div>`, 'Entrar');
  enviar('#f-acceso', async ({ email, password }) => {
    const { error } = await sb.auth.signInWithPassword({ email, password });
    if (error) aviso(error.message === 'Invalid login credentials' ? 'Correo o contraseña incorrectos' : error.message, true);
  });
  enviar('#f-olvido', async ({ email }) => {
    const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: location.origin + location.pathname });
    aviso(error ? error.message : 'Si el correo existe, te llegará un enlace para crear otra contraseña', !!error);
  });
}

function vistaNuevaClave() {
  document.getElementById('cabecera').hidden = true;
  pintar(`<div class="acceso tarjeta"><h1>Nueva contraseña</h1>
    <form id="f-clave">
      <label class="campo"><span>Nueva contraseña</span><input name="password" type="password" minlength="8" autocomplete="new-password" required><small>Al menos 8 caracteres.</small></label>
      <button class="btn btn--grande" type="submit">Guardar</button>
    </form></div>`, 'Nueva contraseña');
  enviar('#f-clave', async ({ password }) => {
    if (await hacer(sb.auth.updateUser({ password }), 'Contraseña cambiada')) { estado.recuperando = false; location.hash = '#/'; router(); }
  });
}

function vistaSinAcceso() {
  document.getElementById('cabecera').hidden = true;
  pintar(`<div class="acceso tarjeta"><h1>Sin acceso</h1>
    <p>Tu usuario (${esc(estado.sesion.user.email)}) no tiene acceso a ningún restaurante. Pide a un administrador que te dé acceso.</p>
    <button class="btn btn--sec" id="salir">Cerrar sesión</button></div>`, 'Sin acceso');
  $vista.querySelector('#salir').onclick = () => sb.auth.signOut();
}

function vistaCuenta() {
  pintar(`<h1>Mi cuenta</h1>
    <div class="tarjeta"><dl class="datos"><dt>Usuario</dt><dd>${esc(estado.sesion.user.email)}</dd>
      <dt>Restaurante</dt><dd>${esc(estado.comercio.nombre)}</dd><dt>Permisos</dt><dd>${esAdmin() ? 'Administrador' : 'Personal (consultar y canjear)'}</dd></dl></div>
    <div class="tarjeta"><h2>Cambiar contraseña</h2>
      <form id="f-clave"><label class="campo"><span>Nueva contraseña</span><input name="password" type="password" minlength="8" autocomplete="new-password" required></label>
      <div><button class="btn" type="submit">Guardar</button></div></form></div>
    <button class="btn btn--sec" id="salir">Cerrar sesión</button>`, 'Mi cuenta');
  enviar('#f-clave', async ({ password }, f) => { if (await hacer(sb.auth.updateUser({ password }), 'Contraseña cambiada')) f.reset(); });
  $vista.querySelector('#salir').onclick = () => sb.auth.signOut();
}

// ───────────── Inicio ─────────────
async function vistaInicio() {
  const c = estado.comercio;
  const { data: r, error } = await sb.rpc('resumen_bonos', { p_comercio: c.id });
  if (error) throw error;
  const max = Math.max(1, ...r.por_mes.map((m) => m.cent));
  const nombreMes = (ym) => new Date(`${ym}-15T12:00:00Z`).toLocaleDateString('es-ES', { month: 'short', year: '2-digit', timeZone: 'UTC' });
  pintar(`<h1>${esc(c.nombre)}</h1>
    ${c.redsys_entorno === 'pruebas' ? '<p class="alerta">El pago está en <strong>modo de pruebas</strong>: las compras de la web no cobran de verdad.</p>' : ''}
    ${!c.venta_activa ? '<p class="alerta">La venta en la web está <strong>pausada</strong>. Puedes reactivarla en Ajustes.</p>' : ''}
    <form class="buscar" id="f-buscar" role="search">
      <label class="visually-hidden" for="q">Buscar un bono</label>
      <input id="q" name="q" placeholder="Código, nombre o correo" autocomplete="off" autocapitalize="characters">
      <button class="btn" type="submit">Buscar</button>
    </form>
    <div class="acciones" style="margin-bottom:1.25rem">
      <a class="btn" href="#/escanear">Escanear QR</a>
      ${esAdmin() ? '<a class="btn btn--sec" href="#/nuevo">Crear bono</a>' : ''}
    </div>
    <div class="rejilla">
      <a class="cifra" href="#/bonos?estado=activos"><span>Pendiente de canjear</span><strong>${euros(r.pendiente_cent)}</strong><small>${r.activos} bonos activos</small></a>
      <a class="cifra" href="#/bonos"><span>Vendido</span><strong>${euros(r.vendido_cent)}</strong><small>${r.vendidos} bonos · ${euros(r.vendido_web_cent)} en la web</small></a>
      <div class="cifra"><span>Canjeado</span><strong>${euros(r.canjeado_cent)}</strong></div>
      <a class="cifra" href="#/bonos?estado=pronto"><span>Caducan en 30 días</span><strong>${r.caducan_30}</strong><small>bonos</small></a>
      <a class="cifra" href="#/bonos?estado=caducados"><span>Caducado sin usar</span><strong>${euros(r.caducado_cent)}</strong></a>
      <a class="cifra" href="#/bonos?estado=anulados"><span>Anulados</span><strong>${r.anulados}</strong></a>
    </div>
    <div class="tarjeta"><h2>Ventas de los últimos 12 meses</h2>
      ${r.por_mes.length ? `<div class="barras">${r.por_mes.map((m) => `<div class="barra"><span>${nombreMes(m.mes)}</span><div style="width:${Math.round((m.cent / max) * 100)}%"></div><span>${euros(m.cent)} · ${m.vendidos}</span></div>`).join('')}</div>` : '<p class="ayuda">Todavía no hay ventas.</p>'}
    </div>`, 'Inicio');
  enviar('#f-buscar', ({ q }) => { location.hash = `#/bonos?q=${encodeURIComponent(q.trim())}`; });
}

// ───────────── Lista de bonos ─────────────
const FILTROS = [
  ['', 'Todos'], ['activos', 'Activos'], ['pronto', 'Caducan pronto'], ['canjeados', 'Canjeados'],
  ['caducados', 'Caducados'], ['anulados', 'Anulados'], ['manuales', 'Creados a mano'],
];

function consultaBonos(filtro, q) {
  let s = sb.from('bonos').select('*').eq('comercio_id', estado.comercio.id);
  const d = hoy();
  if (filtro === 'activos') s = s.eq('estado', 'activo').gte('caduca', d);
  if (filtro === 'pronto') s = s.eq('estado', 'activo').gte('caduca', d).lte('caduca', masDias(d, 30));
  if (filtro === 'canjeados') s = s.eq('estado', 'canjeado');
  if (filtro === 'caducados') s = s.eq('estado', 'activo').lt('caduca', d);
  if (filtro === 'anulados') s = s.eq('estado', 'anulado');
  if (filtro === 'manuales') s = s.eq('origen', 'manual');
  const t = q.trim().replace(/[%,()*"\\]/g, ' ').trim();
  if (t) s = s.or(['codigo', 'titular_nombre', 'titular_email', 'destinatario_nombre'].map((c) => `${c}.ilike."*${t}*"`).join(','));
  return s.order('creado', { ascending: false });
}

async function vistaBonos(_, params) {
  const filtro = params.get('estado') ?? '';
  const q = params.get('q') ?? '';
  const exacto = q.toUpperCase().match(FORMATO_CODIGO);
  if (exacto && exacto[1] === q.trim().toUpperCase()) { location.replace(`#/bono/${exacto[1]}`); return; }
  const POR_PAGINA = 50;
  let pagina = 0;
  pintar(`<h1>Bonos</h1>
    <form class="buscar" id="f-buscar" role="search">
      <label class="visually-hidden" for="q">Buscar</label>
      <input id="q" name="q" value="${esc(q)}" placeholder="Código, nombre o correo" autocomplete="off">
      <button class="btn" type="submit">Buscar</button>
    </form>
    <nav class="chips" aria-label="Filtrar por estado">${FILTROS.map(([k, t]) => `<a href="#/bonos?estado=${k}${q ? `&q=${encodeURIComponent(q)}` : ''}"${k === filtro ? ' aria-current="true"' : ''}>${t}</a>`).join('')}</nav>
    <ul class="lista" id="lista"><li class="vacio">Cargando…</li></ul>
    <div class="acciones" style="margin-top:1rem">
      <button class="btn btn--sec" id="mas" hidden>Cargar más</button>
      <button class="btn btn--sec" id="csv">Descargar CSV</button>
    </div>`, 'Bonos');
  enviar('#f-buscar', ({ q: nq }) => { location.hash = `#/bonos?estado=${filtro}&q=${encodeURIComponent(nq.trim())}`; });
  const $lista = $vista.querySelector('#lista');
  const $mas = $vista.querySelector('#mas');
  const cargar = async () => {
    const { data, error } = await consultaBonos(filtro, q).range(pagina * POR_PAGINA, pagina * POR_PAGINA + POR_PAGINA - 1);
    if (error) throw error;
    if (pagina === 0) $lista.innerHTML = data.length ? '' : '<li class="vacio">No hay bonos con estos filtros.</li>';
    $lista.insertAdjacentHTML('beforeend', data.map((b) => `<li><a href="#/bono/${esc(b.codigo)}">
      <span class="codigo">${esc(b.codigo)}</span>
      <span class="der"><strong>${euros(b.saldo_cent)}</strong>${b.saldo_cent !== b.importe_cent ? ` <small class="ayuda">de ${euros(b.importe_cent)}</small>` : ''}</span>
      <span class="sub">${esc(b.titular_nombre || 'Sin nombre')}${b.destinatario_nombre ? ` → ${esc(b.destinatario_nombre)}` : ''} · caduca ${fecha(b.caduca)}</span>
      <span class="der">${etiqueta(b)}</span></a></li>`).join(''));
    $mas.hidden = data.length < POR_PAGINA;
    pagina++;
  };
  $mas.onclick = cargar;
  $vista.querySelector('#csv').onclick = async () => {
    const { data, error } = await consultaBonos(filtro, q).limit(5000);
    if (error) return aviso(error.message, true);
    const cols = [['codigo', 'Código'], ['estado_txt', 'Estado'], ['importe', 'Importe'], ['saldo', 'Saldo'], ['creado_txt', 'Creado'],
      ['caduca_txt', 'Caduca'], ['origen', 'Origen'], ['titular_nombre', 'Titular'], ['titular_email', 'Correo'], ['destinatario_nombre', 'Para'], ['nota', 'Nota']];
    const filas = data.map((b) => ({ ...b, estado_txt: situacion(b).texto, importe: deCent(b.importe_cent), saldo: deCent(b.saldo_cent),
      creado_txt: fecha(b.creado), caduca_txt: fecha(b.caduca) }));
    const celda = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const csv = '﻿' + [cols.map((c) => celda(c[1])).join(';'), ...filas.map((f) => cols.map((c) => celda(f[c[0]])).join(';'))].join('\r\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    a.download = `bonos-${estado.comercio.id}-${hoy()}.csv`;
    a.click(); URL.revokeObjectURL(a.href);
  };
  await cargar();
}

// ───────────── Ficha de un bono ─────────────
const EVENTOS = {
  venta_web: 'Vendido en la web', creado_manual: 'Creado a mano', canje: 'Canje', canje_deshecho: 'Canje deshecho',
  editado: 'Datos editados', anulado: 'Anulado', reactivado: 'Reactivado', reenviado: 'Correo reenviado', borrado: 'Borrado',
};

async function vistaBono(codigo) {
  codigo = codigo.toUpperCase();
  const { data: b, error } = await sb.from('bonos').select('*').eq('codigo', codigo).maybeSingle();
  if (error) throw error;
  if (!b) return pintar(`<p class="migas"><a href="#/bonos">Bonos</a></p><h1>No encontrado</h1>
    <p>No hay ningún bono con el código <strong>${esc(codigo)}</strong> en ${esc(estado.comercio.nombre)}.</p>
    <a class="btn" href="#/escanear">Escanear otro</a>`, 'No encontrado');
  if (b.comercio_id !== estado.comercio.id) {
    const m = estado.membresias.find((x) => x.comercio_id === b.comercio_id);
    if (m) { estado.comercio = m.comercio; estado.rol = m.rol; pintarCabecera(); }
  }
  const [{ data: canjes }, { data: eventos }, { data: tipo }, pedidoRes] = await Promise.all([
    sb.from('canjes').select('*').eq('bono_codigo', codigo).order('creado', { ascending: false }),
    sb.from('eventos').select('*').eq('bono_codigo', codigo).order('creado', { ascending: false }),
    b.tipo_id ? sb.from('tipos_bono').select('nombre').eq('id', b.tipo_id).maybeSingle() : Promise.resolve({ data: null }),
    b.pedido_id && esAdmin() ? sb.from('pedidos').select('num_pedido, redsys_autorizacion, creado').eq('id', b.pedido_id).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  const pedido = pedidoRes.data;
  const s = situacion(b);
  const caducado = s.clave === 'caducado';
  const puedeCanjear = b.estado === 'activo' && b.saldo_cent > 0 && (!caducado || esAdmin());
  const locales = estado.comercio.locales ?? [];
  let localPrevio = '';
  try { localPrevio = localStorage.getItem('bonos.local') ?? ''; } catch {}

  pintar(`<p class="migas"><a href="#/bonos">Bonos</a></p>
    <div class="ficha-cab"><h1>${esc(b.codigo)}</h1>${etiqueta(b)}</div>
    <p class="saldo">${euros(b.saldo_cent)} <small>${b.saldo_cent !== b.importe_cent ? `de ${euros(b.importe_cent)}` : 'disponible'}</small></p>
    ${b.estado === 'anulado' ? `<p class="alerta alerta--mal">Anulado: ${esc(b.anulado_motivo)}</p>` : ''}
    ${caducado && b.estado === 'activo' ? `<p class="alerta">Caducó el ${fecha(b.caduca)}.${esAdmin() ? ' Como administrador puedes canjearlo igualmente o ampliar la fecha.' : ' Solo un administrador puede canjearlo.'}</p>` : ''}

    ${puedeCanjear ? `<div class="tarjeta"><h2>Canjear</h2>
      <form id="f-canje">
        <label class="campo"><span>Importe a descontar (€)</span>
          <input class="importe-input" name="importe" inputmode="decimal" value="${deCent(b.saldo_cent)}" required aria-describedby="ayuda-imp">
          <small id="ayuda-imp">Por defecto, todo el saldo. Si la cuenta es menor, escribe solo lo que se paga con el bono.</small></label>
        ${locales.length ? `<label class="campo"><span>Local</span><select name="local">${locales.map((l) => `<option${l === localPrevio ? ' selected' : ''}>${esc(l)}</option>`).join('')}</select></label>` : ''}
        <label class="campo"><span>Nota <small>(opcional)</small></span><input name="nota" maxlength="500" placeholder="Mesa, número de ticket…"></label>
        <button class="btn btn--grande" type="submit">Canjear</button>
      </form></div>` : ''}

    <div class="tarjeta"><h2>Datos</h2><dl class="datos">
      <dt>Importe</dt><dd>${euros(b.importe_cent)}${tipo ? ` · ${esc(tipo.nombre)}` : ''}</dd>
      <dt>Caduca</dt><dd>${fecha(b.caduca)}</dd>
      <dt>Titular</dt><dd>${esc(b.titular_nombre || '—')}${b.titular_email ? `<br><a href="mailto:${esc(b.titular_email)}">${esc(b.titular_email)}</a>` : ''}</dd>
      ${b.destinatario_nombre ? `<dt>Para</dt><dd>${esc(b.destinatario_nombre)}</dd>` : ''}
      ${b.mensaje ? `<dt>Mensaje</dt><dd>«${esc(b.mensaje)}»</dd>` : ''}
      ${b.nota ? `<dt>Nota interna</dt><dd>${esc(b.nota)}</dd>` : ''}
      <dt>Origen</dt><dd>${b.origen === 'web' ? 'Vendido en la web' : 'Creado a mano'} el ${fecha(b.creado)}</dd>
      ${pedido ? `<dt>Pedido Redsys</dt><dd>${esc(pedido.num_pedido)}${pedido.redsys_autorizacion ? ` · autorización ${esc(pedido.redsys_autorizacion)}` : ''}</dd>` : ''}
    </dl></div>

    ${esAdmin() ? `<div class="tarjeta"><h2>Gestionar</h2>
      <details><summary>Editar datos y caducidad</summary>
        <form id="f-editar" style="margin-top:.6rem">
          <label class="campo"><span>Caduca el</span><input name="caduca" type="date" value="${esc(b.caduca)}" required></label>
          <div class="dos">
            <label class="campo"><span>Titular</span><input name="titular_nombre" maxlength="120" value="${esc(b.titular_nombre)}"></label>
            <label class="campo"><span>Correo del titular</span><input name="titular_email" type="email" maxlength="200" value="${esc(b.titular_email)}"></label>
          </div>
          <label class="campo"><span>Para</span><input name="destinatario" maxlength="120" value="${esc(b.destinatario_nombre)}"></label>
          <label class="campo"><span>Mensaje del bono</span><textarea name="mensaje" maxlength="500">${esc(b.mensaje)}</textarea></label>
          <label class="campo"><span>Nota interna</span><textarea name="nota" maxlength="1000">${esc(b.nota)}</textarea><small>Solo la ve el restaurante.</small></label>
          <div><button class="btn" type="submit">Guardar cambios</button></div>
        </form></details>
      <details><summary>Reenviar el correo del bono</summary>
        <form id="f-reenviar" style="margin-top:.6rem">
          <label class="campo"><span>Enviar a</span><input name="email" type="email" value="${esc(b.titular_email)}" required></label>
          <div><button class="btn btn--sec" type="submit">Reenviar</button></div>
        </form></details>
      ${b.estado === 'anulado'
        ? '<div style="margin-top:.6rem"><button class="btn btn--sec" id="reactivar">Reactivar el bono</button></div>'
        : `<details><summary>Anular el bono</summary>
          <form id="f-anular" style="margin-top:.6rem">
            <p class="ayuda">El bono deja de valer. Queda registrado y se puede reactivar. Si hay que devolver el dinero, hazlo desde el portal de Redsys.</p>
            <label class="campo"><span>Motivo</span><input name="motivo" required maxlength="300" placeholder="Devolución, error, duplicado…"></label>
            <div><button class="btn btn--peligro" type="submit">Anular</button></div>
          </form></details>`}
      ${b.origen === 'manual' && !(canjes ?? []).some((c) => !c.deshecho) ? '<div style="margin-top:.6rem"><button class="btn btn--peligro" id="borrar">Borrar el bono</button></div>' : ''}
    </div>` : ''}

    <div class="tarjeta"><h2>Canjes</h2>
      ${(canjes ?? []).length ? `<ul class="historial">${canjes.map((c) => `<li>
        <span><strong${c.deshecho ? ' style="text-decoration:line-through"' : ''}>${euros(c.importe_cent)}</strong>${c.local ? ` · ${esc(c.local)}` : ''}${c.nota ? ` · ${esc(c.nota)}` : ''}${c.usuario_email ? `<br><small class="ayuda">${esc(c.usuario_email)}</small>` : ''}${c.deshecho ? '<br><small class="ayuda">Deshecho</small>' : ''}</span>
        <span class="acciones"><time datetime="${esc(c.creado)}">${fechaHora(c.creado)}</time>${esAdmin() && !c.deshecho ? `<button class="btn btn--sec" data-deshacer="${c.id}">Deshacer</button>` : ''}</span></li>`).join('')}</ul>`
        : '<p class="ayuda">Todavía no se ha usado.</p>'}
    </div>
    <details class="tarjeta"><summary>Historial de cambios</summary>
      <ul class="historial">${(eventos ?? []).map((e) => `<li><span>${esc(EVENTOS[e.tipo] ?? e.tipo)}${e.detalle?.motivo ? `: ${esc(e.detalle.motivo)}` : ''}${e.detalle?.para ? ` a ${esc(e.detalle.para)}` : ''}${e.usuario_email ? `<br><small class="ayuda">${esc(e.usuario_email)}</small>` : ''}</span><time datetime="${esc(e.creado)}">${fechaHora(e.creado)}</time></li>`).join('') || '<li>Sin cambios.</li>'}</ul>
    </details>`, b.codigo);

  const recargar = () => vistaBono(codigo);
  enviar('#f-canje', async ({ importe, local, nota }) => {
    const cent = aCent(importe);
    if (!(cent > 0)) return aviso('Escribe un importe válido', true);
    if (local) { try { localStorage.setItem('bonos.local', local); } catch {} }
    const forzar = caducado && esAdmin();
    if (forzar && !confirm('El bono está caducado. ¿Canjearlo igualmente?')) return;
    const r = await hacer(sb.rpc('canjear_bono', { p_codigo: codigo, p_importe_cent: cent, p_local: local ?? null, p_nota: nota || null, p_forzar: forzar }));
    if (r) { aviso(`Canjeados ${euros(cent)}. Saldo: ${euros(r.saldo_cent)}`); recargar(); }
  });
  enviar('#f-editar', async (d) => {
    if (await hacer(sb.rpc('editar_bono', { p_codigo: codigo, p_caduca: d.caduca, p_titular_nombre: d.titular_nombre, p_titular_email: d.titular_email,
      p_destinatario: d.destinatario, p_mensaje: d.mensaje, p_nota: d.nota }), 'Cambios guardados')) recargar();
  });
  enviar('#f-reenviar', async ({ email }) => { if (await hacer(api('reenviar', { codigo, email }), `Correo enviado a ${email}`)) recargar(); });
  enviar('#f-anular', async ({ motivo }) => {
    if (!confirm(`¿Anular el bono ${codigo}?`)) return;
    if (await hacer(sb.rpc('anular_bono', { p_codigo: codigo, p_motivo: motivo }), 'Bono anulado')) recargar();
  });
  $vista.querySelector('#reactivar')?.addEventListener('click', async () => {
    if (await hacer(sb.rpc('reactivar_bono', { p_codigo: codigo }), 'Bono reactivado')) recargar();
  });
  $vista.querySelector('#borrar')?.addEventListener('click', async () => {
    if (!confirm(`¿Borrar el bono ${codigo}? No se puede deshacer.`)) return;
    if (await hacer(sb.rpc('borrar_bono', { p_codigo: codigo }), 'Bono borrado')) location.hash = '#/bonos';
  });
  $vista.querySelectorAll('[data-deshacer]').forEach((btn) => btn.addEventListener('click', async () => {
    if (!confirm('¿Deshacer este canje y devolver el importe al saldo del bono?')) return;
    if (await hacer(sb.rpc('deshacer_canje', { p_canje: Number(btn.dataset.deshacer) }), 'Canje deshecho')) recargar();
  }));
}

// ───────────── Escanear ─────────────
async function vistaEscanear() {
  pintar(`<h1>Escanear QR</h1>
    <div class="camara" id="camara" hidden><video id="video" playsinline muted></video></div>
    <p class="alerta" id="sin-camara" hidden></p>
    <div class="acciones" style="margin-bottom:1.5rem"><button class="btn" id="activar">Abrir la cámara</button></div>
    <div class="tarjeta"><h2>O escribe el código</h2>
      <form id="f-codigo" class="buscar" style="margin:0">
        <label class="visually-hidden" for="codigo">Código del bono</label>
        <input id="codigo" name="codigo" placeholder="${esc(estado.comercio.prefijo_codigo)}-XXXX-XXXX" autocapitalize="characters" autocomplete="off" required>
        <button class="btn" type="submit">Abrir</button>
      </form></div>
    <p class="ayuda">También puedes escanear el QR con la cámara normal del móvil: se abre directamente la ficha del bono.</p>`, 'Escanear QR');
  enviar('#f-codigo', ({ codigo }) => {
    const m = codigo.toUpperCase().replace(/\s+/g, '').match(FORMATO_CODIGO);
    location.hash = m ? `#/bono/${m[1]}` : `#/bonos?q=${encodeURIComponent(codigo.trim())}`;
  });
  const fallo = (t) => { const p = $vista.querySelector('#sin-camara'); p.textContent = t; p.hidden = false; };
  $vista.querySelector('#activar').onclick = async (ev) => {
    ev.currentTarget.hidden = true;
    try {
      const { default: QrScanner } = await import('./vendor/qr-scanner.min.js');
      if (!(await QrScanner.hasCamera())) return fallo('No se encuentra ninguna cámara en este dispositivo.');
      $vista.querySelector('#camara').hidden = false;
      escaner = new QrScanner($vista.querySelector('#video'), (res) => {
        const m = String(res.data || '').toUpperCase().match(FORMATO_CODIGO);
        if (!m) return;
        if (navigator.vibrate) navigator.vibrate(80);
        location.hash = `#/bono/${m[1]}`;
      }, { preferredCamera: 'environment', highlightScanRegion: true, returnDetailedScanResult: true });
      await escaner.start();
    } catch (e) {
      console.error(e);
      fallo('No se ha podido abrir la cámara. Revisa que el navegador tenga permiso para usarla, o escribe el código.');
    }
  };
}

// ───────────── Crear bono a mano ─────────────
async function vistaNuevo() {
  const { data: tipos } = await sb.from('tipos_bono').select('*').eq('comercio_id', estado.comercio.id).order('orden').order('importe_cent');
  pintar(`<h1>Crear bono</h1>
    <p class="ayuda">Para ventas en el local, regalos o cortesías. No pasa por la pasarela de pago.</p>
    <form id="f-nuevo" class="tarjeta">
      <label class="campo"><span>Tipo de bono</span><select name="tipo" id="tipo">
        ${(tipos ?? []).map((t) => `<option value="${t.id}">${esc(t.nombre)} · ${euros(t.importe_cent)}</option>`).join('')}
        <option value="">Otro importe</option></select></label>
      <div class="dos">
        <label class="campo"><span>Importe (€)</span><input name="importe" id="importe" inputmode="decimal" required></label>
        <label class="campo"><span>Caduca el</span><input name="caduca" id="caduca" type="date" required></label>
      </div>
      <div class="dos">
        <label class="campo"><span>Titular</span><input name="titular_nombre" maxlength="120"></label>
        <label class="campo"><span>Correo del titular</span><input name="titular_email" id="email" type="email" maxlength="200"></label>
      </div>
      <label class="campo"><span>Para <small>(opcional)</small></span><input name="destinatario" maxlength="120"></label>
      <label class="campo"><span>Mensaje <small>(opcional, sale en el bono)</small></span><textarea name="mensaje" maxlength="500"></textarea></label>
      <label class="campo"><span>Nota interna <small>(opcional)</small></span><input name="nota" maxlength="1000" placeholder="Pagado en efectivo, cortesía…"></label>
      <label class="check"><input type="checkbox" name="enviar" id="enviar" value="si"> Enviar el bono por correo al titular</label>
      <div><button class="btn" type="submit">Crear bono</button></div>
    </form>`, 'Crear bono');
  const $tipo = $vista.querySelector('#tipo'), $imp = $vista.querySelector('#importe'), $cad = $vista.querySelector('#caduca');
  const aplicar = () => {
    const t = (tipos ?? []).find((x) => x.id === $tipo.value);
    $imp.readOnly = !!t;
    if (t) { $imp.value = deCent(t.importe_cent); $cad.value = t.caduca_fija ?? masMeses(hoy(), t.validez_meses); }
    else if (!$cad.value) $cad.value = masMeses(hoy(), 12);
  };
  $tipo.onchange = aplicar; aplicar();
  $vista.querySelector('#email').oninput = (e) => { $vista.querySelector('#enviar').checked = !!e.target.value; };
  enviar('#f-nuevo', async (d) => {
    const cent = aCent(d.importe);
    if (!(cent > 0)) return aviso('Escribe un importe válido', true);
    const b = await hacer(sb.rpc('crear_bono_manual', { p_comercio: estado.comercio.id, p_tipo: d.tipo || null, p_importe_cent: cent,
      p_caduca: d.caduca, p_titular_nombre: d.titular_nombre, p_titular_email: d.titular_email, p_destinatario: d.destinatario,
      p_mensaje: d.mensaje, p_nota: d.nota }));
    if (!b) return;
    if (d.enviar && d.titular_email) await hacer(api('reenviar', { codigo: b.codigo }), `Bono ${b.codigo} creado y enviado`);
    else aviso(`Bono ${b.codigo} creado`);
    location.hash = `#/bono/${b.codigo}`;
  });
}

// ───────────── Tipos de bono ─────────────
function situacionTipo(t) {
  const d = hoy();
  if (!t.activo) return ['canjeado', 'Desactivado'];
  if (t.venta_desde && t.venta_desde > d) return ['pronto', `Se vende desde el ${fecha(t.venta_desde)}`];
  if (t.venta_hasta && t.venta_hasta < d) return ['caducado', `Venta terminada el ${fecha(t.venta_hasta)}`];
  return ['activo', t.venta_hasta ? `En venta hasta el ${fecha(t.venta_hasta)}` : 'En venta'];
}
const validezTexto = (t) => (t.caduca_fija ? `Caduca el ${fecha(t.caduca_fija)}` : `Válido ${t.validez_meses} ${t.validez_meses === 1 ? 'mes' : 'meses'}`);

async function vistaTipos() {
  const { data: tipos, error } = await sb.from('tipos_bono').select('*').eq('comercio_id', estado.comercio.id).order('orden').order('importe_cent');
  if (error) throw error;
  pintar(`<h1>Tipos de bono</h1>
    <p class="ayuda">Son los bonos que se pueden comprar en la web. Los cambios se ven en la web en un minuto, sin tocar nada más.</p>
    ${!estado.comercio.venta_activa ? '<p class="alerta">La venta en la web está pausada en <a href="#/ajustes">Ajustes</a>.</p>' : ''}
    <ul class="lista" style="margin-bottom:1rem">${(tipos ?? []).map((t) => { const [k, txt] = situacionTipo(t); return `<li><a href="#/tipo/${t.id}">
      <span><strong>${esc(t.nombre)}</strong></span><span class="der"><strong>${euros(t.importe_cent)}</strong></span>
      <span class="sub">${validezTexto(t)}${t.descripcion ? ` · ${esc(t.descripcion)}` : ''}</span><span class="der"><span class="estado estado--${k}">${txt}</span></span></a></li>`; }).join('') || '<li class="vacio">No hay tipos de bono. La web no venderá nada hasta que crees uno.</li>'}</ul>
    <a class="btn" href="#/tipo/nuevo">Crear tipo de bono</a>`, 'Tipos de bono');
}

async function vistaTipo(id) {
  const nuevo = id === 'nuevo';
  let t = { nombre: '', descripcion: '', importe_cent: null, validez_meses: 12, caduca_fija: null, venta_desde: null, venta_hasta: null, activo: true, orden: 0 };
  if (!nuevo) {
    const { data, error } = await sb.from('tipos_bono').select('*').eq('id', id).maybeSingle();
    if (error) throw error;
    if (!data) return pintar('<p>Ese tipo de bono no existe. <a href="#/tipos">Volver</a></p>', 'No encontrado');
    t = data;
  }
  const fija = !!t.caduca_fija;
  pintar(`<p class="migas"><a href="#/tipos">Tipos de bono</a></p>
    <h1>${nuevo ? 'Nuevo tipo de bono' : esc(t.nombre)}</h1>
    <form id="f-tipo" class="tarjeta">
      <div class="dos">
        <label class="campo"><span>Nombre</span><input name="nombre" maxlength="80" required value="${esc(t.nombre)}" placeholder="Bono 50 €, Menú para dos…"></label>
        <label class="campo"><span>Importe (€)</span><input name="importe" inputmode="decimal" required value="${t.importe_cent ? deCent(t.importe_cent) : ''}"></label>
      </div>
      <label class="campo"><span>Descripción <small>(opcional, sale en la web)</small></span><input name="descripcion" maxlength="300" value="${esc(t.descripcion)}"></label>
      <fieldset><legend>Validez del bono</legend>
        <label class="check"><input type="radio" name="modo" value="meses"${fija ? '' : ' checked'}> Un tiempo desde la compra</label>
        <label class="campo" id="c-meses"><span>Meses</span><input name="validez_meses" type="number" min="1" max="120" value="${t.validez_meses ?? 12}"></label>
        <label class="check"><input type="radio" name="modo" value="fija"${fija ? ' checked' : ''}> Hasta una fecha fija</label>
        <label class="campo" id="c-fija"><span>Caduca el</span><input name="caduca_fija" type="date" value="${esc(t.caduca_fija)}"></label>
      </fieldset>
      <fieldset><legend>Periodo de venta <small class="ayuda">(opcional)</small></legend>
        <p class="ayuda" style="margin:0">Para campañas como Navidad o San Valentín. Vacío: se vende siempre.</p>
        <div class="dos">
          <label class="campo"><span>Desde</span><input name="venta_desde" type="date" value="${esc(t.venta_desde)}"></label>
          <label class="campo"><span>Hasta</span><input name="venta_hasta" type="date" value="${esc(t.venta_hasta)}"></label>
        </div>
      </fieldset>
      <div class="dos">
        <label class="check"><input type="checkbox" name="activo" value="si"${t.activo ? ' checked' : ''}> Activo (se puede comprar)</label>
        <label class="campo"><span>Orden en la web</span><input name="orden" type="number" value="${t.orden ?? 0}"><small>Los números más bajos salen primero.</small></label>
      </div>
      <div class="acciones"><button class="btn" type="submit">${nuevo ? 'Crear' : 'Guardar'}</button>
        ${nuevo ? '' : '<button class="btn btn--peligro" type="button" id="borrar">Borrar</button>'}</div>
    </form>`, nuevo ? 'Nuevo tipo' : t.nombre);
  const f = $vista.querySelector('#f-tipo');
  const modo = () => { const m = f.modo.value; $vista.querySelector('#c-meses').hidden = m !== 'meses'; $vista.querySelector('#c-fija').hidden = m !== 'fija'; };
  f.querySelectorAll('[name="modo"]').forEach((r) => { r.onchange = modo; }); modo();
  enviar('#f-tipo', async (d) => {
    const cent = aCent(d.importe);
    if (!(cent > 0)) return aviso('Escribe un importe válido', true);
    const r = await hacer(sb.rpc('guardar_tipo', { p_comercio: estado.comercio.id, p_id: nuevo ? null : id, p_nombre: d.nombre, p_descripcion: d.descripcion,
      p_importe_cent: cent, p_validez_meses: d.modo === 'meses' ? Number(d.validez_meses) || null : null,
      p_caduca_fija: d.modo === 'fija' ? d.caduca_fija || null : null, p_venta_desde: d.venta_desde || null, p_venta_hasta: d.venta_hasta || null,
      p_activo: d.activo === 'si', p_orden: Number(d.orden) || 0 }), 'Guardado');
    if (r) location.hash = '#/tipos';
  });
  $vista.querySelector('#borrar')?.addEventListener('click', async () => {
    if (!confirm(`¿Borrar "${t.nombre}"? Los bonos ya vendidos siguen valiendo; solo deja de venderse.`)) return;
    if (await hacer(sb.rpc('borrar_tipo', { p_id: id }), 'Tipo de bono borrado')) location.hash = '#/tipos';
  });
}

// ───────────── Ajustes ─────────────
async function vistaAjustes() {
  await cargarMembresias();
  const c = estado.comercio;
  pintar(`<h1>Ajustes</h1>
    <form id="f-ajustes" class="tarjeta">
      <label class="check"><input type="checkbox" name="venta_activa" value="si"${c.venta_activa ? ' checked' : ''}> Venta de bonos en la web activa</label>
      <p class="ayuda" style="margin:0">Desmárcalo para pausar la venta (vacaciones, cierre…). Los bonos ya vendidos se pueden seguir canjeando.</p>
      <label class="campo"><span>Correo para los avisos de venta</span><input name="email_avisos" type="email" required value="${esc(c.email_avisos)}"></label>
      <label class="campo"><span>Locales donde se canjean</span><textarea name="locales" rows="3">${esc((c.locales ?? []).join('\n'))}</textarea><small>Uno por línea. Al canjear se elige el local.</small></label>
      <div><button class="btn" type="submit">Guardar</button></div>
    </form>
    <div class="tarjeta"><h2>Datos técnicos</h2><dl class="datos">
      <dt>Web</dt><dd><a href="${esc(c.web)}/bonos-regalo/" target="_blank" rel="noopener">${esc(c.web)}/bonos-regalo/</a></dd>
      <dt>Pago</dt><dd>${c.redsys_entorno === 'real' ? 'Redsys (real)' : 'Redsys en modo de pruebas'}</dd>
      <dt>Prefijo de los códigos</dt><dd>${esc(c.prefijo_codigo)}</dd>
    </dl><p class="ayuda" style="margin:.8rem 0 0">Los datos del TPV los cambia Eligemenú.</p></div>`, 'Ajustes');
  enviar('#f-ajustes', async (d) => {
    const ok = await hacer(sb.rpc('guardar_ajustes', { p_comercio: c.id, p_email_avisos: d.email_avisos, p_venta_activa: d.venta_activa === 'si',
      p_locales: d.locales.split('\n').map((l) => l.trim()).filter(Boolean) }), 'Ajustes guardados');
    if (ok) { await cargarMembresias(); vistaAjustes(); }
  });
}

// ───────────── Usuarios ─────────────
async function vistaUsuarios() {
  const r = await api('usuarios', { accion: 'listar', comercio: estado.comercio.id });
  if (r.error) throw r.error;
  const yo = estado.sesion.user.id;
  pintar(`<h1>Usuarios</h1>
    <p class="ayuda"><strong>Administrador:</strong> todo. <strong>Personal:</strong> consultar y canjear bonos.</p>
    <ul class="lista" style="margin-bottom:1.25rem">${r.data.usuarios.map((u) => `<li><div class="fila">
      <span>${esc(u.email)}${u.user_id === yo ? ' <small class="ayuda">(tú)</small>' : ''}</span>
      <span class="der">${u.user_id === yo ? (u.rol === 'admin' ? 'Administrador' : 'Personal') : `<label class="visually-hidden" for="rol-${u.user_id}">Permisos de ${esc(u.email)}</label>
        <select id="rol-${u.user_id}" data-rol="${u.user_id}"><option value="admin"${u.rol === 'admin' ? ' selected' : ''}>Administrador</option><option value="personal"${u.rol === 'personal' ? ' selected' : ''}>Personal</option></select>`}</span>
      <span class="sub">Desde el ${fecha(u.creado)}</span>
      <span class="der">${u.user_id === yo ? '' : `<button class="btn btn--peligro" data-quitar="${u.user_id}" data-email="${esc(u.email)}">Quitar</button>`}</span>
    </div></li>`).join('')}</ul>
    <form id="f-usuario" class="tarjeta"><h2>Añadir usuario</h2>
      <div class="dos">
        <label class="campo"><span>Correo</span><input name="email" type="email" required autocomplete="off"></label>
        <label class="campo"><span>Permisos</span><select name="rol"><option value="personal">Personal</option><option value="admin">Administrador</option></select></label>
      </div>
      <label class="campo"><span>Contraseña inicial</span><input name="password" type="text" minlength="8" autocomplete="off" value="${esc(claveAleatoria())}">
        <small>Pásasela a la persona; puede cambiarla en "Cuenta". Si ya tiene usuario en otro restaurante, se ignora.</small></label>
      <div><button class="btn" type="submit">Añadir</button></div>
    </form>`, 'Usuarios');
  enviar('#f-usuario', async (d) => {
    if (await hacer(api('usuarios', { accion: 'crear', comercio: estado.comercio.id, ...d }), `Usuario ${d.email} añadido`)) vistaUsuarios();
  });
  $vista.querySelectorAll('[data-rol]').forEach((s) => s.addEventListener('change', async () => {
    await hacer(api('usuarios', { accion: 'rol', comercio: estado.comercio.id, user_id: s.dataset.rol, rol: s.value }), 'Permisos cambiados');
  }));
  $vista.querySelectorAll('[data-quitar]').forEach((b) => b.addEventListener('click', async () => {
    if (!confirm(`¿Quitar el acceso de ${b.dataset.email}?`)) return;
    if (await hacer(api('usuarios', { accion: 'quitar', comercio: estado.comercio.id, user_id: b.dataset.quitar }), 'Acceso quitado')) vistaUsuarios();
  }));
}
function claveAleatoria() {
  const a = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  return Array.from(crypto.getRandomValues(new Uint8Array(12)), (b) => a[b % a.length]).join('');
}

// ───────────── Arranque ─────────────
async function alCambiarSesion(sesion) {
  const antes = estado.sesion?.user.id;
  estado.sesion = sesion;
  if (sesion && sesion.user.id !== antes) {
    try { await cargarMembresias(); } catch (e) { console.error(e); }
  }
  if (!sesion) { estado.membresias = []; estado.comercio = null; }
  router();
}

if (!supabaseKey || supabaseKey.startsWith('PEGAR')) {
  pintar('<div class="acceso tarjeta"><h1>Falta configurar</h1><p>Pon la clave publicable de Supabase en <code>config.js</code>.</p></div>', 'Configuración');
} else {
  sb.auth.onAuthStateChange((evento, sesion) => {
    if (evento === 'PASSWORD_RECOVERY') estado.recuperando = true;
    if (evento === 'TOKEN_REFRESHED' || evento === 'USER_UPDATED') { estado.sesion = sesion; return; }
    setTimeout(() => alCambiarSesion(sesion), 0); // fuera del callback, como recomienda supabase-js
  });
  window.addEventListener('hashchange', router);
}
