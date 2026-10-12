// Lee de YouTube los datos de los vídeos largos y los deja preparados para la pestaña «YouTube» del panel.
//
// Usa el permiso de SOLO LECTURA que Abby dio a la app «Panel de Abby» (YouTube Analytics e informes de
// YouTube). Las tres claves de ese permiso viven en un único secreto de Cloudflare, YT_GOOGLE (un JSON con
// client_id, client_secret y refresh_token). Nada de eso sale nunca hacia la pantalla.
//
// Cloudflare (plan gratuito) limita cada visita a unas 50 llamadas y a muy poco tiempo de cálculo, así que
// el trabajo se reparte en tareas pequeñas: en cada visita se avanzan unas cuantas y se sigue en la
// siguiente. Un ciclo completo se repite como mucho cada seis horas. Si algo falla, lo que ya hay sigue
// enseñándose y se avisa en la pantalla.

export const DESDE_GIRO = '2026-08-09'; // primer largo del giro hacia el digestivo
const INICIO_DATOS = '2026-08-01';
const LARGO = 180; // segundos: lo que dura más es un vídeo largo
const CADA = 6 * 60 * 60 * 1000; // un ciclo completo, como mucho cada seis horas
const MINIMO_FORZAR = 15 * 60 * 1000; // y a mano, como mucho cada quince minutos
const BLOQUEO = 90 * 1000;
const LLAMADAS = 44; // tope por visita (Cloudflare gratis deja 50, contando también la base de datos)
const MAX_INFORMES = 3; // informes de alcance por visita

const A = 'https://youtubeanalytics.googleapis.com/v2/reports';
const V3 = 'https://www.googleapis.com/youtube/v3';
const R = 'https://youtubereporting.googleapis.com/v1';
const INFORMES = { b: 'channel_reach_basic_a1', c: 'channel_reach_combined_a1' };

const SIN_CLAVES = 'Falta conectar Google: no está guardado el permiso de lectura.';
const PERMISO_CADUCADO = 'El permiso de Google ha caducado: hay que volver a darlo.';

// Cuánto cuesta cada tarea en llamadas (a Google y a la base de datos), para no pasarse en una visita.
// «inf» (un informe de alcance) pesa más porque hay que trocear su CSV: así caben dos por visita.
const COSTE = { lista: 10, totales: 3, v: 5, canal: 4, cortos: 9, informes: 12, inf: 18 };
const INICIO_CORTOS = '2026-01-01'; // los Shorts se miran desde aquí (los largos, desde el giro)

/* ---------- utilidades ---------- */
const ayer = () => new Date(Date.now() - 86400000).toISOString().slice(0, 10);
const masDias = (iso, n) => new Date(Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10)) + n * 86400000).toISOString().slice(0, 10);
const analizar = (texto, porDefecto) => {
  try {
    const v = JSON.parse(texto);
    return v == null ? porDefecto : v;
  } catch {
    return porDefecto;
  }
};

function segundos(iso) {
  const m = /^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/.exec(iso || '');
  return m ? (+m[1] || 0) * 3600 + (+m[2] || 0) * 60 + (+m[3] || 0) : 0;
}

// El secreto con el permiso. Devuelve null si falta o está mal escrito.
export function credenciales(env) {
  try {
    const c = JSON.parse(env.YT_GOOGLE || '');
    if (c && c.client_id && c.client_secret && c.refresh_token) return c;
  } catch {
    /* sin permiso */
  }
  return null;
}

/* ---------- Google ---------- */
async function pedirToken(cred) {
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: cred.client_id, client_secret: cred.client_secret,
      refresh_token: cred.refresh_token, grant_type: 'refresh_token',
    }),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.access_token) {
    const caducado = ['invalid_grant', 'invalid_client', 'unauthorized_client'].includes(j.error);
    const e = new Error(caducado ? PERMISO_CADUCADO : `Google no ha dado paso (${j.error || r.status}).`);
    e.permiso = caducado;
    throw e;
  }
  return j.access_token;
}

