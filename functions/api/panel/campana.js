// Las campañas de pago (YouTube / Google Ads de momento) las apunta Abby a
// mano una vez al mes, con los tres números que da Google en su primera
// pantalla: lo gastado, las veces que se mostró el anuncio y los clics.
//
// De ahí salen el coste por mil impresiones, el coste por clic y el CTR del
// anuncio, que no se pueden saber de ninguna otra forma desde aquí.

const CORS = { 'cache-control': 'no-store' };

async function tabla(env) {
  await env.PANEL.prepare(
    `CREATE TABLE IF NOT EXISTS campanas (
       id INTEGER PRIMARY KEY AUTOINCREMENT,
       mes TEXT NOT NULL,
       nombre TEXT,
       gasto REAL NOT NULL DEFAULT 0,
       impresiones INTEGER NOT NULL DEFAULT 0,
       clics INTEGER NOT NULL DEFAULT 0)`
  ).run();
}

function mal(texto) {
  return new Response(JSON.stringify({ error: texto }), {
    status: 400,
    headers: { 'content-type': 'application/json', ...CORS },
  });
}

export async function onRequestGet({ env }) {
  await tabla(env);
  const { results } = await env.PANEL.prepare(
    'SELECT id, mes, nombre, gasto, impresiones, clics FROM campanas ORDER BY mes DESC, id DESC LIMIT 60'
  ).all();
  return Response.json(results, { headers: CORS });
}

export async function onRequestPost({ request, env }) {
  await tabla(env);

  let c;
  try {
    c = await request.json();
  } catch {
    return mal('No he entendido los datos.');
  }

  const mes = String(c.mes || '');
  const nombre = String(c.nombre || '').trim().slice(0, 80);
  const gasto = Number(c.gasto);
  const impresiones = Math.round(Number(c.impresiones) || 0);
  const clics = Math.round(Number(c.clics) || 0);

  if (!/^\d{4}-\d{2}$/.test(mes)) return mal('El mes tiene que ser del tipo 2026-10.');
  if (!nombre) return mal('Falta el nombre de la campaña.');
  if (!Number.isFinite(gasto) || gasto < 0) return mal('El gasto no es válido.');
  if (impresiones < 0 || clics < 0) return mal('Las impresiones y los clics no pueden ser negativos.');

  await env.PANEL.prepare(
    'INSERT INTO campanas (mes, nombre, gasto, impresiones, clics) VALUES (?, ?, ?, ?, ?)'
  )
    .bind(mes, nombre, gasto, impresiones, clics)
    .run();

  return Response.json({ ok: true }, { headers: CORS });
}

export async function onRequestDelete({ request, env }) {
  await tabla(env);
  const id = Number(new URL(request.url).searchParams.get('id'));
  if (!Number.isInteger(id)) return mal('Falta el identificador.');
  await env.PANEL.prepare('DELETE FROM campanas WHERE id = ?').bind(id).run();
  return Response.json({ ok: true }, { headers: CORS });
}
