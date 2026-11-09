-- Gestión de bonos: tipos de bono, saldo y canjes, usuarios del panel, registro de cambios y QR.
-- El panel lee con RLS (cada usuario solo ve su restaurante) y modifica mediante funciones que comprueban el rol.

-- ───────────── Restaurante ─────────────
alter table public.comercios
  add column venta_activa boolean not null default true,
  add column locales text[] not null default '{}';
update public.comercios set locales = array['Gijón', 'Oviedo'] where id = 'la-vaca-asustada';

-- ───────────── Tipos de bono ─────────────
create table public.tipos_bono (
  id            uuid primary key default gen_random_uuid(),
  comercio_id   text not null references public.comercios(id) on delete cascade,
  nombre        text not null check (length(nombre) between 1 and 80),
  descripcion   text check (length(descripcion) <= 300),
  importe_cent  integer not null check (importe_cent > 0),
  validez_meses integer check (validez_meses > 0),   -- caduca X meses después de la compra…
  caduca_fija   date,                               -- …o en una fecha fija (una de las dos)
  venta_desde   date,                               -- periodo de venta programado (opcional)
  venta_hasta   date,
  activo        boolean not null default true,
  orden         integer not null default 0,
  creado        timestamptz not null default now(),
  actualizado   timestamptz,
  check ((validez_meses is null) <> (caduca_fija is null)),
  check (venta_hasta is null or venta_desde is null or venta_hasta >= venta_desde)
);
create index tipos_bono_comercio on public.tipos_bono (comercio_id, orden);

insert into public.tipos_bono (comercio_id, nombre, importe_cent, validez_meses, orden)
select c.id, 'Bono ' || (i / 100) || ' €', i, c.validez_meses, row_number() over (partition by c.id order by i)
from public.comercios c, unnest(c.importes_cent) as i;

alter table public.comercios
  drop column importes_cent, drop column importe_min_cent, drop column importe_max_cent, drop column validez_meses;

-- ───────────── Pedidos ─────────────
alter table public.pedidos add column tipo_id uuid references public.tipos_bono(id) on delete set null;
update public.pedidos p set tipo_id = t.id from public.tipos_bono t
where t.comercio_id = p.comercio_id and t.importe_cent = p.importe_cent and p.tipo_id is null;

-- ───────────── Bonos: saldo, estado y datos del titular ─────────────
alter table public.bonos
  alter column pedido_id drop not null,
  add column tipo_id             uuid references public.tipos_bono(id) on delete set null,
  add column saldo_cent          integer,
  add column estado              text not null default 'activo' check (estado in ('activo', 'canjeado', 'anulado')),
  add column origen              text not null default 'web' check (origen in ('web', 'manual')),
  add column titular_nombre      text check (length(titular_nombre) <= 120),
  add column titular_email       text check (length(titular_email) <= 200),
  add column destinatario_nombre text check (length(destinatario_nombre) <= 120),
  add column mensaje             text check (length(mensaje) <= 500),
  add column nota                text check (length(nota) <= 1000),
  add column anulado_motivo      text,
  add column actualizado         timestamptz;

update public.bonos b set
  saldo_cent = case when b.canjeado is null then b.importe_cent else 0 end,
  estado = case when b.canjeado is null then 'activo' else 'canjeado' end,
  tipo_id = p.tipo_id, titular_nombre = p.comprador_nombre, titular_email = p.comprador_email,
  destinatario_nombre = p.destinatario_nombre, mensaje = p.mensaje
from public.pedidos p where p.id = b.pedido_id;

alter table public.bonos
  alter column saldo_cent set not null,
  add constraint bonos_saldo check (saldo_cent between 0 and importe_cent),
  add constraint bonos_estado_saldo check (estado = 'anulado' or (estado = 'canjeado') = (saldo_cent = 0));
create index bonos_comercio_estado on public.bonos (comercio_id, estado, caduca);

