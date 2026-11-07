import { test } from 'node:test';
import assert from 'node:assert/strict';
import { toMenu, loadMenus, allergenKey, type EMMenu } from './eligemenu.ts';

const dish = (o: Partial<Record<string, unknown>>) => ({
  id: 'd', name: 'Plato', description: null, image_url: null, price_1: 10, price_2: null, price_unit: null, price_unit_2: null,
  price_unit_suffix: null, price_unit_2_suffix: null, display_order: 0, is_specialty: false, is_suggestion: false, dish_allergens: [], ...o,
});
const group = (o: Partial<Record<string, unknown>>) => ({
  id: 'g', name: 'Grupo', description: null, display_order: 0, image_url: null, prices_visible: true, has_dual_pricing: false,
  price_header_1: null, price_header_2: null, parent_group_id: null, dishes: [], ...o,
});
const menu: EMMenu = {
  id: 'm', name: 'Carta', description: null, display_order: 0, prices_visible: true,
  menu_groups: [
    group({ id: 'b', name: 'Postres', display_order: 2, dishes: [dish({ name: 'Tarta', price_1: 6.5, dish_allergens: [{ allergen: { id: '1', name: 'Huevos', icon_url: null } }, { allergen: { id: '2', name: 'Lácteos', icon_url: null } }] })] }),
    group({ id: 'a', name: 'Al carbón', display_order: 1, dishes: [dish({ name: 'T-bone', price_1: 76, price_unit: 'kg', display_order: 2 }), dish({ name: 'Chuleta', price_1: 94, price_unit: 'kg', display_order: 1, is_specialty: true })] }),
    group({ id: 'c', name: 'Vinos', display_order: 3, has_dual_pricing: true, price_header_1: 'Botella', price_header_2: 'Copa', dishes: [dish({ name: 'Rioja', price_1: 20, price_2: 4 })] }),
    group({ id: 'c1', name: 'Tintos', parent_group_id: 'c', dishes: [dish({ name: 'Ribera', price_1: 24 })] }),
    group({ id: 'v', name: 'Vacío', display_order: 9, dishes: [] }),
  ],
};

test('ordena grupos y platos, mapea kg, alérgenos y precio doble; quita grupos vacíos', () => {
  const m = toMenu(menu, '2026-11-07');
  assert.deepEqual(m.sections.map((s) => [s.id, s.sub]), [['al-carbon', false], ['postres', false], ['vinos', false], ['tintos', true]]);
  assert.deepEqual(m.sections[0].items.map((i) => [i.name, i.unit, i.featured]), [['Chuleta', 'kg', true], ['T-bone', 'kg', false]]);
  assert.deepEqual(m.sections[1].items[0].allergens, ['huevo', 'lacteos']);
  assert.equal(m.sections[2].items[0].price2, 4);
  assert.deepEqual(m.sections[2].priceHeaders, ['Botella', 'Copa']);
});

test('precios ocultos en la carta: platos sin precio', () => {
  const m = toMenu({ ...menu, prices_visible: false }, '2026-11-07');
  assert.equal(m.sections[0].items[0].price, undefined);
});

test('alérgenos con nombres variados', () => {
  assert.equal(allergenKey('Frutos de cáscara'), 'frutos_cascara');
  assert.equal(allergenKey('Dióxido de azufre y sulfitos'), 'sulfitos');
  assert.equal(allergenKey('Sesame'), 'sesamo');
});

test('sin clave usa la carta local; con clave y API caída, falla', async () => {
  const snapshot = { restaurant: { id: 'r0', name: 'R', slug: 'x', logo_url: null, image_url: null }, menus: [menu] };
  const r = await loadMenus({ slug: 'x', snapshot, snapshotDate: '2026-11-07' });
  assert.equal(r.source, 'local');
  assert.equal(r.menus[0].updated, '2026-11-07');
  const down = (async () => new Response('boom', { status: 503 })) as unknown as typeof fetch;
  await assert.rejects(loadMenus({ slug: 'x', apiKey: 'k', snapshot, fetch: down }), /HTTP 503/);
});

test('con clave pide restaurant-with-menus con el slug y la cabecera apikey', async () => {
  let seen: { url: string; key: string | null } | undefined;
  const ok = (async (u: URL, init: RequestInit) => {
    seen = { url: String(u), key: new Headers(init.headers).get('apikey') };
    return new Response(JSON.stringify({ restaurant: { id: 'r1' }, menus: [menu] }), { status: 200 });
  }) as unknown as typeof fetch;
  const r = await loadMenus({ slug: 'la-vaca-asustada-oviedo', apiKey: 'k', snapshot: { restaurant: { id: 'r0', name: '', slug: '', logo_url: null, image_url: null }, menus: [] }, fetch: ok });
  assert.equal(seen!.url, 'https://jcfiarsoqvczjavikgoh.supabase.co/functions/v1/wordpress-api/restaurant-with-menus?slug=la-vaca-asustada-oviedo');
  assert.equal(seen!.key, 'k');
  assert.equal(r.restaurant.id, 'r1');
  assert.equal(r.menus[0].title, 'Carta');
});

test('sufijos de precio y nombres entre comillas', async () => {
  const { toItem, cleanName } = await import('./eligemenu.ts');
  const g = { prices_visible: true, has_dual_pricing: false };
  assert.equal(toItem(dish({ price_unit: 'kg', price_unit_suffix: '€/kg' }) as never, g).priceLabel, undefined);
  assert.equal(toItem(dish({ price_unit: 'ud', price_unit_suffix: '€/ud' }) as never, g).priceLabel, '/ ud');
  assert.equal(cleanName('"Menu"'), 'Menu');
});

test('horario desde Eligemenú: cerrado, tramos y medianoche', async () => {
  const { hoursFromSchedules } = await import('./eligemenu.ts');
  const { groupHours } = await import('./hours.ts');
  const s = (d: number, a: string, b: string, closed = false) => ({ day_of_week: d, start_time: a + ':00', end_time: b + ':00', is_closed: closed, schedule_type: 'opening' });
  const h = hoursFromSchedules([s(1, '12:30', '16:30'), s(1, '19:00', '00:00'), s(3, '12:30', '16:30', true), s(4, '19:00', '00:30'), s(0, '12:30', '00:00'),
    { ...s(1, '13:00', '16:00'), schedule_type: 'kitchen' }]);
  assert.deepEqual(h.closedDays, ['we']);
  const rows = groupHours(h);
  assert.deepEqual(rows.map((r) => [r.label, r.status, r.slots.join(' ')]), [
    ['Lunes', 'open', '12:30–16:30 19:00–00:00'],
    ['Martes, viernes y sábado', 'unknown', ''],
    ['Miércoles', 'closed', ''],
    ['Jueves', 'open', '19:00–00:30'],
    ['Domingo', 'open', '12:30–00:00'],
  ]);
});

test('quita "(PRECIO KG)" de la descripción', async () => {
  const { toItem } = await import('./eligemenu.ts');
  const i = toItem(dish({ description: 'Chuleta en forma de "hacha", textura tierna (PRECIO KG)', price_unit: 'kg' }) as never, { prices_visible: true, has_dual_pricing: false });
  assert.equal(i.description, 'Chuleta en forma de "hacha", textura tierna');
});
