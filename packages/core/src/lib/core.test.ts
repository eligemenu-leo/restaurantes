import { test } from 'node:test';
import assert from 'node:assert/strict';
import { groupHours, dayLabel, openingHoursSpec } from './hours.ts';
import { price, telHref } from './format.ts';
import { load, Location } from './schema.ts';

test('agrupa días con el mismo horario y marca por confirmar los que faltan', () => {
  const rows = groupHours({
    closedDays: [],
    hours: [
      { days: ['mo', 'we', 'th'], open: '12:30', close: '16:30' },
      { days: ['mo', 'we', 'th'], open: '19:00', close: '24:00' },
      { days: ['fr'], open: '12:30', close: '16:30' },
      { days: ['fr'], open: '19:00', close: '00:30' },
      { days: ['sa', 'su'], open: '12:30', close: '24:00' },
    ],
  });
  assert.deepEqual(rows.map((r) => [r.label, r.status, r.slots.join(' · ')]), [
    ['Lunes, miércoles y jueves', 'open', '12:30–16:30 · 19:00–00:00'],
    ['Martes', 'unknown', ''],
    ['Viernes', 'open', '12:30–16:30 · 19:00–00:30'],
    ['Sábado y domingo', 'open', '12:30–00:00'],
  ]);
});

test('día declarado cerrado', () => {
  const rows = groupHours({ closedDays: ['tu'], hours: [{ days: ['mo'], open: '13:00', close: '16:00' }] });
  assert.equal(rows.find((r) => r.days.includes('tu'))!.status, 'closed');
});

test('etiquetas de días', () => {
  assert.equal(dayLabel(['mo', 'tu', 'we', 'th', 'fr', 'sa', 'su']), 'Todos los días');
  assert.equal(dayLabel(['mo', 'tu', 'we', 'th']), 'Lunes a jueves');
});

test('Schema.org no admite 24:00', () => {
  assert.equal(openingHoursSpec([{ days: ['mo'], open: '19:00', close: '24:00' }])[0].closes, '23:59');
});

test('precios en formato español', () => {
  assert.equal(price(18.5).replace(/\s/g, ' '), '18,50 €');
  assert.equal(price(76, 'kg').replace(/\s/g, ' '), '76,00 € / kg');
});

test('teléfonos', () => {
  assert.equal(telHref('984 68 14 15'), 'tel:+34984681415');
  assert.equal(telHref('+34 984 681 415'), 'tel:+34984681415');
});

test('los datos inválidos fallan con un mensaje claro', () => {
  assert.throws(
    () => load(Location, { id: 'x', name: 'X', address: { street: 'a', postalCode: '1', locality: 'b' }, phone: '1', hours: [] }, 'site.json'),
    /site.json[\s\S]*postalCode/,
  );
});
