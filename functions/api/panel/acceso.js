// Crear la contraseña la primera vez, entrar, y salir.
import { hayClave, crearClave, comprobarClave, nuevaGalleta, galletaFuera } from '../../_sesion.js';

const JSON_ = { 'content-type': 'application/json', 'cache-control': 'no-store' };

// Mientras la contraseña no esté creada, cualquiera que diera con la dirección
// podría adelantarse y crearla él. Por eso solo estos correos pueden crearla.
const CORREOS = ['abigailpuli1012@gmail.com', 'abigail@abigailpni.com'];

// Cuántos intentos fallidos seguidos se permiten antes de hacer esperar.
const espera = new Map();

function tardanza(ip) {
  const n = espera.get(ip) || 0;
  return Math.min(n * 400, 4000);
}

export async function onRequestGet({ env }) {
  return new Response(JSON.stringify({ configurado: await hayClave(env.PANEL) }), { headers: JSON_ });
}

export async function onRequestPost(contexto) {
  try {
    return await atender(contexto);
  } catch (e) {
    // Si algo revienta, que al menos se vea el motivo en vez de un 500 mudo.
    return new Response(JSON.stringify({ error: 'Ha fallado el servidor: ' + e.message }), { status: 500, headers: JSON_ });
  }
}

async function atender({ request, env }) {
  let c;
  try {
    c = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: 'No he entendido los datos.' }), { status: 400, headers: JSON_ });
  }

  const db = env.PANEL;
  const ip = request.headers.get('cf-connecting-ip') || 'x';

  if (c.accion === 'salir') {
    return new Response(JSON.stringify({ ok: true }), { headers: { ...JSON_, 'set-cookie': galletaFuera } });
  }

  const correo = String(c.correo || '').trim();
  const clave = String(c.clave || '');

  if (c.accion === 'crear') {
    if (!CORREOS.includes(correo.toLowerCase())) {
      return new Response(JSON.stringify({ error: 'Ese correo no puede crear el acceso.' }), { status: 403, headers: JSON_ });
    }
    if (clave.length < 8) {
      return new Response(JSON.stringify({ error: 'La contraseña tiene que tener al menos 8 caracteres.' }), { status: 400, headers: JSON_ });
    }
    if (!(await crearClave(db, correo, clave))) {
      return new Response(JSON.stringify({ error: 'La contraseña ya estaba creada.' }), { status: 409, headers: JSON_ });
    }
    const galleta = await nuevaGalleta(db);
    return new Response(JSON.stringify({ ok: true }), { headers: { ...JSON_, 'set-cookie': galleta } });
  }

  // Entrar.
  await new Promise((r) => setTimeout(r, tardanza(ip)));

  if (!(await comprobarClave(db, correo, clave))) {
    espera.set(ip, (espera.get(ip) || 0) + 1);
    return new Response(JSON.stringify({ error: 'El correo o la contraseña no son correctos.' }), { status: 401, headers: JSON_ });
  }

  espera.delete(ip);
  const galleta = await nuevaGalleta(db);
  return new Response(JSON.stringify({ ok: true }), { headers: { ...JSON_, 'set-cookie': galleta } });
}