async function google(c, url, params, init) {
  c.p.usadas++;
  const q = params ? '?' + new URLSearchParams(params) : '';
  // Si Google tarda más de 15 s, se corta: mejor reintentar luego que dejar la visita colgada.
  const r = await fetch(url + q, { ...init, signal: AbortSignal.timeout(15000), headers: { authorization: 'Bearer ' + c.tok, ...(init && init.headers) } });
  if (!r.ok) {
    let detalle = '';
    try {
      const j = await r.json();
      detalle = (j.error && (j.error.message || j.error)) || '';
    } catch {
      /* sin detalle */
    }
    const e = new Error(`YouTube ${r.status}${detalle ? ': ' + String(detalle).slice(0, 120) : ''}`);
    e.estado = r.status;
    throw e;
  }
  return r;
}
const json = async (c, url, params, init) => (await google(c, url, params, init)).json();

/* ---------- la base de datos ---------- */
let tablasListas = false;
export async function tablas(db) {
  if (tablasListas) return;
  await db.batch([
    db.prepare(
      `CREATE TABLE IF NOT EXISTS yt_estado (
         id INTEGER PRIMARY KEY CHECK (id = 1), cola TEXT, ultimo TEXT, bloqueo TEXT,
         error TEXT, informes TEXT, ciclo TEXT)`
    ),
    db.prepare(
      `CREATE TABLE IF NOT EXISTS yt_datos (
         clave TEXT PRIMARY KEY, json TEXT NOT NULL, actualizado TEXT NOT NULL)`
    ),
    db.prepare('INSERT OR IGNORE INTO yt_estado (id) VALUES (1)'),
  ]);
  tablasListas = true;
}

async function guardar(c, clave, valor) {
  c.p.usadas++;
  await c.db.prepare(
    `INSERT INTO yt_datos (clave, json, actualizado) VALUES (?, ?, ?)
     ON CONFLICT(clave) DO UPDATE SET json = excluded.json, actualizado = excluded.actualizado`
  ).bind(clave, typeof valor === 'string' ? valor : JSON.stringify(valor), new Date().toISOString()).run();
}

async function idsSeguidos(c) {
  if (c.seguidos) return c.seguidos;
  c.p.usadas++;
  const r = await c.db.prepare("SELECT json FROM yt_datos WHERE clave = 'videos'").first();
  const lista = r ? analizar(r.json, {}).videos || [] : [];
  c.seguidos = new Set(lista.map((v) => v.id));
  return c.seguidos;
}

// Código del informe de alcance (traffic_source_type) → grupo del panel.
function fuenteInforme(codigo) {
  const c = String(codigo);
  if (c === '7') return 'sug'; // vídeos sugeridos
  if (c === '3') return 'exp'; // inicio y exploración
  if (c === '4') return 'can'; // páginas de canal
  if (c === '5') return 'bus'; // búsqueda
  if (c === '24' || c === '32' || c === '23') return 'sho'; // Shorts
  return 'otr';
}

/* ---------- el CSV de los informes de alcance ---------- */
// Trocea una línea de CSV respetando las comillas.
function trocear(l) {
  if (l.indexOf('"') < 0) return l.split(',');
  const out = [];
  let i = 0;
  while (i <= l.length) {
    if (l[i] === '"') {
      let j = i + 1;
      let s = '';
      while (j < l.length) {
        if (l[j] === '"' && l[j + 1] === '"') { s += '"'; j += 2; } else if (l[j] === '"') break; else s += l[j++];
      }
      out.push(s);
      i = j + 2;
    } else {
      const j = l.indexOf(',', i);
      out.push(j < 0 ? l.slice(i) : l.slice(i, j));
      if (j < 0) break;
      i = j + 1;
    }
  }
  return out;
}
// El campo n de una línea sin trocearla entera (los anteriores al vídeo no llevan comillas).
function campo(l, n) {
  let i = 0;
  for (let k = 0; k < n; k++) {
    i = l.indexOf(',', i) + 1;
    if (i === 0) return '';
  }
  const j = l.indexOf(',', i);
  return l.slice(i, j < 0 ? l.length : j);
}

