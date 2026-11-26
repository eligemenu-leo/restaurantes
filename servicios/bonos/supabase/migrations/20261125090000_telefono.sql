-- Teléfono de contacto del comprador (lo pide el formulario de /bonos-regalo/) y del titular de cada bono.
-- Se puede ejecutar más de una vez.

alter table public.pedidos add column if not exists comprador_telefono text check (length(comprador_telefono) <= 30);
alter table public.bonos   add column if not exists titular_telefono  text check (length(titular_telefono) <= 30);

-- Los bonos ya vendidos toman el teléfono de su pedido, si lo tiene.
update public.bonos b set titular_telefono = p.comprador_telefono
from public.pedidos p where p.id = b.pedido_id and b.titular_telefono is null and p.comprador_telefono is not null;

-- Editar y crear bonos desde el panel, ahora con teléfono (último parámetro, opcional).
drop function if exists public.editar_bono(text, date, text, text, text, text, text);
drop function if exists public.editar_bono(text, date, text, text, text, text, text, text);
drop function if exists public.crear_bono_manual(text, uuid, integer, date, text, text, text, text, text);
drop function if exists public.crear_bono_manual(text, uuid, integer, date, text, text, text, text, text, text);

create function public.editar_bono(p_codigo text, p_caduca date, p_titular_nombre text, p_titular_email text,
                                   p_destinatario text, p_mensaje text, p_nota text,
                                   p_titular_telefono text default null)
returns public.bonos language plpgsql security definer set search_path = public as $$
declare b public.bonos; antes public.bonos;
begin
  select * into antes from public.bonos where codigo = p_codigo for update;
  if not found then raise exception 'Ese código no existe' using errcode = 'P0002'; end if;
  perform public.exigir_rol(antes.comercio_id, true);
  if p_caduca is null then raise exception 'La fecha de caducidad es obligatoria' using errcode = 'P0001'; end if;
  update public.bonos set caduca = p_caduca, titular_nombre = nullif(trim(p_titular_nombre), ''),
    titular_email = nullif(lower(trim(p_titular_email)), ''),
    titular_telefono = nullif(trim(p_titular_telefono), ''), destinatario_nombre = nullif(trim(p_destinatario), ''),
    mensaje = nullif(trim(p_mensaje), ''), nota = nullif(trim(p_nota), ''), actualizado = now()
  where codigo = p_codigo returning * into b;
  perform public.registrar(b.comercio_id, b.codigo, 'editado', jsonb_strip_nulls(jsonb_build_object(
    'caduca', case when antes.caduca is distinct from b.caduca then jsonb_build_array(antes.caduca, b.caduca) end,
    'titular_email', case when antes.titular_email is distinct from b.titular_email then jsonb_build_array(antes.titular_email, b.titular_email) end,
    'titular_telefono', case when antes.titular_telefono is distinct from b.titular_telefono then jsonb_build_array(antes.titular_telefono, b.titular_telefono) end,
    'destinatario', case when antes.destinatario_nombre is distinct from b.destinatario_nombre then jsonb_build_array(antes.destinatario_nombre, b.destinatario_nombre) end)));
  return b;
end $$;

create function public.crear_bono_manual(p_comercio text, p_tipo uuid, p_importe_cent integer, p_caduca date,
                                         p_titular_nombre text, p_titular_email text, p_destinatario text,
                                         p_mensaje text, p_nota text,
                                         p_titular_telefono text default null)
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
                                titular_email, titular_telefono, destinatario_nombre, mensaje, nota)
      values (public.generar_codigo(pref), p_comercio, p_tipo, imp, imp, cad, 'manual', nullif(trim(p_titular_nombre), ''),
              nullif(lower(trim(p_titular_email)), ''), nullif(trim(p_titular_telefono), ''), nullif(trim(p_destinatario), ''), nullif(trim(p_mensaje), ''),
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

revoke execute on function public.editar_bono, public.crear_bono_manual from public, anon;
grant execute on function public.editar_bono, public.crear_bono_manual to authenticated;
