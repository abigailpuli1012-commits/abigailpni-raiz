// Recibe el aviso de Systeme cuando alguien deja su correo (un «lead»).
// Hace falta para poder calcular el coste por lead y la conversión de visita
// a correo. Igual que en venta.js, del correo solo se guarda una huella.

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

  const correo =
    ['email', 'contact.email', 'customer.email', 'data.email']
      .map((ruta) => leer(cuerpo, ruta))
      .find((v) => v) || null;

  await env.PANEL.prepare(
    `CREATE TABLE IF NOT EXISTS leads (
       contacto TEXT PRIMARY KEY, recibida TEXT NOT NULL, dia TEXT NOT NULL,
       origen TEXT, bruto TEXT)`
  ).run();

  const ahora = new Date();
  await env.PANEL.prepare(
    `INSERT INTO leads (recibida, dia, contacto, origen, bruto) VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(contacto) DO NOTHING`
  )
    .bind(ahora.toISOString(), ahora.toISOString().slice(0, 10), await huella(correo),
          url.searchParams.get('origen'), texto.slice(0, 8000))
    .run();

  return new Response('ok');
}

export const onRequestPost = ({ request, env }) => guardar(request, env);
export const onRequestGet = ({ request, env }) => guardar(request, env);
