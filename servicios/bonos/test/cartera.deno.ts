// Pruebas de la Cartera (Apple y Google). Usan Deno porque el módulo importa paquetes npm: como en Supabase.
//   deno test --allow-env --allow-read --allow-write --allow-run --node-modules-dir=none test/cartera.deno.ts
// Crea una CA y un certificado falsos con openssl, firma un .pkpass y comprueba la firma y el manifest.
import { assert, assertEquals } from 'jsr:@std/assert@1';
import { unzipSync } from 'npm:fflate@0.8.2';
import { credencialesApple, finDelDia, jwtRs256, montarPkpass, objetosGoogle, passJson, firmarManifest } from '../supabase/functions/_shared/cartera.ts';

Deno.env.set('SUPABASE_URL', 'https://ejemplo.supabase.co');
const c = { id: 'la-vaca-asustada', nombre: 'La Vaca Asustada', web: 'https://lavacaasustada.com/', locales: ['Gijón', 'Oviedo'] };
const b = { codigo: 'VACA-432Q-PB7X', importe_cent: 10000, saldo_cent: 3550, caduca: '2027-07-31', destinatario_nombre: 'Marta', titular_nombre: 'Leo', mensaje: 'Feliz cumple' };

async function sh(...args: string[]) {
  const r = await new Deno.Command(args[0], { args: args.slice(1), stdout: 'piped', stderr: 'piped' }).output();
  return { ok: r.success, out: new TextDecoder().decode(r.stdout) + new TextDecoder().decode(r.stderr) };
}

Deno.test('fin del día en hora de España (verano e invierno)', () => {
  assertEquals(finDelDia('2027-07-31'), '2027-07-31T23:59:59+02:00');
  assertEquals(finDelDia('2027-01-15'), '2027-01-15T23:59:59+01:00');
});

Deno.test('pass.json con saldo, caducidad y QR a la ficha del panel', () => {
  const p = passJson(c, b, { passTypeIdentifier: 'pass.test', teamIdentifier: 'ABCDE12345' });
  assertEquals(p.serialNumber, 'VACA-432Q-PB7X');
  assertEquals(p.storeCard.headerFields[0].value, 35.5);
  assertEquals(p.storeCard.headerFields[0].label, 'Saldo');
  assertEquals(p.storeCard.primaryFields.length, 0);
  assertEquals(p.barcodes[0].message, 'https://lavacaasustada.com/gestion/#/bono/VACA-432Q-PB7X');
  assertEquals(p.expirationDate, '2027-07-31T23:59:59+02:00');
});

