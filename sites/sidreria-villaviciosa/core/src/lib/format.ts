const eur = new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', minimumFractionDigits: 2 });

const UNIT: Record<string, string> = { racion: '', kg: ' / kg', botella: '', copa: ' / copa' };

/** 18.5 → "18,50 €"; con unidad kg → "76,00 € / kg". */
export function price(value: number, unit = 'racion'): string {
  // Intl usa espacio duro antes del símbolo: lo mantenemos para que no se parta la línea.
  return eur.format(value) + (UNIT[unit] ?? '');
}

/** Enlace tel: limpio a partir de un teléfono escrito para humanos. */
export function telHref(phone: string): string {
  const digits = phone.replace(/[^\d+]/g, '');
  return 'tel:' + (digits.startsWith('+') ? digits : '+34' + digits);
}

export function mapsHref(query: string): string {
  return 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(query);
}
