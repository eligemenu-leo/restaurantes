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
  importes_cent: number[] | null;
  importe_min_cent: number;
  importe_max_cent: number;
  validez_meses: number;
  prefijo_codigo: string;
  activo: boolean;
}

/** La clave de Redsys de cada comercio es un secreto de las funciones: REDSYS_CLAVE_LA_VACA_ASUSTADA. */
export const claveRedsys = (comercioId: string) =>
  Deno.env.get(`REDSYS_CLAVE_${comercioId.toUpperCase().replace(/-/g, '_')}`);
