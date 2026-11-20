import { z } from 'zod';
import raw from './titular.json';

/**
 * Titular del contrato del TPV Redsys, que es quien vende los bonos regalo. Redsys pide que la web
 * muestre su CIF, su razón social y su domicilio social (art. 10 de la LSSICE).
 * Mientras falte un dato, las páginas lo omiten en vez de inventarlo.
 */
const Titular = z.object({
  razonSocial: z.string().min(3).nullable(),
  cif: z.string().regex(/^[A-HJNPQRSUVW]\d{7}[0-9A-J]$/),
  /** Domicilio social en una línea: calle, número, código postal y localidad. */
  domicilio: z.string().min(10).nullable(),
});

export const titular = Titular.parse(raw);