Deno.test('el .pkpass lleva manifest correcto y una firma PKCS#7 válida', async () => {
  const dir = await Deno.makeTempDir();
  const o = (...a: string[]) => sh('openssl', ...a);
  assert((await o('req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', `${dir}/ca.key`, '-out', `${dir}/ca.pem`, '-days', '2', '-subj', '/CN=CA de prueba')).ok);
  assert((await o('req', '-newkey', 'rsa:2048', '-nodes', '-keyout', `${dir}/p.key`, '-out', `${dir}/p.csr`, '-subj', '/CN=pass.test')).ok);
  assert((await o('x509', '-req', '-in', `${dir}/p.csr`, '-CA', `${dir}/ca.pem`, '-CAkey', `${dir}/ca.key`, '-CAcreateserial', '-out', `${dir}/p.pem`, '-days', '2')).ok);
  // Los secretos van en base64: el certificado en DER (.cer, como lo da Apple), la clave en PEM y la CA en PEM.
  assert((await o('x509', '-in', `${dir}/p.pem`, '-outform', 'DER', '-out', `${dir}/p.cer`)).ok);
  const b64 = async (f: string) => btoa(String.fromCharCode(...await Deno.readFile(`${dir}/${f}`)));
  Deno.env.set('APPLE_PASS_CERT', await b64('p.cer'));
  Deno.env.set('APPLE_PASS_KEY', await b64('p.key'));
  Deno.env.set('APPLE_WWDR_CERT', await b64('ca.pem'));
  const { cert, clave, wwdr: ca } = credencialesApple();
  const img = new Uint8Array([137, 80, 78, 71, 1, 2, 3]);
  const zip = await montarPkpass(passJson(c, b, { passTypeIdentifier: 'pass.test', teamIdentifier: 'T' }),
    { 'icon.png': img, 'logo.png': img }, (m) => firmarManifest(m, cert, clave, ca));
  const archivos = unzipSync(zip);
  assertEquals(Object.keys(archivos).sort(), ['icon.png', 'logo.png', 'manifest.json', 'pass.json', 'signature']);
  const manifest = JSON.parse(new TextDecoder().decode(archivos['manifest.json']));
  for (const n of ['pass.json', 'icon.png', 'logo.png']) {
    const h = new Uint8Array(await crypto.subtle.digest('SHA-1', archivos[n] as Uint8Array<ArrayBuffer>));
    assertEquals(manifest[n], Array.from(h, (x) => x.toString(16).padStart(2, '0')).join(''));
  }
  await Deno.writeFile(`${dir}/manifest.json`, archivos['manifest.json']);
  await Deno.writeFile(`${dir}/signature`, archivos['signature']);
  const v = await o('smime', '-verify', '-binary', '-inform', 'DER', '-in', `${dir}/signature`, '-content', `${dir}/manifest.json`, '-CAfile', `${dir}/ca.pem`, '-purpose', 'any', '-out', '/dev/null');
  assert(v.ok, v.out);
  const certs = await o('pkcs7', '-inform', 'DER', '-in', `${dir}/signature`, '-print_certs', '-noout');
  assert(certs.out.includes('CA de prueba') && certs.out.includes('pass.test'), certs.out);
});

Deno.test('Google: objeto con saldo en micros, QR y caducidad; JWT RS256 verificable', async () => {
  const { clase, objeto } = objetosGoogle(c, b, '3388000000012345678');
  assertEquals(clase.id, '3388000000012345678.bono_la-vaca-asustada');
  assertEquals(objeto.id, '3388000000012345678.bono_VACA-432Q-PB7X');
  assertEquals(objeto.header.defaultValue.value, '35,50\u00a0€');
  assertEquals(objeto.subheader.defaultValue.value, 'Saldo del bono regalo');
  assertEquals(objeto.heroImage.sourceUri.uri, 'https://ejemplo.supabase.co/functions/v1/bonos-api/imagen?c=VACA-432Q-PB7X&i=3550&f=banda');
  assertEquals(objeto.logo.sourceUri.uri, 'https://lavacaasustada.com/bonos-regalo/cartera/logo-google.png');
  // El frente muestra Válido hasta | Dónde y Código | Para, que existen siempre en el objeto.
  const filas = clase.classTemplateInfo.cardTemplateOverride.cardRowTemplateInfos;
  const ids = filas.flatMap((f) => [f.twoItems.startItem, f.twoItems.endItem])
    .map((i) => i.firstValue.fields[0].fieldPath.match(/'(.+)'/)![1]);
  assertEquals(ids, ['caduca', 'donde', 'codigo', 'para']);
  for (const id of ids) assert(objeto.textModulesData.some((m) => m.id === id), id);
  const par = await crypto.subtle.generateKey({ name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['sign', 'verify']);
  const pkcs8 = new Uint8Array(await crypto.subtle.exportKey('pkcs8', par.privateKey));
  const pem = `-----BEGIN PRIVATE KEY-----\n${btoa(String.fromCharCode(...pkcs8))}\n-----END PRIVATE KEY-----\n`;
  const jwt = await jwtRs256({ aud: 'google', payload: { genericObjects: [{ id: objeto.id }] } }, pem);
  const [h, p, f] = jwt.split('.');
  const dec = (s: string) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), (ch) => ch.charCodeAt(0));
  assert(await crypto.subtle.verify('RSASSA-PKCS1-v1_5', par.publicKey, dec(f), new TextEncoder().encode(`${h}.${p}`)));
  assertEquals(JSON.parse(new TextDecoder().decode(dec(p))).payload.genericObjects[0].id, objeto.id);
});