-- ───────────── Canjes y registro ─────────────
create table public.canjes (
  id            bigint generated always as identity primary key,
  bono_codigo   text not null references public.bonos(codigo) on delete cascade,
  comercio_id   text not null references public.comercios(id) on delete cascade,
  importe_cent  integer not null check (importe_cent > 0),
  local         text,
  nota          text check (length(nota) <= 500),
  usuario       uuid,
  usuario_email text,
  deshecho      timestamptz,
  creado        timestamptz not null default now()
);
create index canjes_bono on public.canjes (bono_codigo, creado desc);
create index canjes_comercio on public.canjes (comercio_id, creado desc);

insert into public.canjes (bono_codigo, comercio_id, importe_cent, nota, creado)
select codigo, comercio_id, importe_cent, canjeado_nota, canjeado from public.bonos where canjeado is not null;
alter table public.bonos drop column canjeado, drop column canjeado_nota;

create table public.eventos (
  id            bigint generated always as identity primary key,
  comercio_id   text not null references public.comercios(id) on delete cascade,
  bono_codigo   text,
  tipo          text not null,
  detalle       jsonb,
  usuario       uuid,
  usuario_email text,
  creado        timestamptz not null default now()
);
create index eventos_bono on public.eventos (bono_codigo, creado desc);
create index eventos_comercio on public.eventos (comercio_id, creado desc);

-- ───────────── Usuarios del panel ─────────────
create table public.miembros (
  user_id     uuid not null references auth.users(id) on delete cascade,
  comercio_id text not null references public.comercios(id) on delete cascade,
  rol         text not null check (rol in ('admin', 'personal')),
  email       text not null,
  creado      timestamptz not null default now(),
  primary key (user_id, comercio_id)
);

create function public.mi_rol(c text) returns text
language sql stable security definer set search_path = public as $$
  select rol from public.miembros where user_id = auth.uid() and comercio_id = c
$$;

create function public.exigir_rol(c text, admin boolean) returns void
language plpgsql stable security definer set search_path = public as $$
declare r text := public.mi_rol(c);
begin
  if r is null or (admin and r <> 'admin') then
    raise exception 'No tienes permiso para esto' using errcode = '42501';
  end if;
end $$;

create function public.registrar(c text, codigo text, tipo text, detalle jsonb) returns void
language sql security definer set search_path = public as $$
  insert into public.eventos (comercio_id, bono_codigo, tipo, detalle, usuario, usuario_email)
  values (c, codigo, tipo, detalle, auth.uid(), (select email from auth.users where id = auth.uid()))
$$;

-- ───────────── Permisos de lectura (RLS) ─────────────
alter table public.tipos_bono enable row level security;
alter table public.canjes     enable row level security;
alter table public.eventos    enable row level security;
alter table public.miembros   enable row level security;

create policy leer on public.comercios  for select to authenticated using (public.mi_rol(id) is not null);
create policy leer on public.tipos_bono for select to authenticated using (public.mi_rol(comercio_id) is not null);
create policy leer on public.bonos      for select to authenticated using (public.mi_rol(comercio_id) is not null);
create policy leer on public.canjes     for select to authenticated using (public.mi_rol(comercio_id) is not null);
create policy leer on public.eventos    for select to authenticated using (public.mi_rol(comercio_id) is not null);
create policy leer on public.pedidos    for select to authenticated using (public.mi_rol(comercio_id) = 'admin');
create policy leer on public.miembros   for select to authenticated
  using (user_id = auth.uid() or public.mi_rol(comercio_id) = 'admin');

revoke all on public.tipos_bono, public.canjes, public.eventos, public.miembros from anon, authenticated;
grant select on public.comercios, public.tipos_bono, public.bonos, public.canjes, public.eventos, public.pedidos, public.miembros
  to authenticated;
-- Ni siquiera el panel lee la configuración de Redsys.
revoke select on public.comercios from authenticated;
grant select (id, nombre, web, email_avisos, venta_activa, locales, prefijo_codigo, redsys_entorno) on public.comercios to authenticated;