// k = 'b' (informe básico: un total por vídeo y día) o 'c' (combinado: además, por origen).
// Devuelve { dia, filas: [[vídeo, origen, impresiones, clics], …] } solo con los vídeos que se siguen.
export function leerReporte(texto, ids, k) {
  const lineas = texto.split('\n');
  const cab = trocear((lineas[0] || '').replace(/\r$/, ''));
  const col = (n) => cab.indexOf(n);
  const iDia = col('date');
  const iVid = col('video_id');
  const iImp = col('video_thumbnail_impressions');
  const iCtr = col('video_thumbnail_impressions_ctr');
  const iSrc = col('traffic_source_type');
  if (iDia < 0 || iVid < 0 || iImp < 0 || iCtr < 0 || (k === 'c' && iSrc < 0)) {
    throw new Error('El informe de YouTube no trae las columnas que esperaba.');
  }
  const crudas = [];
  let maxCtr = 0;
  let dia = null;
  for (let n = 1; n < lineas.length; n++) {
    const l = lineas[n];
    if (!l || !ids.has(campo(l, iVid))) continue;
    const f = trocear(l.replace(/\r$/, ''));
    const impr = Number(f[iImp]);
    const ctr = Number(f[iCtr]) || 0;
    if (!(impr >= 0)) continue;
    if (ctr > maxCtr) maxCtr = ctr;
    if (!dia && /^\d{8}$/.test(f[iDia])) dia = `${f[iDia].slice(0, 4)}-${f[iDia].slice(4, 6)}-${f[iDia].slice(6, 8)}`;
    crudas.push([f[iVid], k === 'c' ? fuenteInforme(f[iSrc]) : 'tot', impr, ctr]);
  }
  // El CTR puede venir como fracción (0,02) o como porcentaje (2): se decide mirando el fichero entero.
  const suma = (escala) => {
    let i = 0;
    let c = 0;
    for (const r of crudas) { i += r[2]; c += (r[2] * r[3]) / escala; }
    return i ? c / i : 0;
  };
  let escala = maxCtr > 1 ? 100 : 1;
  if (escala === 1 && suma(1) > 0.35) escala = 100;
  const agrupado = new Map();
  for (const [vid, origen, impr, ctr] of crudas) {
    const clave = vid + '|' + origen;
    const g = agrupado.get(clave) || [vid, origen, 0, 0];
    g[2] += impr;
    g[3] += (impr * ctr) / escala;
    agrupado.set(clave, g);
  }
  const filas = [...agrupado.values()].map((g) => [g[0], g[1], Math.round(g[2]), Math.round(g[3] * 100) / 100]);
  return { dia, filas };
}

