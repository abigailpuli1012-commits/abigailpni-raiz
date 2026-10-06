// Cuenta una visita. No guarda cookies, ni IP, ni nada de la persona:
// solo suma uno al contador del día para esa página y esa marca de vídeo.
//
// Se llama desde las páginas con:
//   /api/visita?s=<sitio>&r=<ruta>&v=<marca>
// donde <marca> es el valor de ?v= del enlace que trajo a la visitante
// (un enlace distinto por vídeo: abigailpni.com/guia?v=sibo).

const SITIOS = ['web', 'test'];
const BOTS = /bot|crawl|spider|slurp|preview|monitor|headless|lighthouse|curl|wget|python-requests/i;

function limpiar(valor, max) {
  if (!valor) return '';
  return String(valor).slice(0, max).replace(/[^\w\/.\-]/g, '');
}

async function contar(request, env) {
  const url = new URL(request.url);

  if (BOTS.test(request.headers.get('user-agent') || '')) {
    return new Response(null, { status: 204 });
  }

  const sitio = SITIOS.includes(url.searchParams.get('s')) ? url.searchParams.get('s') : 'web';
  const ruta = limpiar(url.searchParams.get('r'), 120) || '/';
  const marca = limpiar(url.searchParams.get('v'), 40);
  const dia = new Date().toISOString().slice(0, 10);

  await env.PANEL.prepare(
    `INSERT INTO trafico (dia, sitio, ruta, marca, visitas) VALUES (?, ?, ?, ?, 1)
     ON CONFLICT(dia, sitio, ruta, marca) DO UPDATE SET visitas = visitas + 1`
  )
    .bind(dia, sitio, ruta, marca)
    .run();

  return new Response(null, {
    status: 204,
    headers: {
      'access-control-allow-origin': '*',
      'cache-control': 'no-store',
    },
  });
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
