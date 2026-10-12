// La pestaña «YouTube» del panel pide aquí sus datos.
//
// Esta dirección está detrás del middleware de /api/panel, así que solo contesta con la sesión de Abby abierta.
// Devuelve lo que YouTube ha dado (cifras en bruto) y el estado de la carga; las conclusiones las calcula el
// navegador (panel/analisis.js). Nunca salen de aquí las claves de Google ni el contenido de la cola de trabajo.

import { avanzarYoutube, datosEnBruto, estadoPublico, tablas, versionDatos } from '../../_ytapi.js';

const CABECERAS = { 'content-type': 'application/json', 'cache-control': 'no-store' };

export async function onRequestGet({ request, env, waitUntil }) {
  const db = env.PANEL;
  try {
    await tablas(db);
    const [version, est] = await Promise.all([
      versionDatos(db),
      db.prepare('SELECT cola, ultimo, error FROM yt_estado WHERE id = 1').first(),
    ]);
    // De paso, y sin hacer esperar al panel, se avanza la carga si toca.
    if (waitUntil) waitUntil(avanzarYoutube(env).catch(() => {}));
    const estado = JSON.stringify(estadoPublico(est, env));
    // Si el navegador ya tiene esta versión, no se le vuelve a mandar todo.
    if (new URL(request.url).searchParams.get('v') === version) {
      return new Response(`{"estado":${estado},"version":${JSON.stringify(version)},"datos":null}`, { headers: CABECERAS });
    }
    // Los datos ya están escritos como JSON: se pegan tal cual para no gastar tiempo en leerlos y volver a escribirlos.
    return new Response(`{"estado":${estado},"version":${JSON.stringify(version)},"datos":${await datosEnBruto(db)}}`, { headers: CABECERAS });
  } catch (e) {
    return new Response(JSON.stringify({ error: 'No he podido leer los datos de YouTube.' }), { status: 500, headers: CABECERAS });
  }
}

// «Actualizar ahora»: empieza una carga nueva si hace más de un cuarto de hora de la última.
export async function onRequestPost({ env, waitUntil }) {
  if (waitUntil) waitUntil(avanzarYoutube(env, { forzar: true }).catch(() => {}));
  return new Response(JSON.stringify({ ok: true }), { headers: CABECERAS });
}