-- ───────────── Operaciones ─────────────
create function public.generar_codigo(prefijo text) returns text
language plpgsql volatile set search_path = public as $$
declare
  alfabeto constant text := '23456789ABCDEFGHJKMNPQRSTVWXYZ';
  b bytea := uuid_send(gen_random_uuid());
  s text := '';
begin
  for i in 0..7 loop
    s := s || substr(alfabeto, (get_byte(b, i) % 30) + 1, 1);
    if i = 3 then s := s || '-'; end if;
  end loop;
  return prefijo || '-' || s;
end $$;

create function public.canjear_bono(p_codigo text, p_importe_cent integer, p_local text default null,
                                    p_nota text default null, p_forzar boolean default false)
returns public.bonos language plpgsql security definer set search_path = public as $$
declare b public.bonos;
begin
  select * into b from public.bonos where codigo = upper(trim(p_codigo)) for update;
  if not found then raise exception 'Ese código no existe' using errcode = 'P0002'; end if;
  perform public.exigir_rol(b.comercio_id, false);
  if b.estado = 'anulado' then raise exception 'El bono está anulado' using errcode = 'P0001'; end if;
  if b.saldo_cent = 0 then raise exception 'El bono ya está canjeado del todo' using errcode = 'P0001'; end if;
  if b.caduca < current_date and not (p_forzar and public.mi_rol(b.comercio_id) = 'admin') then
    raise exception 'El bono caducó el %', to_char(b.caduca, 'DD/MM/YYYY') using errcode = 'P0001';
  end if;
  if p_importe_cent is null or p_importe_cent <= 0 or p_importe_cent > b.saldo_cent then
    raise exception 'El importe debe estar entre 0,01 € y el saldo (% €)', replace(to_char(b.saldo_cent / 100.0, 'FM999990.00'), '.', ',')
      using errcode = 'P0001';
  end if;
  insert into public.canjes (bono_codigo, comercio_id, importe_cent, local, nota, usuario, usuario_email)
  values (b.codigo, b.comercio_id, p_importe_cent, nullif(trim(p_local), ''), nullif(trim(p_nota), ''), auth.uid(),
          (select email from auth.users where id = auth.uid()));
  update public.bonos set saldo_cent = saldo_cent - p_importe_cent,
    estado = case when saldo_cent - p_importe_cent = 0 then 'canjeado' else 'activo' end, actualizado = now()
  where codigo = b.codigo returning * into b;
  perform public.registrar(b.comercio_id, b.codigo, 'canje',
    jsonb_build_object('importe_cent', p_importe_cent, 'local', p_local, 'saldo_cent', b.saldo_cent, 'forzado', p_forzar));
  return b;
end $$;

create function public.deshacer_canje(p_canje bigint) returns public.bonos
language plpgsql security definer set search_path = public as $$
declare c public.canjes; b public.bonos;
begin
  select * into c from public.canjes where id = p_canje for update;
  if not found or c.deshecho is not null then raise exception 'Ese canje no existe o ya se deshizo' using errcode = 'P0001'; end if;
  perform public.exigir_rol(c.comercio_id, true);
  update public.canjes set deshecho = now() where id = c.id;
  update public.bonos set saldo_cent = saldo_cent + c.importe_cent,
    estado = case when estado = 'anulado' then 'anulado' else 'activo' end, actualizado = now()
  where codigo = c.bono_codigo returning * into b;
  perform public.registrar(c.comercio_id, c.bono_codigo, 'canje_deshecho', jsonb_build_object('canje', c.id, 'importe_cent', c.importe_cent));
  return b;
end $$;