/* ---------- las tareas ---------- */
async function tareaLista(c) {
  const canal = await json(c, V3 + '/channels', { part: 'contentDetails', mine: 'true' });
  const subidas = canal.items && canal.items[0] && canal.items[0].contentDetails.relatedPlaylists.uploads;
  if (!subidas) throw new Error('No encuentro el canal en esta cuenta de Google.');

  const ids = [];
  let pagina = null;
  for (let k = 0; k < 4; k++) {
    const p = await json(c, V3 + '/playlistItems', {
      part: 'contentDetails', maxResults: '50', playlistId: subidas, ...(pagina ? { pageToken: pagina } : {}),
    });
    let viejo = false;
    for (const i of p.items || []) {
      ids.push(i.contentDetails.videoId);
      const f = i.contentDetails.videoPublishedAt;
      if (f && f.slice(0, 10) < DESDE_GIRO) viejo = true;
    }
    pagina = p.nextPageToken;
    if (!pagina || viejo) break;
  }

  const videos = [];
  let cortos = 0;
  for (let k = 0; k < ids.length; k += 50) {
    const r = await json(c, V3 + '/videos', { part: 'snippet,contentDetails,status', id: ids.slice(k, k + 50).join(',') });
    for (const x of r.items || []) {
      const dur = segundos(x.contentDetails.duration);
      if (dur <= LARGO) { cortos++; continue; }
      if (x.snippet.liveBroadcastContent && x.snippet.liveBroadcastContent !== 'none') continue;
      if (x.snippet.publishedAt.slice(0, 10) < DESDE_GIRO) continue;
      videos.push({
        id: x.id, titulo: x.snippet.title, publicado: x.snippet.publishedAt, dur,
        privacidad: x.status.privacyStatus, descripcion: (x.snippet.description || '').slice(0, 3000),
      });
    }
  }
  await guardar(c, 'videos', { videos, cortos });
  c.seguidos = new Set(videos.map((v) => v.id));

  const publicos = videos.filter((v) => v.privacidad === 'public');
  return [
    ...(publicos.length ? [{ t: 'totales', ids: publicos.map((v) => v.id) }] : []),
    ...publicos.map((v) => ({ t: 'v', id: v.id, pub: v.publicado.slice(0, 10) })),
  ];
}

async function tareaTotales(c, t) {
  const r = await json(c, A, {
    ids: 'channel==MINE', startDate: INICIO_DATOS, endDate: ayer(), dimensions: 'video',
    metrics: 'views,engagedViews,estimatedMinutesWatched,averageViewDuration,subscribersGained,likes,comments,shares',
    filters: 'video==' + t.ids.join(','), maxResults: '200',
  });
  const nombres = (r.columnHeaders || []).map((h) => h.name);
  const out = {};
  for (const f of r.rows || []) out[f[0]] = Object.fromEntries(nombres.slice(1).map((n, i) => [n, f[i + 1]]));
  await guardar(c, 'totales', out);
}

async function tareaVideo(c, t) {
  const base = { ids: 'channel==MINE', startDate: masDias(t.pub, -1), endDate: ayer(), filters: 'video==' + t.id };
  const [ret, fue, sus] = await Promise.all([
    json(c, A, { ...base, dimensions: 'elapsedVideoTimeRatio', metrics: 'audienceWatchRatio,relativeRetentionPerformance' }),
    json(c, A, { ...base, dimensions: 'insightTrafficSourceType', metrics: 'views,estimatedMinutesWatched,averageViewDuration', sort: '-views' }),
    json(c, A, { ...base, dimensions: 'subscribedStatus', metrics: 'views,averageViewDuration' }),
  ]);
  await guardar(c, 'v:' + t.id, {
    ret: ret.rows || [],
    fue: (fue.rows || []).map((f) => [f[0], f[1], f[3]]),
    sus: (sus.rows || []).map((f) => [f[0], f[1], f[2]]),
  });
}

async function tareaCanal(c) {
  const fin = ayer();
  const [tipos, dias] = await Promise.all([
    json(c, A, { ids: 'channel==MINE', startDate: '2026-01-01', endDate: fin, dimensions: 'creatorContentType', metrics: 'views,estimatedMinutesWatched' }),
    json(c, A, { ids: 'channel==MINE', startDate: masDias(fin, -27), endDate: fin, dimensions: 'day', metrics: 'views', sort: 'day' }),
  ]);
  const conDatos = (dias.rows || []).filter((f) => f[1] > 0).map((f) => f[0]);
  await guardar(c, 'canal', { tipos: tipos.rows || [], hasta: conDatos.length ? conDatos[conDatos.length - 1] : null });
}

