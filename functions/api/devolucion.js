// Recibe el aviso de Systeme cuando se devuelve una compra o se cancela una
// suscripción. Sin esto, un reembolso seguiría contando como ingreso y las
// cifras del panel mentirían.
//
// La regla de Systeme («Venta cancelada» → «Enviar webhook») apunta a
// https://abigailpni.com/api/devolucion?k=<WEBHOOK_TOKEN>

async function huella(correo) {
  if (!correo) return null;
  const datos = new TextEncoder().encode(String(correo).trim().toLowerCase());
  const resumen = await crypto.subtle.digest('SHA-256', datos);
  return [...new Uint8Array(resumen)].slice(0, 8).map((b) => b.toString(16).padStart(2, '0')).join('');
}

function leer(objeto, ruta) {
  return ruta.split('.').reduce((o, k) => (o == null ? undefined : o[k]), objeto);
}

async function guardar(request, env) {
  const url = new URL(request.url);
  if (!env.WEBHOOK_TOKEN || url.searchParams.get('k') !== env.WEBHOOK_TOKEN) {
    return new Response('no autorizado', { status: 403 });
  }

  const texto = await request.text();
  let cuerpo = {};
  try {
    cuerpo = JSON.parse(texto);
  } catch {
    try { cuerpo = Object.fromEntries(new URLSearchParams(texto)); } catch { cuerpo = {}; }
  }

  const correo = ['email', 'contact.email', 'customer.email', 'data.email']
    .map((r) => leer(cuerpo, r)).find((v) => v) || null;

  await env.PANEL.prepare(
    `CREATE TABLE IF NOT EXISTS devoluciones (
       id INTEGER PRIMARY KEY AUTOINCREMENT, recibida TEXT NOT NULL, dia TEXT NOT NULL,
       contacto TEXT, bruto TEXT)`
  ).run();

  const ahora = new Date();
  await env.PANEL.prepare(
    'INSERT INTO devoluciones (recibida, dia, contacto, bruto) VALUES (?, ?, ?, ?)'
  )
    .bind(ahora.toISOString(), ahora.toISOString().slice(0, 10), await huella(correo), texto.slice(0, 8000))
    .run();

  return new Response('ok');
}

export const onRequestPost = ({ request, env }) => guardar(request, env);
export const onRequestGet = ({ request, env }) => guardar(request, env);
