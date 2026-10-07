// Trae de YouTube las visualizaciones de los vídeos del canal y las guarda.
//
// Usa la API pública de datos de YouTube con la llave que hay en el proyecto
// (YOUTUBE_API_KEY). Solo lee datos públicos: títulos y visualizaciones. No
// necesita permisos sobre la cuenta ni ve nada privado.
//
// No se refresca en cada visita al panel: se mira como mucho una vez cada seis
// horas, para no gastar cuota ni hacer lento el panel.

const CANAL = 'UCYFF4WUtkMjpO7Ies0NKfrg'; // Abby | Salud Digestiva
const CADA = 6 * 60 * 60 * 1000;
const CUANTOS = 40; // vídeos más recientes

async function tabla(db) {
  await db.prepare(
    `CREATE TABLE IF NOT EXISTS youtube_estado (
       id INTEGER PRIMARY KEY CHECK (id = 1), ultima TEXT)`
  ).run();
}

async function tocaMirar(db) {
  await tabla(db);
  const r = await db.prepare('SELECT ultima FROM youtube_estado WHERE id = 1').first();
  if (!r || !r.ultima) return true;
  return Date.now() - Date.parse(r.ultima) > CADA;
}

export async function refrescarYoutube(env) {
  const llave = env.YOUTUBE_API_KEY;
  if (!llave) return { ok: false, motivo: 'falta la llave' };

  const db = env.PANEL;
  if (!(await tocaMirar(db))) return { ok: true, motivo: 'mirado hace poco' };

  const canal = env.YOUTUBE_CANAL || CANAL;
  const base = 'https://www.googleapis.com/youtube/v3';

  try {
    // 1. La lista de subidas del canal.
    const c = await fetch(`${base}/channels?part=contentDetails&id=${canal}&key=${llave}`).then((r) => r.json());
    const lista = c.items && c.items[0] && c.items[0].contentDetails.relatedPlaylists.uploads;
    if (!lista) return { ok: false, motivo: 'no encuentro el canal' };

    // 2. Los vídeos más recientes de esa lista.
    const p = await fetch(`${base}/playlistItems?part=contentDetails&maxResults=${CUANTOS}&playlistId=${lista}&key=${llave}`).then((r) => r.json());
    const ids = (p.items || []).map((i) => i.contentDetails.videoId).filter(Boolean);
    if (!ids.length) return { ok: true, motivo: 'el canal no tiene vídeos' };

    // 3. Título y visualizaciones de cada uno (de cincuenta en cincuenta).
    const v = await fetch(`${base}/videos?part=snippet,statistics&id=${ids.slice(0, 50).join(',')}&key=${llave}`).then((r) => r.json());

    const dia = new Date().toISOString().slice(0, 10);
    const filas = (v.items || []).map((x) =>
      db.prepare(
        `INSERT INTO videos (dia, video, titulo, visualizaciones) VALUES (?, ?, ?, ?)
         ON CONFLICT(dia, video) DO UPDATE SET titulo = excluded.titulo,
           visualizaciones = excluded.visualizaciones`
      ).bind(dia, x.id, x.snippet.title.slice(0, 200), Number(x.statistics.viewCount || 0))
    );

    if (filas.length) await db.batch(filas);

    await db.prepare(
      'INSERT OR REPLACE INTO youtube_estado (id, ultima) VALUES (1, ?)'
    ).bind(new Date().toISOString()).run();

    return { ok: true, videos: filas.length };
  } catch (e) {
    return { ok: false, motivo: e.message };
  }
}
