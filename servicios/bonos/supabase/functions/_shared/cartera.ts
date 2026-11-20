// El bono en la Cartera del móvil: Apple Wallet (archivo .pkpass firmado) y Google Wallet (enlace "Guardar").
// Se genera al pulsar el botón del correo, con el saldo de ese momento.
//
// Secretos de las funciones (ver README):
//   Apple:  APPLE_PASS_TYPE_ID, APPLE_TEAM_ID, APPLE_PASS_CERT, APPLE_PASS_KEY, APPLE_WWDR_CERT (los tres últimos en base64)
//   Google: GOOGLE_WALLET_EMISOR (Issuer ID), GOOGLE_WALLET_CUENTA (JSON de la cuenta de servicio, tal cual o en base64)
// Imágenes: cada web publica /bonos-regalo/cartera/{icon,icon@2x,icon@3x,logo,logo@2x,logo@3x,logo-google}.png
import forge from 'npm:node-forge@1.3.1';
import { zipSync } from 'npm:fflate@0.8.2';
import type { Bono, Comercio } from './db.ts';
import { euros } from './correo.ts';
import { fechaLarga, urlFicha } from './plantillas.ts';

type ComercioPase = Pick<Comercio, 'id' | 'nombre' | 'web' | 'locales'>;
type BonoPase = Pick<Bono, 'codigo' | 'importe_cent' | 'saldo_cent' | 'caduca' | 'destinatario_nombre' | 'titular_nombre' | 'mensaje'>;

const env = (k: string) => Deno.env.get(k)?.trim() || '';
const sinBarra = (web: string | null | undefined) => (web || '').replace(/\/+$/, '');

/** Hora de fin del último día de validez en España (con su horario de verano o invierno). */
export function finDelDia(iso: string) {
  const mediodia = new Date(`${iso}T12:00:00Z`);
  const enMadrid = new Date(mediodia.toLocaleString('en-US', { timeZone: 'Europe/Madrid' }));
  const enUtc = new Date(mediodia.toLocaleString('en-US', { timeZone: 'UTC' }));
  const h = Math.round((enMadrid.getTime() - enUtc.getTime()) / 3_600_000);
  return `${iso}T23:59:59+0${h}:00`;
}

/** Textos comunes a las dos carteras. */
export function textosPase(c: ComercioPase, b: BonoPase) {
  const locales = (c.locales ?? []).filter(Boolean);
  const donde = locales.length > 1 ? `${locales.slice(0, -1).join(', ')} y ${locales.at(-1)}` : locales[0] || c.nombre;
  return {
    parcial: b.saldo_cent < b.importe_cent,
    donde,
    comoUsar: `Úsalo en ${c.nombre} (${donde}). Al pedir la cuenta, enseña este bono: se escanea el QR o se teclea el código y se descuenta del total. ` +
      'Si no lo gastas entero, el saldo que quede sigue disponible hasta la fecha de caducidad.',
    nota: 'El saldo es el de cuando añadiste el bono a la Cartera. El restaurante siempre tiene el saldo al día.',
  };
}

// ───────────── Apple Wallet ─────────────
export const appleConfigurado = () =>
  !!(env('APPLE_PASS_TYPE_ID') && env('APPLE_TEAM_ID') && env('APPLE_PASS_CERT') && env('APPLE_PASS_KEY') && env('APPLE_WWDR_CERT'));

/** Un secreto en base64 que puede ser PEM (texto) o DER (binario). Devuelve la cadena binaria que usa forge. */
const binarioDeSecreto = (nombre: string) => atob(env(nombre).replace(/\s+/g, ''));
function certificado(nombre: string) {
  const bin = binarioDeSecreto(nombre);
  return bin.startsWith('-----BEGIN') ? forge.pki.certificateFromPem(bin) : forge.pki.certificateFromAsn1(forge.asn1.fromDer(bin));
}
function clavePrivada(nombre: string) {
  const bin = binarioDeSecreto(nombre);
  if (bin.startsWith('-----BEGIN')) return forge.pki.privateKeyFromPem(bin);
  return forge.pki.privateKeyFromAsn1(forge.asn1.fromDer(bin)); // PKCS#1 o PKCS#8 sin cifrar
}

