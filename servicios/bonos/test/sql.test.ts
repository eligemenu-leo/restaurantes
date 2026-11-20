// Prueba las migraciones y las funciones del panel sobre un Postgres en memoria (PGlite),
// con lo mínimo de Supabase (roles y auth.uid()).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

const dir = new URL('../supabase/migrations/', import.meta.url);
const [m1, m2] = fs.readdirSync(dir).sort().map((f) => fs.readFileSync(new URL(f, dir), 'utf8'));
const ADMIN = '11111111-1111-1111-1111-111111111111', PERSONAL = '22222222-2222-2222-2222-222222222222', AJENO = '33333333-3333-3333-3333-333333333333';

const db = new PGlite();
const q = async (sql: string, p: unknown[] = []) => (await db.query<Record<string, any>>(sql, p)).rows;
async function como<T>(uid: string, fn: () => Promise<T>): Promise<T> {
  await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub', '${uid}', false);`);
  try { return await fn(); } finally { await db.exec('reset role'); }
}
const falla = async (p: Promise<unknown>, re: RegExp) => assert.rejects(p, re);

test('migraciones, con un bono vendido antes de la segunda', async () => {
  await db.exec(`
    create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth; create table auth.users (id uuid primary key, email text);
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    grant usage on schema auth to authenticated, service_role; grant usage on schema public to anon, authenticated, service_role;`);
  await db.exec(m1);
  await db.exec(`insert into pedidos (id, comercio_id, num_pedido, importe_cent, comprador_nombre, comprador_email, estado)
    values ('00000000-0000-0000-0000-000000000001', 'la-vaca-asustada', '2611ABCDEFGH', 5000, 'Jorge', 'j@x.es', 'pagado');
    insert into bonos (codigo, pedido_id, comercio_id, importe_cent, caduca)
    values ('VACA-AAAA-BBBB', '00000000-0000-0000-0000-000000000001', 'la-vaca-asustada', 5000, '2027-11-09');`);
  await db.exec(m2);
  await db.exec(`insert into auth.users values ('${ADMIN}', 'leo@x.es'), ('${PERSONAL}', 'cam@x.es'), ('${AJENO}', 'otro@x.es');
    insert into miembros values ('${ADMIN}', 'la-vaca-asustada', 'admin', 'leo@x.es'), ('${PERSONAL}', 'la-vaca-asustada', 'personal', 'cam@x.es');`);
  const [b] = await q(`select * from bonos where codigo = 'VACA-AAAA-BBBB'`);
  assert.equal(b.saldo_cent, 5000);
  assert.equal(b.estado, 'activo');
  assert.equal(b.titular_nombre, 'Jorge');
  assert.ok(b.tipo_id, 'el bono antiguo queda enlazado a su tipo');
  assert.deepEqual((await q(`select importe_cent from tipos_bono order by orden`)).map((t) => t.importe_cent), [5000, 10000, 15000]);
});

test('canje parcial y total por el personal, con sus límites', async () => {
  const [b] = await como(ADMIN, () => q(`select * from crear_bono_manual('la-vaca-asustada', null, 10000, '2030-01-01', 'Ana', 'ANA@x.es', null, null, null)`));
  assert.match(b.codigo, /^VACA-[2-9A-Z]{4}-[2-9A-Z]{4}$/);
  assert.equal(b.titular_email, 'ana@x.es');
  const [r1] = await como(PERSONAL, () => q(`select * from canjear_bono($1, 3000, 'Gijón')`, [b.codigo]));
  assert.deepEqual([r1.saldo_cent, r1.estado], [7000, 'activo']);
  await falla(como(PERSONAL, () => q(`select canjear_bono($1, 8000)`, [b.codigo])), /saldo \(70,00 €\)/);
  const [r2] = await como(PERSONAL, () => q(`select * from canjear_bono($1, 7000)`, [b.codigo]));
  assert.deepEqual([r2.saldo_cent, r2.estado], [0, 'canjeado']);
  await falla(como(PERSONAL, () => q(`select canjear_bono($1, 1)`, [b.codigo])), /canjeado del todo/);
  const [c] = await q(`select id from canjes where bono_codigo = $1 order by id desc limit 1`, [b.codigo]);
  await falla(como(PERSONAL, () => q(`select deshacer_canje($1)`, [c.id])), /permiso/);
  const [r3] = await como(ADMIN, () => q(`select * from deshacer_canje($1)`, [c.id]));
  assert.deepEqual([r3.saldo_cent, r3.estado], [7000, 'activo']);
});

test('caducados: el personal no puede canjear, el administrador sí si lo fuerza', async () => {
  const [b] = await como(ADMIN, () => q(`select * from crear_bono_manual('la-vaca-asustada', null, 2500, '2020-01-01', null, null, null, null, null)`));
  await falla(como(PERSONAL, () => q(`select canjear_bono($1, 100, null, null, true)`, [b.codigo])), /caducó el 01\/01\/2020/);
  const [r] = await como(ADMIN, () => q(`select * from canjear_bono($1, 100, null, null, true)`, [b.codigo]));
  assert.equal(r.saldo_cent, 2400);
});