create function public.anular_bono(p_codigo text, p_motivo text) returns public.bonos
language plpgsql security definer set search_path = public as $$
declare b public.bonos;
begin
  select * into b from public.bonos where codigo = p_codigo for update;
  if not found then raise exception 'Ese código no existe' using errcode = 'P0002'; end if;
  perform public.exigir_rol(b.comercio_id, true);
  if coalesce(trim(p_motivo), '') = '' then raise exception 'Indica el motivo de la anulación' using errcode = 'P0001'; end if;
  update public.bonos set estado = 'anulado', anulado_motivo = trim(p_motivo), actualizado = now()
  where codigo = p_codigo returning * into b;
  perform public.registrar(b.comercio_id, b.codigo, 'anulado', jsonb_build_object('motivo', p_motivo));
  return b;
end $$;

create function public.reactivar_bono(p_codigo text) returns public.bonos
language plpgsql security definer set search_path = public as $$
declare b public.bonos;
begin
  select * into b from public.bonos where codigo = p_codigo for update;
  if not found then raise exception 'Ese código no existe' using errcode = 'P0002'; end if;
  perform public.exigir_rol(b.comercio_id, true);
  update public.bonos set estado = case when saldo_cent = 0 then 'canjeado' else 'activo' end, anulado_motivo = null, actualizado = now()
  where codigo = p_codigo returning * into b;
  perform public.registrar(b.comercio_id, b.codigo, 'reactivado', null);
  return b;
end $$;

create function public.editar_bono(p_codigo text, p_caduca date, p_titular_nombre text, p_titular_email text,
                                   p_destinatario text, p_mensaje text, p_nota text)
returns public.bonos language plpgsql security definer set search_path = public as $$
declare b public.bonos; antes public.bonos;
begin
  select * into antes from public.bonos where codigo = p_codigo for update;
  if not found then raise exception 'Ese código no existe' using errcode = 'P0002'; end if;
  perform public.exigir_rol(antes.comercio_id, true);
  if p_caduca is null then raise exception 'La fecha de caducidad es obligatoria' using errcode = 'P0001'; end if;
  update public.bonos set caduca = p_caduca, titular_nombre = nullif(trim(p_titular_nombre), ''),
    titular_email = nullif(lower(trim(p_titular_email)), ''), destinatario_nombre = nullif(trim(p_destinatario), ''),
    mensaje = nullif(trim(p_mensaje), ''), nota = nullif(trim(p_nota), ''), actualizado = now()
  where codigo = p_codigo returning * into b;
  perform public.registrar(b.comercio_id, b.codigo, 'editado', jsonb_strip_nulls(jsonb_build_object(
    'caduca', case when antes.caduca is distinct from b.caduca then jsonb_build_array(antes.caduca, b.caduca) end,
    'titular_email', case when antes.titular_email is distinct from b.titular_email then jsonb_build_array(antes.titular_email, b.titular_email) end,
    'destinatario', case when antes.destinatario_nombre is distinct from b.destinatario_nombre then jsonb_build_array(antes.destinatario_nombre, b.destinatario_nombre) end)));
  return b;
end $$;

create function public.crear_bono_manual(p_comercio text, p_tipo uuid, p_importe_cent integer, p_caduca date,
                                         p_titular_nombre text, p_titular_email text, p_destinatario text,
                                         p_mensaje text, p_nota text)
