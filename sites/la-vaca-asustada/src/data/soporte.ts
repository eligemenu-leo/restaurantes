import { z } from 'zod';
import raw from './soporte.json';

/**
 * Atención al cliente de las compras en la web (bonos regalo y pagos con Redsys).
 * La atiende el propio restaurante (Gijón).
 */
const Soporte = z.object({
  email: z.email(),
  /** Teléfono nacional, con espacios para mostrarlo; el enlace tel: se forma con telHref. */
  telefono: z.string().regex(/^[\d ]{9,}$/),
});

export const soporte = Soporte.parse(raw);
