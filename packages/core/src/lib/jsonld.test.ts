import { test } from 'node:test';
import assert from 'node:assert/strict';
import { restaurantGraph } from './jsonld.ts';
import { intlPhone } from './format.ts';
import { load, Site } from './schema.ts';

const loc = (id: string, name: string, path?: string) => ({
  id, name, phone: '663 20 06 15', path,
  address: { street: 'C/ Mayor, 1', postalCode: '33201', locality: name },
  hours: [{ days: ['mo'], open: '13:00', close: '16:00' }],
});
const base = { name: 'Casa', url: 'https://casa.es', description: 'Restaurante', nav: [] };

test('teléfono en formato internacional', () => {
  assert.equal(intlPhone('663 20 06 15'), '+34663200615');
  assert.equal(intlPhone('+33 1 23 45 67 89'), '+33123456789');
});

test('un local: sin marca aparte y con la carta común', () => {
  const site = load(Site, { ...base, locations: [loc('centro', 'Oviedo')] }, 'test');
  const g = restaurantGraph(site, 'https://casa.es/carta/');
  assert.equal(g['@graph'].length, 1);
  const r = g['@graph'][0] as Record<string, unknown>;
  assert.equal(r.url, 'https://casa.es/');
  assert.equal(r.hasMenu, 'https://casa.es/carta/');
  assert.equal(r.telephone, '+34663200615');
});

test('varios locales: URL y carta propias, fotos, filtro y marca con logo', () => {
  const site = load(Site, { ...base, locations: [loc('a', 'Gijón', '/menu-a/'), loc('b', 'Oviedo', '/menu-b/')] }, 'test');
  const g = restaurantGraph(site, { images: ['/foto.jpg'], logo: '/logo.png', only: ['b'] });
  const [r, org] = g['@graph'] as Record<string, any>[];
  assert.equal(g['@graph'].length, 2);
  assert.equal(r.name, 'Casa Oviedo');
  assert.equal(r.url, 'https://casa.es/menu-b/');
  assert.equal(r.hasMenu, 'https://casa.es/menu-b/');
  assert.deepEqual(r.image, ['https://casa.es/foto.jpg']);
  assert.equal(r.brand['@id'], org['@id']);
  assert.equal(org.logo, 'https://casa.es/logo.png');
  assert.equal(org.sameAs, undefined);
});
