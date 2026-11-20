import { createClient } from 'npm:@supabase/supabase-js@2.49.4';

/** Cliente con la clave de servicio: salta RLS. Solo se usa dentro de las funciones. */
export const db = () =>
  createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false },
  });

export interface Comercio {
  id: string;
  nombre: string;
  web: string;
  email_avisos: string;
  redsys_fuc: string;
  redsys_terminal: string;
  redsys_entorno: 'pruebas' | 'real';
  prefijo_codigo: string;
  activo: boolean;
  venta_activa: boolean;
  locales: string[];
}

export interface TipoBono {
  id: string;
  comercio_id: string;
  nombre: string;
  descripcion: string | null;
  importe_cent: number;
  validez_meses: number | null;
  caduca_fija: string | null;
  venta_desde: string | null;
  venta_hasta: string | null;
  activo: boolean;
  orden: number;
}

export interface Bono {
  codigo: string;
  comercio_id: string;
  importe_cent: number;
  saldo_cent: number;
  caduca: string;
  estado: 'activo' | 'canjeado' | 'anulado';
  titular_nombre: string | null;
  titular_email: string | null;
  destinatario_nombre: string | null;
  mensaje: string | null;
}

export { hoy, enVenta, caducidad } from './fechas.ts';

/** La clave de Redsys de cada comercio es un secreto de las funciones: REDSYS_CLAVE_LA_VACA_ASUSTADA. */
export const claveRedsys = (comercioId: string) =>
  Deno.env.get(`REDSYS_CLAVE_${comercioId.toUpperCase().replace(/-/g, '_')}`);