/** Certificado del pase, su clave y el intermedio de Apple, leídos de los secretos. */
export const credencialesApple = () =>
  ({ cert: certificado('APPLE_PASS_CERT'), clave: clavePrivada('APPLE_PASS_KEY'), wwdr: certificado('APPLE_WWDR_CERT') });

/** Contenido de pass.json. */
export function passJson(c: ComercioPase, b: BonoPase, ids: { passTypeIdentifier: string; teamIdentifier: string }) {
  const t = textosPase(c, b);
  const web = sinBarra(c.web);
  const atras = [
    ...(b.mensaje ? [{ key: 'mensaje', label: 'Mensaje', value: `«${b.mensaje}»` }] : []),
    ...(b.titular_nombre ? [{ key: 'de', label: 'De parte de', value: b.titular_nombre }] : []),
    { key: 'uso', label: 'Cómo usarlo', value: t.comoUsar },
    ...(t.parcial ? [{ key: 'inicial', label: 'Importe inicial', value: euros(b.importe_cent) }] : []),
    { key: 'saldo-nota', label: 'Saldo', value: t.nota },
    ...(web ? [{ key: 'web', label: 'Web y reservas', value: web, attributedValue: `<a href="${web}/">${web.replace(/^https?:\/\//, '')}</a>` }] : []),
  ];
  return {
    formatVersion: 1,
    passTypeIdentifier: ids.passTypeIdentifier,
    teamIdentifier: ids.teamIdentifier,
    serialNumber: b.codigo,
    organizationName: c.nombre,
    description: `Bono regalo de ${c.nombre}`,
    logoText: c.nombre,
    backgroundColor: 'rgb(21, 22, 22)',
    foregroundColor: 'rgb(255, 255, 255)',
    labelColor: 'rgb(228, 197, 144)',
    expirationDate: finDelDia(b.caduca),
    sharingProhibited: false,
    barcodes: [{ format: 'PKBarcodeFormatQR', message: urlFicha(c.web, b.codigo), messageEncoding: 'iso-8859-1', altText: b.codigo }],
    storeCard: {
      headerFields: [{ key: 'tipo', label: 'BONO', value: 'Regalo' }],
      primaryFields: [{ key: 'saldo', label: t.parcial ? 'Saldo' : 'Bono regalo', value: b.saldo_cent / 100, currencyCode: 'EUR' }],
      secondaryFields: [
        ...(b.destinatario_nombre ? [{ key: 'para', label: 'Para', value: b.destinatario_nombre }] : []),
        { key: 'caduca', label: 'Válido hasta', value: fechaLarga(b.caduca) },
      ],
      auxiliaryFields: [
        { key: 'codigo', label: 'Código', value: b.codigo },
        { key: 'donde', label: 'Dónde', value: t.donde },
      ],
      backFields: atras,
    },
  };
}

const IMAGENES_APPLE = ['icon.png', 'icon@2x.png', 'icon@3x.png', 'logo.png', 'logo@2x.png', 'logo@3x.png'];

async function sha1(datos: Uint8Array) {
  const h = new Uint8Array(await crypto.subtle.digest('SHA-1', datos as Uint8Array<ArrayBuffer>));
  return Array.from(h, (x) => x.toString(16).padStart(2, '0')).join('');
}

/** Firma PKCS#7 separada del manifest, con el certificado del pase y el intermedio de Apple (WWDR). */
export function firmarManifest(manifest: Uint8Array, cert: forge.pki.Certificate, clave: forge.pki.PrivateKey, wwdr: forge.pki.Certificate) {
  const p7 = forge.pkcs7.createSignedData();
  p7.content = forge.util.createBuffer(String.fromCharCode(...manifest));
  p7.addCertificate(cert);
  p7.addCertificate(wwdr);
  p7.addSigner({
    key: clave, certificate: cert, digestAlgorithm: forge.pki.oids.sha256,
    authenticatedAttributes: [
      { type: forge.pki.oids.contentType, value: forge.pki.oids.data },
      { type: forge.pki.oids.messageDigest },
      { type: forge.pki.oids.signingTime, value: new Date() as unknown as string },
    ],
  });
  p7.sign({ detached: true });
  const der: string = forge.asn1.toDer(p7.toAsn1()).getBytes();
  return Uint8Array.from(der, (ch: string) => ch.charCodeAt(0));
}

