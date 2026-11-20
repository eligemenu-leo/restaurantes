-- Base de datos de bonos regalo. Proyecto de Supabase propio, separado de Eligemenú.
-- Solo las funciones (con la clave de servicio) leen y escriben: RLS activado y sin políticas.

create table public.comercios (
  id               text primary key check (id ~ '^[a-z0-9-]+$'),   -- 'la-vaca-asustada'
  nombre           text not null,
  web              text not null,              -- https://… sin barra final; para volver tras el pago
  email_avisos     text not null,              -- adónde llega el aviso de cada venta
  redsys_fuc       text not null check (redsys_fuc ~ '^[0-9]{9}$'),
  redsys_terminal  text not null default '1',
  redsys_entorno   text not null default 'pruebas' check (redsys_entorno in ('pruebas', 'real')),
  importes_cent    integer[],                  -- importes fijos permitidos; null = importe libre
  importe_min_cent integer not null default 1000 check (importe_min_cent > 0),
  importe_max_cent integer not null default 50000,
  validez_meses    integer not null default 12 check (validez_meses > 0),
  prefijo_codigo   text not null check (prefijo_codigo ~ '^[A-Z]{2,6}$'),
  activo           boolean not null default true,
  creado           timestamptz not null default now(),
  check (importe_max_cent >= importe_min_cent)
);
comment on table public.comercios is 'Un restaurante que vende bonos. La clave de Redsys NO va aquí: es el secreto REDSYS_CLAVE_<ID> de las funciones.';

create table public.pedidos (
  id                  uuid primary key default gen_random_uuid(),
  comercio_id         text not null references public.comercios(id),
  num_pedido          text not null unique check (num_pedido ~ '^[0-9]{4}[0-9A-Za-z]{0,8}$'),
  importe_cent        integer not null check (importe_cent > 0),
  comprador_nombre    text not null check (length(comprador_nombre) between 1 and 120),
  comprador_email     text not null check (comprador_email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  destinatario_nombre text check (length(destinatario_nombre) <= 120),
  mensaje             text check (length(mensaje) <= 500),
  estado              text not null default 'pendiente' check (estado in ('pendiente', 'pagado', 'denegado')),
  redsys_respuesta    text,
  redsys_autorizacion text,
  notificacion        jsonb,                   -- parámetros de Redsys tal cual llegaron
  creado              timestamptz not null default now(),
  actualizado         timestamptz
);
create index pedidos_comercio_creado on public.pedidos (comercio_id, creado desc);

create table public.bonos (
  codigo        text primary key,
  pedido_id     uuid not null unique references public.pedidos(id),
  comercio_id   text not null references public.comercios(id),
  importe_cent  integer not null check (importe_cent > 0),
  caduca        date not null,
  canjeado      timestamptz,
  canjeado_nota text,
  creado        timestamptz not null default now()
);
create index bonos_comercio on public.bonos (comercio_id, creado desc);

alter table public.comercios enable row level security;
alter table public.pedidos   enable row level security;
alter table public.bonos     enable row level security;
revoke all on public.comercios, public.pedidos, public.bonos from anon, authenticated;

-- La Vaca Asustada, de momento con el comercio público de pruebas de Redsys (999008881, terminal 1).
-- Cuando el banco dé los datos reales: cambiar redsys_fuc/terminal, poner la clave real como secreto y redsys_entorno = 'real'.
insert into public.comercios (id, nombre, web, email_avisos, redsys_fuc, redsys_terminal, redsys_entorno,
                              importes_cent, validez_meses, prefijo_codigo)
values ('la-vaca-asustada', 'La Vaca Asustada', 'https://la-vaca-asustada.pages.dev', 'info@lavacaasustada.com',
        '999008881', '1', 'pruebas', array[5000, 10000, 15000], 12, 'VACA');
