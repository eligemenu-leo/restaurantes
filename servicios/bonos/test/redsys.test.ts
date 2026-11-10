import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createCipheriv, createHmac, randomBytes } from 'node:crypto';
import { tripleDesCbc } from '../supabase/functions/_shared/des.ts';
import {
  firmar, verificarNotificacion, encodeParams, decodeParams, pagoAutorizado, numeroPedido, codigoBono, b64decode,
} from '../supabase/functions/_shared/redsys.ts';

// Clave pública del comercio de pruebas de Redsys (999008881), publicada en su documentación.
const CLAVE_PRUEBAS = 'sq7HjrUOBfKmC576ILgskD5srU870gJ7';

function opensslTripleDes(key: Buffer, data: Buffer): Buffer {
  const c = createCipheriv('des-ede3-cbc', key, Buffer.alloc(8));
  c.setAutoPadding(false);
  return Buffer.concat([c.update(data), c.final()]);
}

/** Firma calculada solo con OpenSSL, como referencia independiente. */
function firmaReferencia(claveB64: string, pedido: string, paramsB64: string): string {
  const ped = Buffer.from(pedido);
  const padded = Buffer.concat([ped, Buffer.alloc((8 - (ped.length % 8)) % 8)]);
  const derivada = opensslTripleDes(Buffer.from(claveB64, 'base64'), padded);
  return createHmac('sha256', derivada).update(paramsB64).digest('base64');
}

test('3DES coincide con OpenSSL', () => {
  for (let i = 0; i < 50; i++) {
    const key = randomBytes(24);
    const data = randomBytes(8 * (1 + (i % 3)));
    assert.deepEqual(Buffer.from(tripleDesCbc(key, data)), opensslTripleDes(key, data));
  }
});

test('la firma coincide con la referencia de OpenSSL', async () => {
  for (const pedido of ['2611ABCDEFGH', '1234', '261100000001', '2611X']) {
    const params = encodeParams({ DS_MERCHANT_AMOUNT: '5000', DS_MERCHANT_ORDER: pedido, DS_MERCHANT_MERCHANTCODE: '999008881' });
    assert.equal(await firmar(CLAVE_PRUEBAS, pedido, params), firmaReferencia(CLAVE_PRUEBAS, pedido, params));
  }
});

test('verifica una notificación con firma url-safe y rechaza una manipulada', async () => {
  const paramsB64 = encodeParams({ Ds_Order: '2611ABCDEFGH', Ds_Amount: '5000', Ds_Response: '0000', Ds_Date: '09%2F11%2F2026' });
  const firma = firmaReferencia(CLAVE_PRUEBAS, '2611ABCDEFGH', paramsB64).replace(/\+/g, '-').replace(/\//g, '_');
  const ok = await verificarNotificacion(CLAVE_PRUEBAS, paramsB64, firma);
  assert.equal(ok?.Ds_Amount, '5000');
  assert.equal(ok?.Ds_Date, '09/11/2026');
  const otra = encodeParams({ Ds_Order: '2611ABCDEFGH', Ds_Amount: '1', Ds_Response: '0000' });
  assert.equal(await verificarNotificacion(CLAVE_PRUEBAS, otra, firma), null);
  assert.equal(await verificarNotificacion(CLAVE_PRUEBAS, paramsB64, 'AAAA'), null);
});

test('decodifica base64 url-safe sin relleno', () => {
  assert.deepEqual(decodeParams(encodeParams({ a: 'ñ' }).replace(/=+$/, '')), { a: 'ñ' });
  assert.equal(b64decode('-_8').length, 2);
});

test('Ds_Response: 0000–0099 autorizado, el resto no', () => {
  for (const r of ['0000', '0099', '0', '42']) assert.ok(pagoAutorizado(r), r);
  for (const r of ['0100', '9915', '0190', '', undefined, 'abc', '-1']) assert.ok(!pagoAutorizado(r), String(r));
});

test('número de pedido y código de bono con el formato esperado', () => {
  const n = numeroPedido(new Date('2026-11-09T10:00:00Z'));
  assert.match(n, /^2611[0-9A-Z]{8}$/);
  assert.match(codigoBono('VACA'), /^VACA-[2-9A-HJKMNP-TV-Z]{4}-[2-9A-HJKMNP-TV-Z]{4}$/);
});

import { caducidad, enVenta } from '../supabase/functions/_shared/fechas.ts';

test('caducidad: meses desde la compra, fecha fija o 12 meses por defecto', () => {
  assert.equal(caducidad({ validez_meses: 12, caduca_fija: null }, '2026-11-09'), '2027-11-09');
  assert.equal(caducidad({ validez_meses: 1, caduca_fija: null }, '2027-01-31'), '2027-02-28');
  assert.equal(caducidad({ validez_meses: null, caduca_fija: '2027-01-31' }, '2026-12-05'), '2027-01-31');
  assert.equal(caducidad(null, '2026-11-09'), '2027-11-09');
});

test('enVenta respeta activo y el periodo de venta', () => {
  const t = { activo: true, venta_desde: '2026-12-01', venta_hasta: '2026-12-31' } as Parameters<typeof enVenta>[0];
  assert.ok(!enVenta(t, '2026-11-30'));
  assert.ok(enVenta(t, '2026-12-01'));
  assert.ok(enVenta(t, '2026-12-31'));
  assert.ok(!enVenta(t, '2027-01-01'));
  assert.ok(!enVenta({ ...t, activo: false }, '2026-12-10'));
  assert.ok(enVenta({ ...t, venta_desde: null, venta_hasta: null }, '2030-01-01'));
});