test('anular, reactivar, editar y borrar', async () => {
  await falla(como(PERSONAL, () => q(`select anular_bono('VACA-AAAA-BBBB', 'x')`)), /permiso/);
  await falla(como(ADMIN, () => q(`select anular_bono('VACA-AAAA-BBBB', ' ')`)), /motivo/);
  await como(ADMIN, () => q(`select anular_bono('VACA-AAAA-BBBB', 'Devolución')`));
  await falla(como(PERSONAL, () => q(`select canjear_bono('VACA-AAAA-BBBB', 100)`)), /anulado/);
  const [r] = await como(ADMIN, () => q(`select * from reactivar_bono('VACA-AAAA-BBBB')`));
  assert.equal(r.estado, 'activo');
  const [e] = await como(ADMIN, () => q(`select * from editar_bono('VACA-AAAA-BBBB', '2028-01-01', 'Jorge', 'j@x.es', 'Luis', null, 'nota')`));
  assert.equal(e.destinatario_nombre, 'Luis');
  await falla(como(ADMIN, () => q(`select borrar_bono('VACA-AAAA-BBBB')`)), /web no se borran/);
  const [m] = await como(ADMIN, () => q(`select * from crear_bono_manual('la-vaca-asustada', null, 1000, '2030-01-01', null, null, null, null, null)`));
  await como(ADMIN, () => q(`select borrar_bono($1)`, [m.codigo]));
  assert.equal((await q(`select count(*)::int n from bonos where codigo = $1`, [m.codigo]))[0].n, 0);
});

test('tipos de bono: validación, alta, baja y caducidad del bono manual', async () => {
  await falla(como(ADMIN, () => q(`select guardar_tipo('la-vaca-asustada', null, 'X', null, 6000, 12, '2027-01-31', null, null, true, 0)`)), /Elige una validez/);
  await falla(como(ADMIN, () => q(`select guardar_tipo('la-vaca-asustada', null, 'X', null, 6000, 12, null, '2026-12-31', '2026-12-01', true, 0)`)), /termina antes/);
  const [t] = await como(ADMIN, () => q(`select * from guardar_tipo('la-vaca-asustada', null, 'Navidad', null, 8000, null, '2027-01-31', '2026-12-01', '2026-12-31', true, 9)`));
  const [b] = await como(ADMIN, () => q(`select * from crear_bono_manual('la-vaca-asustada', $1, null, null, null, null, null, null, null)`, [t.id]));
  assert.equal(b.importe_cent, 8000);
  assert.equal(b.caduca.toISOString().slice(0, 10), '2027-01-31');
  await como(ADMIN, () => q(`select borrar_tipo($1)`, [t.id]));
  assert.equal((await q(`select tipo_id from bonos where codigo = $1`, [b.codigo]))[0].tipo_id, null, 'el bono sigue, sin tipo');
});

test('permisos: cada uno ve lo suyo y nadie lee la clave del TPV', async () => {
  assert.equal((await como(AJENO, () => q(`select count(*)::int n from bonos`)))[0].n, 0);
  await falla(como(AJENO, () => q(`select canjear_bono('VACA-AAAA-BBBB', 1)`)), /permiso/);
  assert.ok((await como(PERSONAL, () => q(`select count(*)::int n from bonos`)))[0].n > 0);
  assert.equal((await como(PERSONAL, () => q(`select count(*)::int n from pedidos`)))[0].n, 0, 'el personal no ve los pedidos');
  assert.deepEqual((await como(PERSONAL, () => q(`select email from miembros`))).map((m) => m.email), ['cam@x.es']);
  await falla(como(PERSONAL, () => q(`select redsys_fuc from comercios`)), /permission denied/);
  await falla(como(ADMIN, () => q(`insert into bonos (codigo, comercio_id, importe_cent, saldo_cent, caduca) values ('VACA-ZZZZ-ZZZZ', 'la-vaca-asustada', 1, 1, '2030-01-01')`)), /permission denied/);
  await db.exec('set role anon');
  try { await falla(q(`select canjear_bono('VACA-AAAA-BBBB', 1)`), /permission denied/); } finally { await db.exec('reset role'); }
});

test('resumen y registro de cambios', async () => {
  const [{ r }] = await como(PERSONAL, () => q(`select resumen_bonos('la-vaca-asustada') r`));
  assert.ok(r.vendidos >= 3 && r.canjeado_cent > 0 && Array.isArray(r.por_mes));
  const tipos = (await q(`select distinct tipo from eventos`)).map((e) => e.tipo).sort();
  for (const t of ['anulado', 'borrado', 'canje', 'canje_deshecho', 'creado_manual', 'editado', 'reactivado', 'tipo_borrado', 'tipo_guardado']) assert.ok(tipos.includes(t), t);
  const [{ n }] = await q(`select count(*)::int n from eventos where tipo = 'canje' and usuario_email = 'cam@x.es'`);
  assert.ok(n >= 2);
});
