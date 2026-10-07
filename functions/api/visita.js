// Cuenta una visita. No guarda cookies, ni IP, ni nada de la persona:
// solo suma uno al contador del día para esa página y esa marca de vídeo.
//
// Se llama desde las páginas con:
//   /api/visita?s=<sitio>&r=<ruta>&v=<marca>
//
// Es una dirección pública (tiene que serlo: la llama el navegador de quien
// visita), así que lleva tres cerrojos para que nadie pueda inflar las cifras:
//   1. Solo cuenta si la llamada viene de una página de Abby.
//   2. Un tope de visitas por IP y minuto.
//   3. Un tope de combinaciones nuevas al día, para que nadie hinche la tabla.

const SITIOS = ['web', 'test'];
const BOTS = /bot|crawl|spider|slurp|preview|monitor|headless|lighthouse|curl|wget|python-requests/i;

const CASA = /^https?:\/\/((www|test)\.)?abigailpni\.com(\/|$)/;

const POR_MINUTO = 40;      // visitas que admite una misma IP en un minuto
const FILAS_POR_DIA = 300;  // combinaciones distintas de página y marca al día

function limpiar(valor, max) {
  if (!valor) return '';
  return String(valor).slice(0, max).replace(/[^\w\/.\-]/g, '');
}

function deCasa(request) {
  const procede = request.headers.get('origin') || request.headers.get('referer') || '';
  return CASA.test(procede);
}

// El tope por IP vive en la propia base, en una tabla que se limpia sola.
async function demasiadas(db, ip) {
  const minuto = new Date().toISOString().slice(0, 16); // «2026-10-07T12:34»
  await db.prepare(
    `CREATE TABLE IF NOT EXISTS pulsos (
       clave TEXT PRIMARY KEY, minuto TEXT NOT NULL, veces INTEGER NOT NULL DEFAULT 0)`
  ).run();

  const r = await db.prepare(
    `INSERT INTO pulsos (clave, minuto, veces) VALUES (?, ?, 1)
     ON CONFLICT(clave) DO UPDATE SET
       veces = CASE WHEN pulsos.minuto = excluded.minuto THEN pulsos.veces + 1 ELSE 1 END,
       minuto = excluded.minuto
     RETURNING veces`
  ).bind(ip, minuto).first();

  return !!r && r.veces > POR_MINUTO;
}

async function contar(request, env) {
  const url = new URL(request.url);
  const nada = new Response(null, {
    status: 204,
    headers: { 'access-control-allow-origin': '*', 'cache-control': 'no-store' },
  });

  if (BOTS.test(request.headers.get('user-agent') || '')) return nada;
  if (!deCasa(request)) return nada;

  const db = env.PANEL;
  const ip = request.headers.get('cf-connecting-ip') || 'desconocida';
  if (await demasiadas(db, ip)) return nada;

  const sitio = SITIOS.includes(url.searchParams.get('s')) ? url.searchParams.get('s') : 'web';
  const ruta = limpiar(url.searchParams.get('r'), 120) || '/';
  const marca = limpiar(url.searchParams.get('v'), 32);
  const dia = new Date().toISOString().slice(0, 10);

  // Si la combinación es nueva y hoy ya hay demasiadas, no se admite: así nadie
  // puede llenar la tabla inventándose páginas o marcas.
  const existe = await db.prepare(
    'SELECT 1 FROM trafico WHERE dia = ? AND sitio = ? AND ruta = ? AND marca = ?'
  ).bind(dia, sitio, ruta, marca).first();

  if (!existe) {
    const cuantas = await db.prepare('SELECT COUNT(*) AS n FROM trafico WHERE dia = ?').bind(dia).first();
    if (cuantas && cuantas.n >= FILAS_POR_DIA) return nada;
  }

  await db.prepare(
    `INSERT INTO trafico (dia, sitio, ruta, marca, visitas) VALUES (?, ?, ?, ?, 1)
     ON CONFLICT(dia, sitio, ruta, marca) DO UPDATE SET visitas = visitas + 1`
  ).bind(dia, sitio, ruta, marca).run();

  return nada;
}

export const onRequestGet = ({ request, env }) => contar(request, env);
export const onRequestPost = ({ request, env }) => contar(request, env);

export const onRequestOptions = () =>
  new Response(null, {
    status: 204,
    headers: {
      'access-control-allow-origin': '*',
      'access-control-allow-methods': 'GET, POST, OPTIONS',
    },
  });
