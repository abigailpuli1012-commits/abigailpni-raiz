// Los gastos los apunta Abby a mano desde el panel: publicidad, herramientas,
// lo que sea. Sin esto no se pueden calcular el coste por clienta, el ROAS ni
// el ROI, porque nadie más sabe lo que se ha gastado.

const CORS = { 'cache-control': 'no-store' };

// La columna «recurrente» se añadió después. Si ya existe, SQLite se queja y
// no pasa nada: se ignora.
async function alDia(env) {
  try {
    await env.PANEL.prepare('ALTER TABLE gastos ADD COLUMN recurrente INTEGER NOT NULL DEFAULT 0').run();
  } catch {
    /* la columna ya estaba */
  }
}

function mal(texto) {
  return new Response(JSON.stringify({ error: texto }), {
    status: 400,
    headers: { 'content-type': 'application/json', ...CORS },
  });
}

export async function onRequestGet({ env }) {
  await alDia(env);
  const { results } = await env.PANEL.prepare(
    'SELECT id, mes, concepto, importe, recurrente FROM gastos ORDER BY mes DESC, id DESC LIMIT 60'
  ).all();
  return Response.json(results, { headers: CORS });
}

export async function onRequestPost({ request, env }) {
  await alDia(env);
  let c;
  try {
    c = await request.json();
  } catch {
    return mal('No he entendido los datos.');
  }

  const mes = String(c.mes || '');
  const concepto = String(c.concepto || '').trim().slice(0, 80);
  const importe = Number(c.importe);

  if (!/^\d{4}-\d{2}$/.test(mes)) return mal('El mes tiene que ser del tipo 2026-10.');
  if (!concepto) return mal('Falta decir en qué se ha gastado.');
  if (!Number.isFinite(importe) || importe < 0) return mal('El importe no es válido.');

  await env.PANEL.prepare(
    'INSERT INTO gastos (mes, concepto, importe, recurrente) VALUES (?, ?, ?, ?)'
  )
    .bind(mes, concepto, importe, c.recurrente ? 1 : 0)
    .run();

  return Response.json({ ok: true }, { headers: CORS });
}

export async function onRequestDelete({ request, env }) {
  const id = Number(new URL(request.url).searchParams.get('id'));
  if (!Number.isInteger(id)) return mal('Falta el identificador.');
  await env.PANEL.prepare('DELETE FROM gastos WHERE id = ?').bind(id).run();
  return Response.json({ ok: true }, { headers: CORS });
}