/** Junta pass.json, las imágenes, el manifest y la firma en un .pkpass (un zip). */
export async function montarPkpass(pass: unknown, imagenes: Record<string, Uint8Array>,
  firma: (manifest: Uint8Array) => Uint8Array) {
  const archivos: Record<string, Uint8Array> = { 'pass.json': new TextEncoder().encode(JSON.stringify(pass)), ...imagenes };
  const manifest: Record<string, string> = {};
  for (const [nombre, datos] of Object.entries(archivos)) manifest[nombre] = await sha1(datos);
  const manifestBytes = new TextEncoder().encode(JSON.stringify(manifest));
  return zipSync({ ...archivos, 'manifest.json': manifestBytes, signature: firma(manifestBytes) }, { level: 6 });
}

async function descargar(url: string) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`No se pudo descargar ${url}: ${r.status}`);
  return new Uint8Array(await r.arrayBuffer());
}

export async function pkpass(c: ComercioPase, b: BonoPase) {
  const base = `${sinBarra(c.web)}/bonos-regalo/cartera`;
  const imagenes: Record<string, Uint8Array> = {};
  await Promise.all(IMAGENES_APPLE.map(async (n) => { imagenes[n] = await descargar(`${base}/${n}`); }));
  const pass = passJson(c, b, { passTypeIdentifier: env('APPLE_PASS_TYPE_ID'), teamIdentifier: env('APPLE_TEAM_ID') });
  const { cert, clave, wwdr } = credencialesApple();
  return montarPkpass(pass, imagenes, (m) => firmarManifest(m, cert, clave, wwdr));
}

// ───────────── Google Wallet ─────────────
export const googleConfigurado = () => !!(env('GOOGLE_WALLET_EMISOR') && env('GOOGLE_WALLET_CUENTA'));

interface CuentaServicio { client_email: string; private_key: string }
function cuentaGoogle(): CuentaServicio {
  const v = env('GOOGLE_WALLET_CUENTA');
  return JSON.parse(v.startsWith('{') ? v : atob(v.replace(/\s+/g, '')));
}

const b64url = (datos: Uint8Array | string) => {
  const bytes = typeof datos === 'string' ? new TextEncoder().encode(datos) : datos;
  let bin = ''; for (const x of bytes) bin += String.fromCharCode(x);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};

/** JWT firmado con RS256 con la clave de la cuenta de servicio. */
export async function jwtRs256(claims: Record<string, unknown>, clavePem: string) {
  const der = Uint8Array.from(atob(clavePem.replace(/-----[^-]+-----/g, '').replace(/\s+/g, '')), (ch) => ch.charCodeAt(0));
  const key = await crypto.subtle.importKey('pkcs8', der, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']);
  const cuerpo = `${b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))}.${b64url(JSON.stringify(claims))}`;
  const firma = new Uint8Array(await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(cuerpo)));
  return `${cuerpo}.${b64url(firma)}`;
}

const API_WALLET = 'https://walletobjects.googleapis.com/walletobjects/v1';
const idSeguro = (s: string) => s.replace(/[^\w.-]/g, '_');

/** Clase (una por restaurante) y objeto (uno por bono) de Google Wallet.
 *  Es un pase "genérico" porque deja colocar los datos en el frente como en Apple Wallet:
 *  BONO REGALO e importe arriba, Válido hasta y Dónde, Código y Para, y el QR. */
