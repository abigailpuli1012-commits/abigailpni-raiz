// Guarda la respuesta a «¿Cómo me conociste?» que se contesta en la página de
// pago de Systeme.
//
// La página de pago está en otro dominio (www.abigailpni.com, de Systeme), así
// que el guion que hay allí nos manda solo dos cosas: la respuesta elegida y
// una huella del correo. La huella se calcula igual que en venta.js, así que
// después se puede emparejar cada respuesta con su venta sin que el correo
// salga nunca de Systeme.

const RESPUESTAS = ['youtube', 'busqueda', 'recomendacion', 'instagram', 'otro'];

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'POST, OPTIONS',
  'access-control-allow-headers': 'content-type',
};

// Solo se admite desde la página de pago de Systeme o desde la web de Abby.
const CASA = /^https?:\/\/((www|test)\.)?abigailpni\.com(\/|$)/;

function deCasa(request) {
  const procede = request.headers.get('origin') || request.headers.get('referer') || '';
  return CASA.test(procede);
}

export async function onRequestPost({ request, env }) {
  if (!deCasa(request)) return new Response('no', { status: 403, headers: CORS });

  let cuerpo = {};
  try {
    cuerpo = await request.json();
  } catch {
    return new Response('mal', { status: 400, headers: CORS });
  }

  const huella = String(cuerpo.h || '').toLowerCase();
  const respuesta = String(cuerpo.v || '').toLowerCase();

  if (!/^[0-9a-f]{16}$/.test(huella) || !RESPUESTAS.includes(respuesta)) {
    return new Response('mal', { status: 400, headers: CORS });
  }

  // Una respuesta por persona y nada más: el ON CONFLICT ya lo garantiza, pero
  // además se limita cuántas distintas pueden entrar en un día.
  const hoy = new Date().toISOString().slice(0, 10);
  const cuantas = await env.PANEL.prepare('SELECT COUNT(*) AS n FROM origenes WHERE dia = ?').bind(hoy).first();
  if (cuantas && cuantas.n >= 200) return new Response(null, { status: 204, headers: CORS });

  const ahora = new Date();
  await env.PANEL.prepare(
    `INSERT INTO origenes (huella, recibida, dia, respuesta) VALUES (?, ?, ?, ?)
     ON CONFLICT(huella) DO UPDATE SET respuesta = excluded.respuesta, recibida = excluded.recibida`
  )
    .bind(huella, ahora.toISOString(), ahora.toISOString().slice(0, 10), respuesta)
    .run();

  return new Response(null, { status: 204, headers: CORS });
}

export const onRequestOptions = () => new Response(null, { status: 204, headers: CORS });