// Los Shorts: una fila por Short (cifras de toda su vida), más lo que pasa por días, de dónde llegan y quién los ve
// en los últimos 90 días. YouTube no da de ellos las impresiones ni «vistos frente a deslizados».
async function tareaCortos(c) {
  const fin = ayer();
  const desde90 = masDias(fin, -89);
  const filtro = 'creatorContentType==shorts';
  const base = { ids: 'channel==MINE', endDate: fin, filters: filtro };
  const [filas, dias, fuentes, sus] = await Promise.all([
    json(c, A, {
      ...base, startDate: INICIO_CORTOS, dimensions: 'video', sort: '-views', maxResults: '200',
      metrics: 'views,estimatedMinutesWatched,averageViewDuration,averageViewPercentage,subscribersGained,likes,shares,comments',
    }),
    json(c, A, { ...base, startDate: desde90, dimensions: 'day', metrics: 'views,subscribersGained', sort: 'day' }),
    json(c, A, { ...base, startDate: desde90, dimensions: 'insightTrafficSourceType', metrics: 'views,estimatedMinutesWatched', sort: '-views' }),
    json(c, A, { ...base, startDate: desde90, dimensions: 'subscribedStatus', metrics: 'views,averageViewDuration' }),
  ]);
  const rows = (filas.rows || []).map((f) => [f[0], f[1], f[2], f[3], Math.round(f[4] * 10) / 10, f[5], f[6], f[7], f[8]]);
  const ids = rows.map((f) => f[0]);
  const lista = [];
  for (let k = 0; k < ids.length; k += 50) {
    const r = await json(c, V3 + '/videos', { part: 'snippet,contentDetails,status', id: ids.slice(k, k + 50).join(',') });
    for (const x of r.items || []) {
      lista.push({ id: x.id, titulo: x.snippet.title, publicado: x.snippet.publishedAt, dur: segundos(x.contentDetails.duration), privacidad: x.status.privacyStatus });
    }
  }
  const conDatos = (dias.rows || []).filter((f) => f[1] > 0).map((f) => f[0]);
  await guardar(c, 'cortos', {
    desde: INICIO_CORTOS, hasta: conDatos.length ? conDatos[conDatos.length - 1] : fin, lista, filas: rows,
    dias: (dias.rows || []).map((f) => [f[0], f[1], f[2]]),
    fuentes: (fuentes.rows || []).map((f) => [f[0], f[1], f[2]]),
    sus: (sus.rows || []).map((f) => [f[0], f[1], f[2]]),
  });
  hayCortos = true;
}

async function tareaInformes(c) {
  const j = await json(c, R + '/jobs');
  const trabajos = j.jobs || [];
  const tareas = [];
  for (const [k, tipo] of Object.entries(INFORMES)) {
    let t = trabajos.find((x) => x.reportTypeId === tipo);
    if (!t) {
      t = await json(c, R + '/jobs', null, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ reportTypeId: tipo, name: 'Panel de Abby · ' + tipo }),
      });
    }
    let pagina = null;
    for (let n = 0; n < 3; n++) {
      const l = await json(c, `${R}/jobs/${t.id}/reports`, {
        pageSize: '30', ...(c.informes[t.id] ? { createdAfter: c.informes[t.id] } : {}), ...(pagina ? { pageToken: pagina } : {}),
      });
      for (const rep of l.reports || []) {
        tareas.push({ t: 'inf', k, job: t.id, id: rep.id, url: rep.downloadUrl, dia: String(rep.startTime || '').slice(0, 10), creado: rep.createTime });
      }
      pagina = l.nextPageToken;
      if (!pagina) break;
    }
  }
  tareas.sort((a, b) => String(a.creado).localeCompare(String(b.creado)));
  return tareas;
}

