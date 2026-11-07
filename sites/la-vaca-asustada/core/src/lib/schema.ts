// Modelo de datos común para webs de restaurante.
// Cada web guarda su contenido en JSON y lo valida con estos esquemas al compilar:
// si un dato está mal (precio vacío, hora imposible), la compilación falla.
import { z } from 'zod';

export const DAYS = ['mo', 'tu', 'we', 'th', 'fr', 'sa', 'su'] as const;
export type Day = (typeof DAYS)[number];

const time = z.string().regex(/^([01]\d|2[0-4]):[0-5]\d$/, 'Hora en formato HH:MM (24:00 vale como medianoche)');

/** Un tramo de apertura. Si `close` es menor que `open`, cierra al día siguiente (p. ej. 19:30–01:00). */
export const OpeningSlot = z.object({
  days: z.array(z.enum(DAYS)).min(1),
  open: time,
  close: time,
});

export const Address = z.object({
  street: z.string().min(1),
  postalCode: z.string().regex(/^\d{5}$/),
  locality: z.string().min(1),
  region: z.string().default('Asturias'),
  country: z.string().default('ES'),
});

export const Location = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/),
  name: z.string().min(1),
  address: Address,
  phone: z.string().min(9),
  email: z.string().email().optional(),
  hours: z.array(OpeningSlot).min(1),
  /** Días cerrados declarados explícitamente; sirve para no adivinar. */
  closedDays: z.array(z.enum(DAYS)).default([]),
  reservationUrl: z.string().url().optional(),
  mapsQuery: z.string().optional(),
});

/** Los 14 alérgenos de declaración obligatoria (Reglamento UE 1169/2011). */
export const ALLERGENS = {
  gluten: 'Gluten',
  crustaceos: 'Crustáceos',
  huevo: 'Huevo',
  pescado: 'Pescado',
  cacahuete: 'Cacahuete',
  soja: 'Soja',
  lacteos: 'Lácteos',
  frutos_cascara: 'Frutos de cáscara',
  apio: 'Apio',
  mostaza: 'Mostaza',
  sesamo: 'Sésamo',
  sulfitos: 'Sulfitos',
  altramuces: 'Altramuces',
  moluscos: 'Moluscos',
} as const;

export const MenuItem = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  /** Precio en euros. */
  price: z.number().positive(),
  unit: z.enum(['racion', 'kg', 'botella', 'copa']).default('racion'),
  allergens: z.array(z.enum(Object.keys(ALLERGENS) as [keyof typeof ALLERGENS, ...(keyof typeof ALLERGENS)[]])).optional(),
  featured: z.boolean().default(false),
  tagline: z.string().optional(),
  image: z.string().optional(),
});

export const MenuSection = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/),
  name: z.string().min(1),
  note: z.string().optional(),
  items: z.array(MenuItem).min(1),
});

export const Menu = z.object({
  title: z.string(),
  /** Fecha de la última revisión de precios con el cliente (AAAA-MM-DD). */
  updated: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  notes: z.array(z.string()).default([]),
  sections: z.array(MenuSection).min(1),
});

export const Review = z.object({
  author: z.string(),
  date: z.string().optional(),
  text: z.string().min(1),
  source: z.enum(['google', 'tripadvisor', 'directa']).default('google'),
});

export const Site = z.object({
  name: z.string(),
  url: z.string().url(),
  lang: z.string().default('es'),
  description: z.string().max(170),
  cuisine: z.array(z.string()).default([]),
  priceRange: z.string().optional(),
  locations: z.array(Location).min(1),
  nav: z.array(z.object({ label: z.string(), href: z.string() })),
  legal: z.object({
    owner: z.string().optional(),
    taxId: z.string().optional(),
  }).default({}),
  social: z.array(z.object({ label: z.string(), url: z.string().url() })).default([]),
  reviews: z.array(Review).default([]),
  credit: z.string().optional(),
});

export type SiteData = z.infer<typeof Site>;
export type LocationData = z.infer<typeof Location>;
export type MenuData = z.infer<typeof Menu>;
export type MenuItemData = z.infer<typeof MenuItem>;
export type OpeningSlotData = z.infer<typeof OpeningSlot>;

/** Valida y devuelve los datos; si fallan, el mensaje dice qué campo y en qué archivo. */
export function load<T extends z.ZodTypeAny>(schema: T, data: unknown, file: string): z.infer<T> {
  const r = schema.safeParse(data);
  if (!r.success) {
    const issues = r.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`).join('\n');
    throw new Error(`Contenido no válido en ${file}:\n${issues}`);
  }
  return r.data;
}