export function objetosGoogle(c: ComercioPase, b: BonoPase, emisor: string) {
  const t = textosPase(c, b);
  const web = sinBarra(c.web);
  const es = (value: string) => ({ defaultValue: { language: 'es', value } });
  const campo = (id: string) => ({ firstValue: { fields: [{ fieldPath: `object.textModulesData['${id}']` }] } });
  const classId = `${emisor}.bono_${idSeguro(c.id)}`;
  const clase = {
    id: classId,
    classTemplateInfo: {
      cardTemplateOverride: {
        cardRowTemplateInfos: [
          { twoItems: { startItem: campo('caduca'), endItem: campo('donde') } },
          { twoItems: { startItem: campo('codigo'), endItem: campo('para') } },
        ],
      },
    },
  };
  const objeto = {
    id: `${emisor}.bono_${idSeguro(b.codigo)}`,
    classId,
    state: 'ACTIVE',
    cardTitle: es(c.nombre),
    subheader: es(t.parcial ? 'Saldo del bono regalo' : 'Bono regalo'),
    header: es(euros(b.saldo_cent)),
    hexBackgroundColor: '#151616',
    logo: { sourceUri: { uri: `${web}/bonos-regalo/cartera/logo-google.png` }, contentDescription: es(c.nombre) },
    barcode: { type: 'QR_CODE', value: urlFicha(c.web, b.codigo), alternateText: b.codigo },
    validTimeInterval: { end: { date: finDelDia(b.caduca) } },
    textModulesData: [
      { id: 'caduca', header: 'Válido hasta', body: fechaLarga(b.caduca) },
      { id: 'donde', header: 'Dónde', body: t.donde },
      { id: 'codigo', header: 'Código', body: b.codigo },
      { id: 'para', header: 'Para', body: b.destinatario_nombre || '—' },
      ...(b.titular_nombre ? [{ id: 'de', header: 'De parte de', body: b.titular_nombre }] : []),
      ...(b.mensaje ? [{ id: 'mensaje', header: 'Mensaje', body: `«${b.mensaje}»` }] : []),
      ...(t.parcial ? [{ id: 'inicial', header: 'Importe inicial', body: euros(b.importe_cent) }] : []),
      { id: 'uso', header: 'Cómo usarlo', body: t.comoUsar },
      { id: 'saldo', header: 'Saldo', body: t.nota },
    ],
    ...(web ? { linksModuleData: { uris: [{ id: 'web', uri: `${web}/`, description: 'Web y reservas' }] } } : {}),
  };
  return { clase, objeto };
}

/** Crea o actualiza (si ya existe) un recurso de la API de Google Wallet. */
async function guardar(tipo: 'genericClass' | 'genericObject', recurso: { id: string }, token: string) {
  const h = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
  let r = await fetch(`${API_WALLET}/${tipo}`, { method: 'POST', headers: h, body: JSON.stringify(recurso) });
  if (r.status === 409) r = await fetch(`${API_WALLET}/${tipo}/${encodeURIComponent(recurso.id)}`, { method: 'PUT', headers: h, body: JSON.stringify(recurso) });
  if (!r.ok) throw new Error(`Google Wallet ${tipo} ${r.status}: ${await r.text()}`);
}

/** Enlace "Guardar en Google Wallet" para el bono (crea o actualiza su clase y su objeto). */
export async function enlaceGoogle(c: ComercioPase, b: BonoPase) {
  const cuenta = cuentaGoogle();
  const ahora = Math.floor(Date.now() / 1000);
  const asercion = await jwtRs256({
    iss: cuenta.client_email, scope: 'https://www.googleapis.com/auth/wallet_object.issuer',
    aud: 'https://oauth2.googleapis.com/token', iat: ahora, exp: ahora + 3600,
  }, cuenta.private_key);
  const rt = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: asercion }),
  });
  if (!rt.ok) throw new Error(`Google OAuth ${rt.status}: ${await rt.text()}`);
  const { access_token } = await rt.json();
  const { clase, objeto } = objetosGoogle(c, b, env('GOOGLE_WALLET_EMISOR'));
  await guardar('genericClass', clase, access_token);
  await guardar('genericObject', objeto, access_token);
  const jwt = await jwtRs256({
    iss: cuenta.client_email, aud: 'google', typ: 'savetowallet', iat: ahora, origins: [],
    payload: { genericObjects: [{ id: objeto.id }] },
  }, cuenta.private_key);
  return `https://pay.google.com/gp/v/save/${jwt}`;
}
