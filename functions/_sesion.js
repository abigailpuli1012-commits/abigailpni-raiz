// Acceso al panel con correo y contraseña propia.
//
// La contraseña NO se guarda: se guarda un resumen (PBKDF2, 150.000 vueltas)
// con una sal aleatoria. Ni yo ni nadie con acceso a la base de datos puede
// leerla; solo se puede comprobar si la que escribes coincide.
//
// La sesión es una galleta firmada (HMAC) que caduca a los 30 días. Va marcada
// HttpOnly y Secure, así que ningún guion de la página puede leerla.

const DIAS = 30;
// Cloudflare no admite más de 100.000 vueltas de PBKDF2: por encima, revienta.
const VUELTAS = 100000;

export async function tabla(db) {
  await db.prepare(
    `CREATE TABLE IF NOT EXISTS acceso (
       id INTEGER PRIMARY KEY CHECK (id = 1),
       correo TEXT, sal TEXT, resumen TEXT, secreto TEXT, creada TEXT)`
  ).run();
  // «codigo» se añadió después, para poder recuperar la contraseña.
  try {
    await db.prepare('ALTER TABLE acceso ADD COLUMN codigo TEXT').run();
  } catch {
    /* ya existía */
  }
}

export async function hayClave(db) {
  await tabla(db);
  const r = await db.prepare('SELECT resumen FROM acceso WHERE id = 1').first();
  return !!(r && r.resumen);
}

const aHex = (b) => [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, '0')).join('');

async function resumir(clave, salHex) {
  const sal = new Uint8Array(salHex.match(/../g).map((h) => parseInt(h, 16)));
  const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(clave), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: sal, iterations: VUELTAS, hash: 'SHA-256' },
    base,
    256
  );
  return aHex(bits);
}

// Comparación en tiempo constante: no delata cuánto se ha acertado.
function igual(a, b) {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

// Código de recuperación: lo único que permite poner una contraseña nueva si
// se te olvida. Se enseña una sola vez, al crear la contraseña, y de él se
// guarda solo un resumen, igual que de la contraseña.
function nuevoCodigo() {
  const letras = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // sin I, O, 0 ni 1
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  const c = [...bytes].map((b) => letras[b % letras.length]).join('');
  return `${c.slice(0, 4)}-${c.slice(4, 8)}-${c.slice(8, 12)}-${c.slice(12, 16)}`;
}

export async function crearClave(db, correo, clave) {
  await tabla(db);
  if (await hayClave(db)) return null;

  const sal = aHex(crypto.getRandomValues(new Uint8Array(16)));
  const secreto = aHex(crypto.getRandomValues(new Uint8Array(32)));
  const codigo = nuevoCodigo();

  await db.prepare(
    'INSERT OR REPLACE INTO acceso (id, correo, sal, resumen, secreto, creada, codigo) VALUES (1, ?, ?, ?, ?, ?, ?)'
  )
    .bind(
      String(correo || '').trim().toLowerCase(), sal,
      await resumir(clave, sal), secreto, new Date().toISOString(),
      await resumir(codigo, sal)
    )
    .run();

  return codigo;
}

// El correo no se comprueba: la contraseña es lo que manda. Comprobarlo solo
// servía para dejarla fuera por una mayúscula o un espacio de más.
export async function comprobarClave(db, clave) {
  await tabla(db);
  const r = await db.prepare('SELECT sal, resumen FROM acceso WHERE id = 1').first();
  if (!r || !r.resumen) return false;
  return igual(await resumir(clave, r.sal), r.resumen);
}

// Cambiar la contraseña con el código de recuperación.
export async function recuperar(db, codigo, claveNueva) {
  await tabla(db);
  const r = await db.prepare('SELECT sal, codigo FROM acceso WHERE id = 1').first();
  if (!r || !r.codigo) return false;

  const limpio = String(codigo || '').trim().toUpperCase().replace(/\s/g, '');
  if (!igual(await resumir(limpio, r.sal), r.codigo)) return false;

  // Contraseña nueva, sal nueva y código nuevo: el viejo deja de valer.
  const sal = aHex(crypto.getRandomValues(new Uint8Array(16)));
  const nuevo = nuevoCodigo();
  await db.prepare('UPDATE acceso SET sal = ?, resumen = ?, codigo = ? WHERE id = 1')
    .bind(sal, await resumir(claveNueva, sal), await resumir(nuevo, sal))
    .run();

  return nuevo;
}

async function clavePara(db) {
  const r = await db.prepare('SELECT secreto FROM acceso WHERE id = 1').first();
  if (!r || !r.secreto) return null;
  return crypto.subtle.importKey(
    'raw', new TextEncoder().encode(r.secreto),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  );
}

export async function nuevaGalleta(db) {
  const k = await clavePara(db);
  if (!k) return null;
  const caduca = Date.now() + DIAS * 86400000;
  const firma = aHex(await crypto.subtle.sign('HMAC', k, new TextEncoder().encode(String(caduca))));
  return `panel=${caduca}.${firma}; Path=/; Max-Age=${DIAS * 86400}; HttpOnly; Secure; SameSite=Lax`;
}

export async function sesionValida(request, db) {
  const galletas = request.headers.get('cookie') || '';
  const m = galletas.match(/(?:^|;\s*)panel=(\d+)\.([0-9a-f]+)/);
  if (!m) return false;

  const [, caduca, firma] = m;
  if (Number(caduca) < Date.now()) return false;

  await tabla(db);
  const k = await clavePara(db);
  if (!k) return false;

  const esperada = aHex(await crypto.subtle.sign('HMAC', k, new TextEncoder().encode(caduca)));
  return igual(firma, esperada);
}

export const galletaFuera = 'panel=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax';