returns public.bonos language plpgsql security definer set search_path = public as $$
declare b public.bonos; t public.tipos_bono; pref text; cad date := p_caduca; imp integer := p_importe_cent;
begin
  perform public.exigir_rol(p_comercio, true);
  if p_tipo is not null then
    select * into t from public.tipos_bono where id = p_tipo and comercio_id = p_comercio;
    if not found then raise exception 'Ese tipo de bono no existe' using errcode = 'P0001'; end if;
    imp := coalesce(imp, t.importe_cent);
    cad := coalesce(cad, t.caduca_fija, (current_date + make_interval(months => t.validez_meses))::date);
  end if;
  if imp is null or imp <= 0 then raise exception 'Indica un importe' using errcode = 'P0001'; end if;
  if cad is null then raise exception 'Indica la fecha de caducidad' using errcode = 'P0001'; end if;
  select prefijo_codigo into pref from public.comercios where id = p_comercio;
  for i in 1..5 loop
    begin
      insert into public.bonos (codigo, comercio_id, tipo_id, importe_cent, saldo_cent, caduca, origen, titular_nombre,
                                titular_email, destinatario_nombre, mensaje, nota)
      values (public.generar_codigo(pref), p_comercio, p_tipo, imp, imp, cad, 'manual', nullif(trim(p_titular_nombre), ''),
              nullif(lower(trim(p_titular_email)), ''), nullif(trim(p_destinatario), ''), nullif(trim(p_mensaje), ''),
              nullif(trim(p_nota), ''))
      returning * into b;
      exit;
    exception when unique_violation then null;
    end;
  end loop;
  if b.codigo is null then raise exception 'No se pudo generar el código, inténtalo otra vez'; end if;
  perform public.registrar(p_comercio, b.codigo, 'creado_manual', jsonb_build_object('importe_cent', imp));
  return b;
end $$;

create function public.borrar_bono(p_codigo text) returns void
language plpgsql security definer set search_path = public as $$
declare b public.bonos;
begin
  select * into b from public.bonos where codigo = p_codigo for update;
  if not found then raise exception 'Ese código no existe' using errcode = 'P0002'; end if;
  perform public.exigir_rol(b.comercio_id, true);
  if b.origen <> 'manual' then raise exception 'Los bonos vendidos en la web no se borran: anúlalo' using errcode = 'P0001'; end if;
  if exists (select 1 from public.canjes where bono_codigo = b.codigo and deshecho is null) then
    raise exception 'El bono tiene canjes: anúlalo en vez de borrarlo' using errcode = 'P0001';
  end if;
  delete from public.bonos where codigo = p_codigo;
  perform public.registrar(b.comercio_id, b.codigo, 'borrado', jsonb_build_object('importe_cent', b.importe_cent));
end $$;

create function public.guardar_tipo(p_comercio text, p_id uuid, p_nombre text, p_descripcion text, p_importe_cent integer,
                                    p_validez_meses integer, p_caduca_fija date, p_venta_desde date, p_venta_hasta date,
                                    p_activo boolean, p_orden integer)
returns public.tipos_bono language plpgsql security definer set search_path = public as $$
declare t public.tipos_bono;
begin
  perform public.exigir_rol(p_comercio, true);
  if coalesce(trim(p_nombre), '') = '' then raise exception 'Pon un nombre al tipo de bono' using errcode = 'P0001'; end if;
  if p_importe_cent is null or p_importe_cent <= 0 then raise exception 'Indica un importe' using errcode = 'P0001'; end if;
  if (p_validez_meses is null) = (p_caduca_fija is null) then
    raise exception 'Elige una validez: meses desde la compra o una fecha fija' using errcode = 'P0001';
  end if;
  if p_venta_desde is not null and p_venta_hasta is not null and p_venta_hasta < p_venta_desde then
    raise exception 'El periodo de venta termina antes de empezar' using errcode = 'P0001';
  end if;
  if p_id is null then
    insert into public.tipos_bono (comercio_id, nombre, descripcion, importe_cent, validez_meses, caduca_fija,
                                   venta_desde, venta_hasta, activo, orden)
    values (p_comercio, trim(p_nombre), nullif(trim(p_descripcion), ''), p_importe_cent, p_validez_meses, p_caduca_fija,
            p_venta_desde, p_venta_hasta, coalesce(p_activo, true), coalesce(p_orden, 0))
    returning * into t;
  else
    update public.tipos_bono set nombre = trim(p_nombre), descripcion = nullif(trim(p_descripcion), ''),
      importe_cent = p_importe_cent, validez_meses = p_validez_meses, caduca_fija = p_caduca_fija,
      venta_desde = p_venta_desde, venta_hasta = p_venta_hasta, activo = coalesce(p_activo, true),
      orden = coalesce(p_orden, 0), actualizado = now()
    where id = p_id and comercio_id = p_comercio returning * into t;
    if not found then raise exception 'Ese tipo de bono no existe' using errcode = 'P0002'; end if;
  end if;
  perform public.registrar(p_comercio, null, 'tipo_guardado', jsonb_build_object('id', t.id, 'nombre', t.nombre));
  return t;
