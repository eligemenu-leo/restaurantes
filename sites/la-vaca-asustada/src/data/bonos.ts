import { z } from 'zod';
import raw from './bonos.json';

/**
 * Bonos regalo. Se pagan con Redsys a través del servicio de servicios/bonos (Supabase).
 * Los importes y la validez tienen que coincidir con la fila del comercio en la base de datos de bonos,
 * que es la que manda: la web solo los muestra.
 */
const Bonos = z.object({
  /** Mientras sea false la página dice "muy pronto", no admite pedidos y no sale en el menú. */
  activo: z.boolean(),
  /** URL de la función bonos-pedido: https://<proyecto>.supabase.co/functions/v1/bonos-pedido */
  endpoint: z.union([z.literal(''), z.url()]),
  comercio: z.string(),
  importes: z.array(z.number().int().positive()).min(1),
  validezMeses: z.number().int().positive(),
  locales: z.array(z.string()).min(1),
  email: z.email(),
}).refine((b) => !b.activo || b.endpoint, { message: 'Para activar los bonos hace falta el endpoint' });

export const bonos = Bonos.parse(raw);