async function tareaInforme(c, t) {
  // El permiso solo se enseña a YouTube.
  if (!/^https:\/\/youtubereporting\.googleapis\.com\//.test(t.url || '')) throw new Error('Dirección de informe inesperada.');
  const ids = await idsSeguidos(c);
  const r = await google(c, t.url);
  if (Number(r.headers.get('content-length') || 0) > 8e6) throw new Error('Informe demasiado grande.');
  const { dia, filas } = leerReporte(await r.text(), ids, t.k);
  await guardar(c, `a:${t.k}:${dia || t.dia}`, filas);
  if (!c.informes[t.job] || String(t.creado) > c.informes[t.job]) c.informes[t.job] = t.creado;
}

async function ejecutar(t, c) {
  switch (t.t) {
    case 'lista': return tareaLista(c);
    case 'totales': return tareaTotales(c, t);
    case 'v': return tareaVideo(c, t);
    case 'canal': return tareaCanal(c);
    case 'cortos': return tareaCortos(c);
    case 'informes': return tareaInformes(c);
    case 'inf': return tareaInforme(c, t);
    default: return null;
  }
}

/* ---------- el reparto del trabajo ---------- */
let hayCortos = false; // ya hay Shorts guardados
let pedidoCortos = false; // ya se pidió traerlos aparte en esta instancia
// Se llama desde las visitas al panel, sin hacer esperar a nadie. Hace unas cuantas tareas y deja el resto
// apuntado para la siguiente visita. Con {forzar: true} empieza un ciclo nuevo aunque no hayan pasado seis horas.
export async function avanzarYoutube(env, opciones = {}) {
  const db = env.PANEL;
  if (!db) return { ok: false, motivo: 'sin base de datos' };
  try {
    await tablas(db);
  } catch (e) {
    return { ok: false, motivo: e.message };
  }
  const est = await db.prepare('SELECT cola, ultimo, bloqueo, error, informes, ciclo FROM yt_estado WHERE id = 1').first();
  const cred = credenciales(env);
  if (!cred) {
    if (est.error !== SIN_CLAVES) await db.prepare('UPDATE yt_estado SET error = ? WHERE id = 1').bind(SIN_CLAVES).run();
    return { ok: false, motivo: 'faltan las claves' };
  }

  const ahora = Date.now();
  if (est.bloqueo && Date.parse(est.bloqueo) > ahora) return { ok: true, motivo: 'ya hay otra visita trabajando' };
  let cola = analizar(est.cola, []);
  let ciclo = est.ciclo;
  if (!cola.length) {
    const hace = est.ultimo ? ahora - Date.parse(est.ultimo) : Infinity;
    if (hace < (opciones.forzar ? MINIMO_FORZAR : CADA)) {
      // Un ciclo anterior a la pestaña de Shorts no los trajo: se pide solo esa parte, sin esperar a las seis horas.
      if (!hayCortos) {
        const r = await db.prepare("SELECT 1 AS x FROM yt_datos WHERE clave = 'cortos'").first();
        if (r) hayCortos = true;
      }
      if (hayCortos || pedidoCortos) return { ok: true, motivo: 'al día' };
      pedidoCortos = true; // una sola vez por instancia: si falla, el ciclo completo lo reintenta
      cola = [{ t: 'cortos' }];
    } else {
      cola = [{ t: 'lista' }, { t: 'canal' }, { t: 'cortos' }, { t: 'informes' }];
    }
    ciclo = new Date(ahora).toISOString();
  }

  const gana = await db.prepare('UPDATE yt_estado SET bloqueo = ? WHERE id = 1 AND (bloqueo IS NULL OR bloqueo < ?)')
    .bind(new Date(ahora + BLOQUEO).toISOString(), new Date(ahora).toISOString()).run();
  if (!gana.meta || gana.meta.changes !== 1) return { ok: true, motivo: 'ya hay otra visita trabajando' };

  const c = { db, p: { usadas: 6 }, tok: null, informes: analizar(est.informes, {}), seguidos: null };
  let error = null;
  let ultimo = est.ultimo;
  let hechas = 0;
  let informes = 0;
  try {
    c.tok = await pedirToken(cred);
    c.p.usadas++;
    const limite = Date.now() + 18000; // en segundo plano Cloudflare da unos 30 s: se para antes
    while (cola.length) {
      const t = cola[0];
      if (c.p.usadas + (COSTE[t.t] || 5) > LLAMADAS) break;
      if (Date.now() > limite) break;
      if (t.t === 'inf' && informes >= MAX_INFORMES) break; // trocear CSV gasta tiempo de cálculo: pocos por visita
      try {
        const nuevas = await ejecutar(t, c);
        hechas++;
        if (t.t === 'inf') informes++;
        cola.shift();
        if (nuevas && nuevas.length) cola.unshift(...nuevas);
        if (!cola.length) { ultimo = new Date().toISOString(); ciclo = null; }
      } catch (e) {
        error = e.message;
        if (e.permiso) throw e;
        t.n = (t.n || 0) + 1;
        if (t.n >= 3) cola.shift(); // una tarea que falla tres veces se salta para no bloquear las demás
        else break;
      }
    }
  } catch (e) {
    error = e.message;
    if (e.permiso) { cola = []; ultimo = new Date(ahora - CADA + 30 * 60 * 1000).toISOString(); ciclo = null; }
  }
  await db.prepare('UPDATE yt_estado SET cola = ?, ultimo = ?, bloqueo = NULL, error = ?, informes = ?, ciclo = ? WHERE id = 1')
    .bind(JSON.stringify(cola), ultimo, error, JSON.stringify(c.informes), ciclo).run();
  return { ok: !error, hechas, pendientes: cola.length, error };
}

// Lo guardado, tal cual, para que el NAVEGADOR calcule las conclusiones (en Cloudflare gratis el tiempo de
// cálculo por visita es muy corto). Se pega como texto, sin leerlo ni volver a escribirlo, para no gastarlo.
export async function datosEnBruto(db) {
  const corte = masDias(new Date().toISOString().slice(0, 10), -150);
  const r = await db.prepare(
    "SELECT clave, json FROM yt_datos WHERE clave IN ('videos', 'totales', 'canal', 'cortos') OR clave LIKE 'v:%' OR (clave LIKE 'a:%' AND substr(clave, 5) >= ?)"
  ).bind(corte).all();
  const aparte = { videos: 'null', totales: 'null', canal: 'null', cortos: 'null' };
  const porVideo = [];
  const alcance = { b: [], c: [] };
  for (const f of r.results || []) {
    if (f.clave in aparte) aparte[f.clave] = f.json;
    else if (f.clave.startsWith('v:')) porVideo.push(`${JSON.stringify(f.clave.slice(2))}:${f.json}`);
    else if (f.clave.startsWith('a:')) {
      const [, k, dia] = f.clave.split(':');
      if (alcance[k]) alcance[k].push(`${JSON.stringify(dia)}:${f.json}`);
    }
  }
  return `{"videos":${aparte.videos},"totales":${aparte.totales},"canal":${aparte.canal},"cortos":${aparte.cortos},` +
    `"porVideo":{${porVideo.join(',')}},"alcance":{"b":{${alcance.b.join(',')}},"c":{${alcance.c.join(',')}}}}`;
}

// Cambia cada vez que se guarda algo nuevo: el navegador la devuelve y, si no ha cambiado, no se le manda nada.
export async function versionDatos(db) {
  const r = await db.prepare('SELECT MAX(actualizado) AS m, COUNT(*) AS n FROM yt_datos').first();
  return r ? `${r.m || ''}|${r.n}` : '';
}

// Lo que la pantalla puede saber del estado (nada de claves ni de la cola).
export function estadoPublico(est, env) {
  const cola = analizar(est && est.cola, []);
  return {
    ultimo: (est && est.ultimo) || null,
    error: (est && est.error) || null,
    pendientes: cola.length,
    hayClaves: !!credenciales(env),
  };
}