end $$;

create function public.borrar_tipo(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare t public.tipos_bono;
begin
  select * into t from public.tipos_bono where id = p_id;
  if not found then raise exception 'Ese tipo de bono no existe' using errcode = 'P0002'; end if;
  perform public.exigir_rol(t.comercio_id, true);
  delete from public.tipos_bono where id = p_id;   -- los bonos ya vendidos se quedan, sin tipo
  perform public.registrar(t.comercio_id, null, 'tipo_borrado', jsonb_build_object('nombre', t.nombre));
end $$;

create function public.guardar_ajustes(p_comercio text, p_email_avisos text, p_venta_activa boolean, p_locales text[])
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public.exigir_rol(p_comercio, true);
  if p_email_avisos !~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'El correo de avisos no es válido' using errcode = 'P0001'; end if;
  update public.comercios set email_avisos = lower(trim(p_email_avisos)), venta_activa = p_venta_activa,
    locales = coalesce((select array_agg(trim(l)) from unnest(p_locales) l where trim(l) <> ''), '{}')
  where id = p_comercio;
  perform public.registrar(p_comercio, null, 'ajustes', jsonb_build_object('venta_activa', p_venta_activa));
end $$;

create function public.resumen_bonos(p_comercio text) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare r jsonb;
begin
  perform public.exigir_rol(p_comercio, false);
  select jsonb_build_object(
    'vendidos',        count(*) filter (where estado <> 'anulado'),
    'vendido_cent',    coalesce(sum(importe_cent) filter (where estado <> 'anulado'), 0),
    'vendido_web_cent', coalesce(sum(importe_cent) filter (where estado <> 'anulado' and origen = 'web'), 0),
    'pendiente_cent',  coalesce(sum(saldo_cent) filter (where estado = 'activo' and caduca >= current_date), 0),
    'activos',         count(*) filter (where estado = 'activo' and caduca >= current_date),
    'caducado_cent',   coalesce(sum(saldo_cent) filter (where estado = 'activo' and caduca < current_date), 0),
    'caducan_30',      count(*) filter (where estado = 'activo' and caduca between current_date and current_date + 30),
    'anulados',        count(*) filter (where estado = 'anulado'),
    'canjeado_cent',   (select coalesce(sum(importe_cent), 0) from public.canjes where comercio_id = p_comercio and deshecho is null),
    'por_mes', (select coalesce(jsonb_agg(m order by m->>'mes'), '[]') from (
        select jsonb_build_object('mes', to_char(date_trunc('month', creado), 'YYYY-MM'), 'vendidos', count(*), 'cent', sum(importe_cent)) m
        from public.bonos where comercio_id = p_comercio and estado <> 'anulado' and creado > now() - interval '12 months'
        group by date_trunc('month', creado)) x)
  ) into r from public.bonos where comercio_id = p_comercio;
  return r;
end $$;

-- Para la función de usuarios (solo con la clave de servicio).
create function public.usuario_por_email(p_email text) returns uuid
language sql stable security definer set search_path = public as $$
  select id from auth.users where lower(email) = lower(trim(p_email)) limit 1
$$;

revoke execute on all functions in schema public from public, anon;
grant execute on function public.canjear_bono, public.deshacer_canje, public.anular_bono, public.reactivar_bono,
  public.editar_bono, public.crear_bono_manual, public.borrar_bono, public.guardar_tipo, public.borrar_tipo,
  public.guardar_ajustes, public.resumen_bonos, public.mi_rol to authenticated;
revoke execute on function public.usuario_por_email, public.registrar, public.generar_codigo from authenticated;
grant execute on function public.usuario_por_email, public.generar_codigo to service_role;
