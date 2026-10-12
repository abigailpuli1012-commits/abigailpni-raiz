// Convierte los datos en bruto de YouTube en lo que enseña la pestaña «YouTube» del panel: las cifras,
// el semáforo de cada vídeo y, sobre todo, las conclusiones («qué significa» y «qué hago»).
//
// Se ejecuta en el NAVEGADOR de Abby (no en Cloudflare, que en el plan gratuito da muy poco tiempo de
// cálculo por visita) y también en las pruebas locales. Es una función pura: recibe datos y devuelve
// datos, sin llamar a nadie. Todo lo que escribe son frases sin etiquetas: la pantalla las pinta como texto.

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

// Umbrales propuestos (se ajustan aquí, en un solo sitio).
const REPARTO_BIEN = 1500; // impresiones la primera semana
const REPARTO_REGULAR = 500;
const CTR_BIEN = 3; // % de clics en sugeridos
const CTR_REGULAR = 1.5;
const REL_BIEN = 0.5; // retención frente a vídeos de su duración: 0,5 = mediana
const REL_REGULAR = 0.35;
const MIN_IMPR_CTR = 150; // por debajo, el CTR no dice nada
export const PALABRAS_VETADAS = [
  ['ayuno', /\bayun(o|os|ar|ando)\b/, 'es un tema que no se toca; di «espacio entre comidas»'],
  ['glucosa', /\bglucosa\b/, 'es un tema que no se toca'],
  ['metabolismo', /\bmetabolismo\b/, 'es un tema que no se toca'],
  ['insulina', /\binsulina\b/, 'es un tema que no se toca'],
  ['tiroides', /\btiroides\b/, 'es un tema que no se toca'],
  ['tripa', /\btripas?\b/, 'se dice «barriga», nunca «tripa»'],
];
// Fallos de ortografía conocidos en títulos concretos: avisan mientras el título siga igual.
const ERRATAS = [
  ['Porque tardo mucho en hacer la digestion?', 'Mejor «Por qué tardo mucho en hacer la digestión?» (por qué separado y con tilde en digestión).'],
  ['Por qué tu intestino reacciona a cualquier cosa y que hacer al respecto', 'Falta la tilde: «y qué hacer al respecto».'],
  ['El trastorno alimentario que causan tus sintomas digestivos', 'Falta la tilde: «síntomas».'],
  ['Porque tu barriga se a vuelto hipervigilante ( y como salir de la evitacion)', 'El título que confirmaste es «Por qué tu barriga se ha vuelto hipervigilante (y cómo salir de la evitación)».'],
];

/* ---------- utilidades ---------- */
const miles = (n) => Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
const dec = (x, d = 1) => x.toFixed(d).replace('.', ',');
const pc = (x) => `${Math.round(x)} %`;
const rel2 = (x) => dec(x, 2);
const dur = (s) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`;
const dia = (iso) => `${Number(iso.slice(8, 10))} ${MESES[Number(iso.slice(5, 7)) - 1]}`;
const solo = (iso) => iso.slice(0, 10);
const msDia = (iso) => Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10));
const diasEntre = (a, b) => Math.round((msDia(b) - msDia(a)) / 86400000);
const masDias = (iso, n) => new Date(msDia(iso) + n * 86400000).toISOString().slice(0, 10);
const media = (xs) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : null);
const mediana = (xs) => {
  if (!xs.length) return null;
  const o = [...xs].sort((a, b) => a - b);
  const m = o.length >> 1;
  return o.length % 2 ? o[m] : (o[m - 1] + o[m]) / 2;
};
function corto(t) {
  const s = String(t || '').replace(/\s+/g, ' ').trim();
  if (s.length <= 36) return s;
  const c = s.slice(0, 36);
  const p = Math.max(c.lastIndexOf(','), c.lastIndexOf(':'), c.lastIndexOf('?'), c.lastIndexOf('.'));
  if (p >= 18) return c.slice(0, p) + '…';
  const i = c.lastIndexOf(' ');
  return (i > 18 ? c.slice(0, i) : c.slice(0, 35)).replace(/[ ,.:;¿?¡!(]+$/, '') + '…';
}
const certezaMuestra = (vistas) => (vistas >= 150 ? 'media-alta' : vistas >= 60 ? 'media' : vistas >= 30 ? 'media-baja' : 'baja');
const unir = (xs) => (xs.length <= 1 ? xs.join('') : xs.slice(0, -1).join(', ') + ' y ' + xs[xs.length - 1]);

/* ---------- la curva de retención ---------- */
// filas: [[proporción del vídeo (0,01…1), gente que sigue (1 = todos), retención relativa (0…1)], …]
function curva(filas, durS) {
  if (!filas || filas.length < 10 || !durS) return null;
  const xs = [0];
  const ys = [100];
  const rs = [null];
  for (const f of filas) {
    xs.push(f[0] * durS);
    ys.push(Math.min(100, Math.max(0, f[1] * 100)));
    rs.push(f[2] == null ? null : f[2]);
  }
  const buscar = (t) => {
    if (t <= 0) return [0, 0, 0];
    for (let i = 1; i < xs.length; i++) if (t <= xs[i]) return [i - 1, i, (t - xs[i - 1]) / (xs[i] - xs[i - 1] || 1)];
    return [xs.length - 1, xs.length - 1, 0];
  };
  const ret = (t) => {
    const [a, b, f] = buscar(t);
    return ys[a] + (ys[b] - ys[a]) * f;
  };
  const rel = (t) => {
    const [a, b, f] = buscar(t);
    const ra = rs[a] == null ? rs[b] : rs[a];
    const rb = rs[b] == null ? rs[a] : rs[b];
    if (ra == null || rb == null) return null;
    return ra + (rb - ra) * f;
  };
  const enP = (p) => ret((p / 100) * durS);
  const relP = (p) => rel((p / 100) * durS);
  return {
    ret, rel, enP, relP,
    min: Array.from({ length: 61 }, (_, s) => Math.round(ret(s) * 10) / 10),
    todo: Array.from({ length: 101 }, (_, p) => Math.round(enP(p) * 10) / 10),
  };
}

/* ---------- de dónde llega la gente ---------- */
const GRUPOS = ['sug', 'exp', 'can', 'bus', 'sho', 'otr'];
const NOMBRES_GRUPO = [
  { n: 'Sugeridos', c: '#E79BB0' }, { n: 'Inicio y exploración', c: '#B98DC9' },
  { n: 'Páginas de canal', c: '#6FC3A4' }, { n: 'Búsqueda', c: '#F0A878' },
  { n: 'Shorts relacionados', c: '#7FB5DC' }, { n: 'Otros', c: '#D8CBD1' },
];
function grupoDe(tipo) {
  if (tipo === 'RELATED_VIDEO') return 0;
  if (tipo === 'SUBSCRIBER') return 1;
  if (tipo === 'YT_CHANNEL') return 2;
  if (tipo === 'YT_SEARCH') return 3;
  if (tipo === 'SHORTS_CONTENT_LINKS' || tipo === 'SHORTS') return 4;
  return 5;
}
function agruparOrigen(filas) {
  const v = [0, 0, 0, 0, 0, 0];
  for (const f of filas || []) v[grupoDe(f[0])] += f[1] || 0;
  return v;
}

/* ---------- impresiones y clics ---------- */
// Une lo que dicen los informes de YouTube con la copia de Studio. Devuelve, por vídeo,
// { origen, impr, clics, ctr, fuentes: {sug:{impr,clics,ctr}…}, dias: [impr día 1, día 2…], semana1, hasta }.
// Reparte las filas de los informes por vídeo, una sola vez: { vídeo: { día: [filas] } }.
function indexar(porDia) {
  const idx = {};
  for (const [d, filas] of Object.entries(porDia || {})) for (const f of filas) ((idx[f[0]] ||= {})[d] ||= []).push(f);
  return idx;
}

function alcanceDe(v, e, ib, ic) {
  const pub = solo(v.publicado);
  const tot = {}; // día → impresiones (informe básico)
  const totC = {}; // día → impresiones (suma del combinado)
  const clicsDia = {};
  const fuentes = {};
  let hayB = false;
  let hayC = false;
  for (const [dia_, filas] of Object.entries(ib[v.id] || {})) {
    for (const f of filas) {
      hayB = true;
      tot[dia_] = (tot[dia_] || 0) + f[2];
      clicsDia[dia_] = (clicsDia[dia_] || 0) + f[3];
    }
  }
  for (const [dia_, filas] of Object.entries(ic[v.id] || {})) {
    for (const f of filas) {
      hayC = true;
      totC[dia_] = (totC[dia_] || 0) + f[2];
      const g = (fuentes[f[1]] ||= { impr: 0, clics: 0 });
      g.impr += f[2];
      g.clics += f[3];
    }
  }
  const porDia = hayB ? tot : totC;
  const dias_ = Object.keys(porDia).sort();
  const cubre = dias_.length > 0 && dias_[0] <= masDias(pub, 1);

  if (cubre || (dias_.length && !e.semilla?.videos?.[v.id])) {
    const impr = dias_.reduce((s, d) => s + porDia[d], 0);
    let clics = 0;
    if (hayB) clics = dias_.reduce((s, d) => s + (clicsDia[d] || 0), 0);
    else clics = Object.values(fuentes).reduce((s, g) => s + g.clics, 0);
    // El informe combinado esconde los clics de las filas muy pequeñas (muchos «sugeridos», búsquedas y
    // páginas de canal tienen 1-3 impresiones por fila) y se queda corto: el básico, que cuadra con Studio,
    // manda. Los clics que faltan se reparten entre los orígenes que tienen filas pequeñas, según sus
    // impresiones; «inicio y exploración» (filas grandes) cuadra con Studio tal cual.
    if (hayB && hayC) {
      const falta = clics - Object.values(fuentes).reduce((s, g) => s + g.clics, 0);
      const chicos = ['sug', 'can', 'bus', 'otr'].filter((k) => fuentes[k] && fuentes[k].impr > 0);
      const base = chicos.reduce((s, k) => s + fuentes[k].impr, 0);
      if (falta > 0.5 && base > 0) for (const k of chicos) fuentes[k].clics += falta * (fuentes[k].impr / base);
    }
    const out = {};
    for (const [k, g] of Object.entries(fuentes)) out[k] = { impr: g.impr, clics: g.clics, ctr: g.impr ? (g.clics / g.impr) * 100 : null };
    const ultimo = dias_[dias_.length - 1];
    const serie = [];
    for (let i = 0; i <= diasEntre(pub, ultimo) && i < 30; i++) serie.push(porDia[masDias(pub, i)] || 0);
    const w1 = Math.min(serie.length, 7);
    const diasMapa = {};
    if (hayB) for (const d of dias_) diasMapa[d] = [tot[d] || 0, clicsDia[d] || 0];
    return {
      origen: 'informes', parcial: !cubre, impr, clics, ctr: impr ? (clics / impr) * 100 : null,
      fuentes: out, dias: serie, hasta: ultimo, diasMapa,
      semana1: serie.length >= 7 ? serie.slice(0, 7).reduce((s, x) => s + x, 0) : serie.slice(0, w1).reduce((s, x) => s + x, 0),
      semana1Completa: serie.length >= 7,
    };
  }

  const s = e.semilla?.videos?.[v.id];
  if (s) {
    const out = {};
    for (const [k, [impr, ctr]] of Object.entries(s.f || {})) out[k] = { impr, clics: (impr * ctr) / 100, ctr };
    const serie = s.dias || [];
    return {
      origen: 'studio', parcial: false, impr: s.impr, clics: (s.impr * s.ctr) / 100, ctr: s.ctr,
      fuentes: out, dias: serie, hasta: e.semilla.hasta,
      semana1: serie.length >= 7 ? serie.slice(0, 7).reduce((x, y) => x + y, 0) : null,
      semana1Completa: serie.length >= 7,
    };
  }
  return null;
}

/* ---------- la construcción del panel ---------- */
export function construirPanel(e) {
  const ahora = e.ahora || new Date().toISOString();
  const hoy = solo(ahora);
  const datosHasta = e.canal?.hasta || masDias(hoy, -3);
  const todos = (e.videos || []).slice();
  const publicos = todos.filter((v) => v.privacidad === 'public').sort((a, b) => b.publicado.localeCompare(a.publicado));
  const privados = todos.filter((v) => v.privacidad !== 'public').sort((a, b) => b.publicado.localeCompare(a.publicado));

  /* --- un objeto por vídeo --- */
  const idxB = indexar(e.alcance && e.alcance.b);
  const idxC = indexar(e.alcance && e.alcance.c);
  const V = publicos.map((v) => {
    const a = e.porVideo?.[v.id] || {};
    const t = e.totales?.[v.id] || {};
    const c = curva(a.ret, v.dur);
    const sus = {};
    for (const f of a.sus || []) sus[f[0]] = { vistas: f[1], avd: f[2] };
    const siV = sus.SUBSCRIBED?.vistas || 0;
    const noV = sus.UNSUBSCRIBED?.vistas || 0;
    const vistas = t.views != null ? t.views : siV + noV;
    const origen = agruparOrigen(a.fue);
    const totOrigen = origen.reduce((s, x) => s + x, 0);
    const pub = solo(v.publicado);
    const dias = diasEntre(pub, datosHasta) + 1;
    const al = alcanceDe(v, e, idxB, idxC);
    const sug = al?.fuentes?.sug;
    const noSigue = siV + noV > 0 ? Math.round((noV / (siV + noV)) * 100) : null;
    const pBus = totOrigen ? Math.round((origen[3] / totOrigen) * 100) : 0;
    let publico = null;
    if (noSigue != null) {
      if (pBus >= 40) publico = `venía de búsqueda (${pBus} %)`;
      else if (noSigue >= 85) publico = `${noSigue} % no te seguía`;
      else if (100 - noSigue >= 55) publico = `la mayoría te sigue (${100 - noSigue} %)`;
      else if (100 - noSigue >= 45) publico = `la mitad te sigue (${100 - noSigue} %)`;
      else publico = 'gente fría y tuya mezcladas';
    }
    const o = {
      id: v.id, titulo: v.titulo, corto: corto(v.titulo), fecha: dia(pub), pub, dur: dur(v.dur), durS: v.dur,
      vistas, interesadas: t.engagedViews ?? null, horas: t.estimatedMinutesWatched != null ? t.estimatedMinutesWatched / 60 : null,
      avd: t.averageViewDuration ?? null, subs: t.subscribersGained ?? 0, dias, publico, noSigue,
      origen, pBus, sus,
      impr: al?.impr ?? null, ctr: al?.ctr ?? null, semana1: al?.semana1 ?? null, semana1Completa: !!al?.semana1Completa,
      ctrSug: sug && sug.impr >= 1 ? sug.ctr : null, imprSug: sug?.impr ?? 0,
      alcanceOrigen: al?.origen || null,
      _al: al, _c: c,
    };
    if (c) {
      Object.assign(o, {
        ret30: c.ret(30), ret60: c.ret(60), r25: c.enP(25), r50: c.enP(50), r80: c.enP(80), r90: c.enP(90), fin: c.enP(100),
        rel30: c.rel(30), rel60: c.rel(60), rel25: c.relP(25), rel50: c.relP(50), rel80: c.relP(80), rel90: c.relP(90),
      });
    }
    return o;
  });
  const conCurva = V.filter((v) => v._c && v.vistas >= 20);
  const frios = V.filter((v) => v._c && v.noSigue != null && v.noSigue >= 80 && v.vistas >= 100);
  const hayAlcance = V.some((v) => v._al);
  const origenAlcance = V.some((v) => v._al?.origen === 'informes') ? (V.some((v) => v._al?.origen === 'studio') ? 'mixta' : 'informes')
    : V.some((v) => v._al?.origen === 'studio') ? 'studio' : 'ninguna';

  /* --- cómo reparte YouTube cada vídeo --- */
  for (const v of V) {
    const d = v._al?.dias || [];
    v.reparto = null;
    if (d.length >= 7 && d[0] > 0) {
      const m = mediana(d.slice(2, 7));
      const r = m / d[0];
      v.reparto = r >= 1.5 ? 'amplió' : r >= 0.6 ? 'mantuvo' : 'soltó';
    }
  }

  /* --- los paquetes: cada largo con su CTR (los antiguos salen de la copia de Studio) --- */
  const paq = new Map();
  for (const p of e.semilla?.paquetes || []) paq.set(p.id, { ...p, origen: 'studio' });
  for (const v of V) {
    const al = v._al;
    if (!al || !(al.impr > 0) || al.ctr == null) continue;
    const base = paq.get(v.id);
    if (al.origen === 'informes' && !al.parcial) paq.set(v.id, { id: v.id, pub: v.pub, titulo: v.titulo, mini: (base && base.mini) || null, impr: al.impr, ctr: al.ctr, vistas: v.vistas, origen: 'informes' });
    else if (!base) paq.set(v.id, { id: v.id, pub: v.pub, titulo: v.titulo, mini: null, impr: al.impr, ctr: al.ctr, vistas: v.vistas, origen: al.origen });
  }
  const listaPaq = [...paq.values()].filter((p) => p.impr > 0 && p.ctr != null).sort((a, b) => a.pub.localeCompare(b.pub));
  const SEPT = '2026-09-01'; // desde aquí, miniaturas sobrias
  const CAMBIO = '2026-10-12'; // desde aquí, vídeos con el empaquetado nuevo
  const eraDe = (p) => (p.pub >= CAMBIO ? 'nuevo' : p.pub >= SEPT ? 'sobrio' : 'antes');
  const resumenPaq = { antes: {}, sobrio: {}, nuevo: {} };
  for (const clave of ['antes', 'sobrio', 'nuevo']) {
    for (const [vol, f] of [['poco', (p) => p.impr < 1000], ['mucho', (p) => p.impr >= 1000]]) {
      const xs = listaPaq.filter((p) => eraDe(p) === clave && f(p));
      const n = xs.reduce((s, p) => s + p.impr, 0);
      resumenPaq[clave][vol] = { n: xs.length, impr: n, ctr: n ? (xs.reduce((s, p) => s + (p.impr * p.ctr) / 100, 0) / n) * 100 : null };
    }
  }
  // Los vídeos a los que se les cambió el título o la miniatura: CTR de antes y de después, día a día.
  const cambios = [];
  for (const [id, fecha] of Object.entries(e.semilla?.cambios || {})) {
    const v = V.find((x) => x.id === id);
    const mapa = v && v._al && v._al.diasMapa;
    if (!mapa) continue;
    const antes = [0, 0];
    const despues = [0, 0];
    for (const [d, [i, c]] of Object.entries(mapa)) {
      if (d < fecha) { antes[0] += i; antes[1] += c; } else if (d > fecha) { despues[0] += i; despues[1] += c; }
    }
    cambios.push({
      id, titulo: v.titulo, fecha,
      antes: { impr: antes[0], ctr: antes[0] ? (antes[1] / antes[0]) * 100 : null },
      despues: { impr: despues[0], ctr: despues[0] ? (despues[1] / despues[0]) * 100 : null },
    });
  }

  /* --- el semáforo --- */
  const luz = (c, t) => ({ c, t });
  for (const v of V) {
    // Reparto
    if (v.dias < 7) v.luzReparto = luz('g', 'Pronto');
    else if (v.semana1 == null) v.luzReparto = luz('g', 'Sin dato');
    else if (v.semana1 >= REPARTO_BIEN) v.luzReparto = luz('v', 'Bien');
    else if (v.semana1 >= REPARTO_REGULAR) v.luzReparto = luz('a', 'Regular');
    else v.luzReparto = luz('r', 'Poco');
    // Te eligen
    if (v.ctrSug == null || v.imprSug < MIN_IMPR_CTR) v.luzEleccion = luz('g', 'Sin dato');
    else if (v.ctrSug >= CTR_BIEN) v.luzEleccion = luz('v', 'Bien');
    else if (v.ctrSug >= CTR_REGULAR) v.luzEleccion = luz('a', 'Regular');
    else v.luzEleccion = luz('r', 'Flojo');
    // Al minuto y al final (frente a vídeos de su duración)
    const porRel = (x) => (v.vistas < 25 ? luz('g', 'Poca muestra') : x == null ? luz('g', 'Sin dato') : x >= REL_BIEN ? luz('v', 'Bien') : x >= REL_REGULAR ? luz('a', 'Regular') : luz('r', 'Flojo'));
    v.luzMinuto = v._c ? porRel(v.rel60) : luz('g', 'Sin dato');
    v.luzFinal = v._c ? porRel(v.rel90) : luz('g', 'Sin dato');
  }

  /* --- el público en general --- */
  const fuera = (xs) => xs.filter((x) => x != null);
  const rangoFrio = (clave) => {
    const xs = fuera(frios.map((v) => v[clave]));
    return xs.length ? [Math.round(Math.min(...xs)), Math.round(Math.max(...xs))] : null;
  };
  const perdida1 = frios.map((v) => Math.round(100 - v.ret60));
  const llegan80 = fuera(frios.map((v) => (v.r25 > 0 ? Math.round((v.r80 / v.r25) * 10) : null)));
  const rg80 = rangoFrio('r80');
  const rg90 = rangoFrio('r90');

  /* --- las tres cifras grandes --- */
  const vistazo = [];
  {
    const tipos = {};
    for (const f of e.canal?.tipos || []) tipos[f[0]] = { vistas: f[1], min: f[2] };
    const vod = tipos.videoOnDemand;
    const minTot = Object.values(tipos).reduce((s, x) => s + x.min, 0);
    const vistasTot = Object.values(tipos).reduce((s, x) => s + x.vistas, 0);
    if (vod && minTot && vistasTot) {
      vistazo.push({
        icono: '🎬', rotulo: 'Horas vistas por tus largos', cifra: `${Math.round(vod.min / 60)} h`,
        pie: `El ${Math.round((vod.min / minTot) * 100)} % de las horas del canal, con solo el ${dec((vod.vistas / vistasTot) * 100)} % de las vistas.`,
      });
    }
    const conAl = V.filter((v) => v._al && v._al.impr > 0);
    const imprT = conAl.reduce((s, v) => s + v._al.impr, 0);
    const clicsT = conAl.reduce((s, v) => s + v._al.clics, 0);
    if (imprT >= 500) {
      const x = (clicsT / imprT) * 100;
      // Con todos los largos que tienen impresiones (los antiguos salen de la copia de Studio), para no dar por «tus largos» solo los recientes.
      const imprTodos = listaPaq.reduce((s, p) => s + p.impr, 0);
      const ctrTodos = imprTodos ? (listaPaq.reduce((s, p) => s + (p.impr * p.ctr) / 100, 0) / imprTodos) * 100 : null;
      const pieTodos = ctrTodos != null && listaPaq.length > conAl.length ? ` Con los ${listaPaq.length} largos que tienen datos, desde mayo: ${dec(ctrTodos)} %.` : '';
      vistazo.push({
        icono: '🖱️', rotulo: `CTR de tus últimos ${conAl.length} largos`, cifra: `${dec(x)} %`,
        pie: (x < 2 ? 'YouTube dice que lo normal va del 2 al 10 %: estás por debajo.'
          : x < 3.5 ? 'YouTube dice que lo normal va del 2 al 10 %: estás en la parte baja.'
            : x < 6 ? 'YouTube dice que lo normal va del 2 al 10 %: estás dentro.' : 'YouTube dice que lo normal va del 2 al 10 %: estás en la parte alta.') + pieTodos,
      });
    } else {
      vistazo.push({ icono: '🖱️', rotulo: 'CTR de tus largos', cifra: '—', pie: 'Llegará con los informes de impresiones de YouTube.' });
    }
    const mejor = [...conCurva].sort((a, b) => b.vistas - a.vistas)[0];
    if (mejor) {
      const r = mejor.rel60;
      vistazo.push({
        icono: '⏱️', rotulo: 'Siguen viendo al minuto', cifra: pc(mejor.ret60),
        pie: `En «${mejor.titulo}», tu vídeo con más vistas. ` + (r == null ? '' : r >= REL_BIEN ? 'Frente a vídeos de su duración: en la mediana o por encima.' : r >= REL_REGULAR ? 'Frente a vídeos de su duración: algo por debajo de la mediana.' : 'Frente a vídeos de su duración: muy por debajo de la mediana.'),
      });
    }
  }

  /* --- el veredicto --- */
  const bien = [];
  const mal = [];
  const ojo = [];
  const recientes = V.filter((v) => v.dias <= 9);

  // Va bien: YouTube lo reparte
  const repartidos = V.filter((v) => v.semana1Completa && v.semana1 >= REPARTO_BIEN && v.reparto && v.reparto !== 'soltó')
    .sort((a, b) => b.semana1 - a.semana1);
  for (const v of repartidos.slice(0, 2)) {
    bien.push({
      t: `«${v.titulo}»: YouTube lo reparte (${miles(v.semana1)} impresiones la primera semana${v.reparto === 'amplió' ? ' y lo fue ampliando' : ''})${v.noSigue != null && v.noSigue >= 80 ? ` y el ${v.noSigue} % de su gente no te seguía` : ''}.`,
      c: certezaMuestra(v.vistas),
    });
  }
  if (!repartidos.length) {
    const porSug = V.filter((v) => v.vistas >= 100 && v.origen[0] + v.origen[1] >= 0.6 * v.origen.reduce((s, x) => s + x, 0))
      .sort((a, b) => b.vistas - a.vistas)[0];
    if (porSug) {
      const tot = porSug.origen.reduce((s, x) => s + x, 0);
      bien.push({ t: `«${porSug.titulo}»: el ${Math.round(((porSug.origen[0] + porSug.origen[1]) / tot) * 100)} % de sus vistas llega por sugeridos e inicio, es decir, YouTube lo está enseñando a gente que no te conocía.`, c: certezaMuestra(porSug.vistas) });
    }
  }
  // Va bien: quien pasa el arranque se queda
  const conMitad = conCurva.filter((v) => v.vistas >= 40 && v.rel50 != null);
  const mitadBien = conMitad.filter((v) => v.rel50 >= 0.4);
  const cuerpoAguanta = conMitad.length >= 4 && mitadBien.length / conMitad.length >= 0.66;
  if (llegan80.length && Math.min(...llegan80) >= 6) {
    bien.push({
      t: `Quien pasa el primer cuarto se queda: en tus vídeos con gente fría, entre ${Math.min(...llegan80)} y ${Math.max(...llegan80)} de cada 10 de los que llegan ahí siguen hasta el 80 %.` +
        (cuerpoAguanta ? ` Y a mitad del vídeo, ${mitadBien.length} de ${conMitad.length} están cerca de la mediana de los vídeos de su duración o por encima.` : ''),
      c: frios.length >= 2 ? 'media' : 'media-baja',
    });
  } else if (cuerpoAguanta) {
    bien.push({ t: `A mitad del vídeo, ${mitadBien.length} de ${conMitad.length} están cerca de la mediana de los vídeos de su duración o por encima.`, c: 'media' });
  }
  // Va bien: la buscan
  for (const v of V.filter((x) => x.pBus >= 40 && x.vistas >= 40).slice(0, 1)) {
    const cb = v._al?.fuentes?.bus;
    bien.push({ t: `«${v.titulo}» la buscan: el ${v.pBus} % de sus vistas viene de búsqueda${cb && cb.impr >= 50 ? `, con un ${dec(cb.ctr)} % de CTR` : ''}.`, c: 'media' });
  }

  // Falla: arranque
  const arranqueFlojo = conCurva.filter((v) => v.vistas >= 40 && v.rel60 != null && (v.rel60 < 0.3 || (v.rel30 != null && v.rel30 < 0.25)));
  for (const v of arranqueFlojo) {
    mal.push({
      t: `«${v.titulo}»: el arranque queda muy por debajo de lo normal para vídeos de su duración (${rel2(v.rel60)} al minuto; sigue el ${pc(v.ret60)}).`,
      c: certezaMuestra(v.vistas),
    });
  }
  // Falla: final
  const conFinal = conCurva.filter((v) => v.vistas >= 40 && v.rel90 != null);
  const finalBajo = conFinal.filter((v) => v.rel90 < 0.5);
  const finalMuyBajo = conFinal.filter((v) => v.rel90 < REL_REGULAR);
  if (conFinal.length >= 3 && finalBajo.length / conFinal.length >= 0.5) {
    mal.push({
      t: `El tramo final: hacia el 90 % del vídeo, ${finalBajo.length} de ${conFinal.length} están por debajo de la mediana de los vídeos de su duración (${finalMuyBajo.length} de ellos, muy por debajo). Es donde va la llamada al test.`,
      c: conFinal.length >= 5 ? 'media' : 'media-baja',
    });
  }
  // Falla: clics en sugeridos
  const conSug = V.filter((v) => v.ctrSug != null && v.imprSug >= MIN_IMPR_CTR);
  if (conSug.length >= 2) {
    const nT = conSug.reduce((s, v) => s + v.imprSug, 0);
    const kT = conSug.reduce((s, v) => s + (v._al.fuentes.sug.clics || 0), 0);
    for (const v of conSug) {
      const n = nT - v.imprSug;
      const k = kT - v._al.fuentes.sug.clics;
      const p0 = n ? k / n : 0;
      const k1 = v._al.fuentes.sug.clics;
      const z = p0 > 0 && p0 < 1 ? (k1 - v.imprSug * p0) / Math.sqrt(v.imprSug * p0 * (1 - p0)) : 0;
      if (v.ctrSug < CTR_REGULAR && z < -1.64) {
        mal.push({
          t: `«${v.titulo}»: solo ${dec(v.ctrSug)} % de clics en sugeridos (${Math.round(k1)} de ${miles(v.imprSug)}); en los demás vídeos ronda el ${dec(p0 * 100)} %. Es poco probable que sea azar.`,
          c: z < -2.33 ? 'media' : 'media-baja',
        });
      }
    }
  }
  // Falla: el paquete de septiembre-octubre rinde menos que el de los primeros vídeos
  {
    const a = resumenPaq.antes.poco;
    const s = resumenPaq.sobrio.poco;
    const am = resumenPaq.antes.mucho;
    const sm = resumenPaq.sobrio.mucho;
    if (a.n >= 3 && s.n >= 2 && a.ctr > 1.3 * s.ctr) {
      mal.unshift({
        t: `El CTR de los vídeos de septiembre-octubre es el más bajo del canal: ${dec(s.ctr)} % con menos de 1.000 impresiones, frente al ${dec(a.ctr)} % que sacaban antes con ese mismo volumen` +
          (am.n >= 3 && sm.n >= 1 ? `; con más de 1.000, ${dec(sm.ctr)} % frente a ${dec(am.ctr)} %.` : '.'),
        c: 'media-alta',
      });
    }
  }
  // Falla: el test al final
  if (frios.length && rg90) {
    mal.push({ t: `El test va solo al final, y hacia el 90 % del vídeo queda entre el ${rg90[0]} y el ${rg90[1]} % del público frío.`, c: 'media-baja' });
  }

  // A vigilar: pronto para juzgar
  for (const v of recientes.slice(0, 2)) {
    ojo.push({
      t: v.dias <= 0
        ? `«${v.titulo}» se ha publicado hace nada: YouTube tarda 2-3 días en dar sus primeros datos.`
        : `«${v.titulo}» lleva ${v.dias} ${v.dias === 1 ? 'día' : 'días'}${v._al ? ` y ${miles(v._al.impr)} impresiones` : ''}: es pronto para juzgarlo. Vuelve a mirarlo hacia el ${dia(masDias(v.pub, 14))}.`,
      c: 'baja',
    });
  }
  // A vigilar: el primer minuto
  if (frios.length >= 2 && perdida1.some((x) => x >= 50)) {
    ojo.push({
      t: `El primer minuto pierde a más de la mitad del público frío (${unir(perdida1.map((x) => `${x} %`))}). Es lo habitual en YouTube (al minuto estás cerca de la mediana), pero es donde más margen hay.`,
      c: 'media',
    });
  }
  // A vigilar: Shorts → largos
  {
    const delShorts = V.reduce((s, v) => s + v.origen[4], 0);
    const total = V.reduce((s, v) => s + v.origen.reduce((a, b) => a + b, 0), 0);
    if (total >= 200 && delShorts / total < 0.1) {
      ojo.push({ t: `Los Shorts casi no llevan gente a los largos: ${miles(delShorts)} vistas de ${miles(total)} (${pc((delShorts / total) * 100)}).`, c: 'media-baja' });
    }
  }
  // A vigilar: suscriptores
  {
    const grandes = V.filter((v) => v.vistas >= 40);
    const s = grandes.reduce((a, v) => a + (v.subs || 0), 0);
    const w = grandes.reduce((a, v) => a + v.vistas, 0);
    if (w >= 300 && s / w < 0.012) {
      ojo.push({ t: `Casi nadie pasa de ver el vídeo a seguirte: ${s} suscriptores con ${miles(w)} vistas (${dec((s / w) * 100)} %).`, c: 'media' });
    }
  }

  /* --- avisos --- */
  const avisos = [];
  const arreglos = [];
  const revisar = [...publicos, ...privados];
  for (const v of revisar) {
    const donde = v.privacidad === 'public' ? '' : ' (todavía en privado: aún estás a tiempo)';
    const lineas = String(v.descripcion || '').split('\n');
    for (const [palabra, re, nota] of PALABRAS_VETADAS) {
      const enTitulo = re.test(v.titulo);
      const linea = enTitulo ? null : lineas.find((l) => re.test(l));
      if (enTitulo || linea) {
        const trozo = linea ? linea.trim().replace(/^\d{1,2}:\d{2}(?::\d{2})?\s*[-–]?\s*/, '') : '';
        const m = `«${v.titulo}»${donde} lleva «${palabra}» ${enTitulo ? 'en el título' : `en la descripción (${trozo.length > 70 ? '«' + trozo.slice(0, 68).trim() + '…»' : '«' + trozo + '»'})`}: ${nota}.`;
        avisos.push({ i: '🔤', t: m });
        arreglos.push(corto(v.titulo));
      }
    }
    // (Las mayúsculas no se avisan: el estilo de títulos y miniaturas se está redactando con Abby.)
    for (const [exacto, nota] of ERRATAS) {
      if (v.titulo === exacto) {
        avisos.push({ i: '🔤', t: `«${v.titulo}»${donde}: ${nota}` });
        arreglos.push(corto(v.titulo));
      }
    }
  }
  if (privados.length) {
    avisos.push({ i: '📌', t: `${privados.length === 1 ? 'Tienes 1 vídeo largo' : `Tienes ${privados.length} vídeos largos`} sin publicar: ${unir(privados.slice(0, 4).map((v) => `«${corto(v.titulo)}»`))}. Cuando los publiques aparecerán aquí solos.` });
  }
  if (V.length && V.some((v) => v.dias <= 3)) {
    avisos.push({ i: '⏳', t: `Los vídeos de los últimos días todavía no tienen datos completos: YouTube los entrega con 2-3 días de retraso.` });
  }
  if (origenAlcance === 'ninguna') {
    avisos.push({ i: '🕐', t: 'Las impresiones y los clics (CTR) de YouTube todavía no han llegado: los informes tardan hasta 48 horas desde que se pidieron.' });
  } else if (origenAlcance === 'studio' || origenAlcance === 'mixta') {
    avisos.push({ i: '🕐', t: `Las impresiones y clics de ${origenAlcance === 'studio' ? 'todos los vídeos' : 'los vídeos anteriores al 9 de septiembre'} salen de una copia de Studio hecha en octubre (6 y 12). ${origenAlcance === 'studio' ? 'Los informes de YouTube sustituirán estas cifras en cuanto lleguen.' : 'Los demás se actualizan solos con los informes de YouTube.'}` });
  }

  /* --- las acciones de la semana --- */
  const acciones = [];
  const orden = { alto: 3, medio: 2, bajo: 1 };
  if (arranqueFlojo.length) {
    const peor = [...arranqueFlojo].sort((a, b) => a.rel60 - b.rel60)[0];
    acciones.push({
      icono: '🎬', titulo: arranqueFlojo.length === 1 ? `Rehaz el arranque de «${peor.titulo}»` : 'Rehaz el arranque de los vídeos que lo tienen flojo',
      que: 'La primera frase es la escena de la miniatura; la pregunta, hacia los 20 segundos; y el primer «porque» antes del minuto, en lugar de anunciar «hoy te cuento tres cosas».',
      porque: `En «${peor.titulo}» se va el ${Math.round(100 - peor.ret60)} % de la gente antes del minuto y YouTube lo sitúa muy por debajo de los vídeos de su duración (${rel2(peor.rel60)}).`,
      impacto: 'alto', esfuerzo: 'medio', certeza: certezaMuestra(peor.vistas),
    });
  }
  if (conFinal.length >= 3 && finalBajo.length / conFinal.length >= 0.5) {
    const xs = conFinal.map((v) => v.rel90);
    acciones.push({
      icono: '🏁', titulo: 'Revisa el cierre de tus vídeos',
      que: 'Mira qué dices en el último 15 %: si repites lo ya dicho antes de la llamada al test, acórtalo. Es donde va el test, así que cada punto que retengas ahí es gente que lo oye.',
      porque: `Hacia el 90 % del vídeo, ${finalBajo.length} de ${conFinal.length} quedan por debajo de la mediana de los vídeos de su duración (entre ${rel2(Math.min(...xs))} y ${rel2(Math.max(...xs))}). Es una hipótesis: conviene escuchar ese tramo antes de cambiarlo.`,
      impacto: 'alto', esfuerzo: 'medio', certeza: 'media-baja',
    });
  }
  {
    // Empaquetado: el estilo de títulos y miniaturas se está redactando con Abby (no hay norma vigente).
    const a = resumenPaq.antes.poco;
    const s = resumenPaq.sobrio.poco;
    const nuevo = resumenPaq.nuevo.poco;
    const hayDato = a.n >= 3 && s.n >= 2;
    acciones.push({
      icono: '📦', titulo: 'Decide el empaquetado de los próximos vídeos',
      que: 'Mira en «Tus paquetes» qué tenían los vídeos que más clics sacaron (texto, elementos de la miniatura, cara) y fija con Igor el estilo de título y miniatura. Cada miniatura nueva, con una variante B que cambie una sola cosa.',
      porque: hayDato
        ? `Con menos de 1.000 impresiones, el CTR fue del ${dec(a.ctr)} % antes de septiembre (${a.n} vídeos) y del ${dec(s.ctr)} % desde entonces (${s.n} vídeos)${nuevo.n ? `; desde el 12/10, ${dec(nuevo.ctr)} % (${nuevo.n} ${nuevo.n === 1 ? 'vídeo' : 'vídeos'})` : ''}.`
        : 'Los datos se irán llenando solos.',
      impacto: 'alto', esfuerzo: 'bajo', certeza: hayDato ? 'media-alta' : 'media',
    });
  }
  if (arreglos.length) {
    const nVideos = new Set(arreglos).size;
    acciones.push({
      icono: '✏️', titulo: 'Arregla los avisos de títulos y descripciones',
      que: `Hay ${arreglos.length} ${arreglos.length === 1 ? 'cosa' : 'cosas'} que corregir en ${nVideos} ${nVideos === 1 ? 'vídeo' : 'vídeos'} (palabras que no se usan o erratas). Están en la sección de avisos, más abajo.`,
      porque: 'Es gratis y son fallos que luego se ven en el feed.', impacto: 'medio', esfuerzo: 'bajo', certeza: 'alta',
    });
  }
  acciones.push({
    icono: '🧪', titulo: 'Cambia una sola cosa por vídeo',
    que: 'O el arranque, o la miniatura, o el título. Así sabes qué ha movido el número.',
    porque: 'Con tan pocas vistas, si cambias tres cosas a la vez no hay manera de saber cuál funcionó.',
    impacto: 'medio', esfuerzo: 'bajo', certeza: 'alta',
  });
  if (recientes.length) {
    const r = recientes.slice(0, 2);
    const estado = (v) => (v.dias <= 0
      ? `«${v.titulo}» se ha publicado hace nada y YouTube tarda 2-3 días en dar los primeros datos`
      : `«${v.titulo}» lleva ${v.dias} ${v.dias === 1 ? 'día' : 'días'}${v._al ? ` y ${miles(v._al.impr)} impresiones` : ''}`);
    acciones.push({
      icono: '⏳', titulo: `Espera antes de juzgar ${unir(r.map((v) => `«${v.titulo}»`))}`,
      que: `Vuelve a mirar ${unir(r.map((v) => `«${v.titulo}» hacia el ${dia(masDias(v.pub, 14))}`))}.`,
      porque: r.map(estado).join('; ') + '.' + (repartidos.length ? ` En «${repartidos[0].titulo}», la primera semana ya sumaba ${miles(repartidos[0].semana1)} impresiones.` : ''),
      impacto: 'bajo', esfuerzo: 'ninguno', certeza: 'media',
    });
  }
  const pesoEsfuerzo = { ninguno: 0, bajo: 1, medio: 2 };
  const pesoCerteza = { alta: 5, 'media-alta': 4, media: 3, 'media-baja': 2, baja: 1 };
  acciones.sort((a, b) => (orden[b.impacto] - orden[a.impacto]) || (pesoCerteza[b.certeza] - pesoCerteza[a.certeza]) || (pesoEsfuerzo[a.esfuerzo] - pesoEsfuerzo[b.esfuerzo]));

  const noTocar = cuerpoAguanta
    ? `el cuerpo de tus guiones: a mitad del vídeo, ${mitadBien.length} de ${conMitad.length} están cerca de la mediana de los vídeos de su duración o por encima.`
    : null;

  /* --- la curva de retención --- */
  const ret = { min: V.map((v) => v._c?.min || null), todo: V.map((v) => v._c?.todo || null) };
  const ocultosInicio = V.map((v, i) => (v._c && v.vistas >= 35 ? null : i)).filter((i) => i != null);

  /* --- frente a otros vídeos de su duración --- */
  const rel = {
    cols: ['30 s', '1 min', '25 %', 'mitad', '80 %', '90 %'],
    filas: V.map((v, i) => (v._c && v.vistas >= 20 ? { v: i, vals: [v.rel30, v.rel60, v.rel25, v.rel50, v.rel80, v.rel90].map((x) => (x == null ? null : Math.round(x * 100) / 100)) } : null)).filter(Boolean),
  };

  /* --- impresiones por día --- */
  const diaSeries = V.map((v, i) => ({ v: i, datos: (v._al?.dias || []).slice(0, 14) }))
    .filter((s) => s.datos.length >= 5)
    .slice(0, 5);
  let notaDia = '';
  {
    const a = V.find((v) => v.reparto === 'amplió' || v.reparto === 'mantuvo');
    const s = V.find((v) => v.reparto === 'soltó');
    const partes = [];
    if (a) partes.push(`«${a.titulo}» se ${a.reparto === 'amplió' ? 'amplía' : 'sostiene'}`);
    if (s) partes.push(`«${s.titulo}» tuvo ${miles(s._al.dias[0])} el primer día y cae a unos ${miles(mediana(s._al.dias.slice(2, 12)))}`);
    notaDia = partes.length ? partes.join('; ') + '.' : '';
  }

  /* --- de dónde llega la gente --- */
  const origenFilas = V.map((v, i) => ({ vid: i, v: v.origen, tot: v.origen.reduce((s, x) => s + x, 0) })).filter((o) => o.tot >= 20).slice(0, 6);

  /* --- CTR por origen --- */
  const ctrOrigen = [];
  const tiras = [
    { k: 'sug', nombre: 'Sugeridos (gente que no te conoce)', ref: [3, 6], paso: 2 },
    { k: 'exp', nombre: 'Inicio y exploración', ref: [3, 6], paso: 2 },
    { k: 'bus', nombre: 'Búsqueda', ref: [6, 12], paso: 5 },
    { k: 'can', nombre: 'Páginas de canal (gente que ya te conoce)', ref: [8, 15], paso: 5 },
  ];
  for (const t of tiras) {
    const pts = V.map((v, i) => ({ v: i, g: v._al?.fuentes?.[t.k] })).filter((p) => p.g && p.g.impr >= 20 && p.g.ctr != null)
      .map((p) => ({ v: p.v, ctr: Math.round(p.g.ctr * 10) / 10, impr: Math.round(p.g.impr) })).slice(0, 8);
    if (!pts.length) continue;
    const mx = Math.max(t.ref[1], ...pts.map((p) => p.ctr));
    const max = Math.ceil(mx / t.paso) * t.paso + (mx % t.paso === 0 ? t.paso : 0);
    ctrOrigen.push({ nombre: t.nombre, ref: t.ref, max: Math.max(max, t.ref[1] + t.paso), paso: t.paso, puntos: pts });
  }

  /* --- miniaturas frente a clics --- */
  const miniaturas = conSug.map((v) => ({ v: V.indexOf(v), ctr: Math.round(v.ctrSug * 10) / 10, impr: Math.round(v.imprSug) }))
    .sort((a, b) => b.ctr - a.ctr).slice(0, 8);

  /* --- quién los ve --- */
  const aud = V.map((v, i) => ({ v: i, s: v.sus })).filter((x) => x.s.SUBSCRIBED || x.s.UNSUBSCRIBED)
    .filter((x) => V[x.v].vistas >= 20).slice(0, 6)
    .map((x) => {
      const si = x.s.SUBSCRIBED || { vistas: 0, avd: 0 };
      const no = x.s.UNSUBSCRIBED || { vistas: 0, avd: 0 };
      const t = si.vistas + no.vistas;
      return { v: x.v, noP: Math.round((no.vistas / t) * 100), noAvd: dur(no.avd), siP: Math.round((si.vistas / t) * 100), siAvd: dur(si.avd), noAvdS: no.avd, siAvdS: si.avd };
    });

  /* --- las frases de «qué significa» y «qué hago» --- */
  const trad = {};
  trad.semaforo = {
    sig: 'Son cuatro preguntas distintas. «Reparto» lo decide YouTube y no mide interés. «Te eligen» es si la gente que no te conoce hace clic. «Al minuto» y «El final» comparan tu vídeo con los de su misma duración (dato oficial de YouTube): 0,5 es la mediana.',
    hago: 'Poco reparto y buenos clics: paciencia o más vídeos del mismo tema. Mucho reparto y pocos clics: cambia miniatura o título. Buenos clics y mal minuto: cambia el arranque. Buen minuto y mal final: revisa el cierre.',
  };
  trad.curvas = {
    sig: 'Al principio siempre se va mucha gente; es normal. Lo que importa es la forma: una caída fuerte seguida de una línea casi plana quiere decir que el contenido retiene a quien se queda.' +
      (perdida1.length ? ` En tus vídeos con gente fría se va entre el ${Math.min(...perdida1)} y el ${Math.max(...perdida1)} % en el primer minuto` +
        (llegan80.length ? `, y de los que llegan al primer cuarto siguen hasta el 80 % entre ${Math.min(...llegan80)} y ${Math.max(...llegan80)} de cada 10.` : '.') : ''),
    hago: 'Antes de reescribir nada, mira el bloque de abajo: solo conviene tocar lo que queda por debajo de lo normal para vídeos de su duración.',
  };
  {
    const base40 = conCurva.filter((v) => v.vistas >= 40);
    const conMin = base40.filter((v) => v.rel60 != null);
    const bienMin = conMin.filter((v) => v.rel60 >= REL_BIEN);
    const malos = conMin.filter((v) => v.rel60 < REL_REGULAR).map((v) => `«${v.titulo}»`);
    const conFin = base40.filter((v) => v.rel90 != null);
    const bajoFin = conFin.filter((v) => v.rel90 < REL_BIEN);
    trad.rel = {
      sig: 'YouTube compara cada punto de tu vídeo con todos los vídeos de duración parecida. 0,5 es la mediana: la mitad lo hace mejor y la mitad peor. Por debajo de 0,35 es flojo; de 0,5 para arriba, bien. Es el dato que dice si una cifra es buena o mala para ese tipo de vídeo.',
      hago: conMin.length
        ? `Cuento solo los vídeos con 40 vistas o más. Al minuto, ${bienMin.length} de ${conMin.length} están en la mediana o por encima${malos.length ? `; el que queda claramente por debajo es ${unir(malos)}` : ''}. En el final (90 %), ${bajoFin.length} de ${conFin.length} quedan por debajo de la mediana${bajoFin.length / (conFin.length || 1) >= 0.5 ? ': revisa el cierre antes de reescribir aperturas' : ''}.`
        : 'Cuando haya vídeos con suficientes vistas, aquí te diré cuáles tocar.',
    };
  }
  trad.r80 = {
    sig: 'Es cuántas de cada 100 personas que empezaron siguen cuando llevas el 80 % y el 90 % del vídeo.' +
      (rg80 && rg90 ? ` Con gente fría tienes entre el ${Math.min(rg90[0], rg80[0])} y el ${Math.max(rg80[1], rg90[1])} %.` : '') +
      ' También es cuánta gente oye tu llamada al test al final.',
    hago: rg90
      ? `El test va solo al final: lo oye, hacia el 90 % del vídeo, entre el ${rg90[0]} y el ${rg90[1]} % del público frío. Cada punto que retengas en el cierre es gente que lo oye.`
      : 'El test va solo al final: cada punto que retengas en el cierre es gente que lo oye.',
  };
  trad.dia = {
    sig: 'YouTube prueba cada vídeo con un grupo pequeño y mira qué pasa. Si funciona lo sostiene o lo amplía (la línea se mantiene o sube); si no, lo suelta (cae tras el primer día).',
    hago: 'No juzgues un vídeo a las 48 horas: mira del día 3 al 7. Si cae pronto, suele ser un problema de clic o de arranque, no del tema.',
  };
  {
    const b = V.find((v) => v.pBus >= 40 && v.vistas >= 40);
    trad.origen = {
      sig: 'La gente de sugeridos e inicio no te buscaba: YouTube te la enseña. La de búsqueda y la de tu página de canal venía a por ti y se queda más.' +
        (b ? ` «${b.titulo}» es casi todo búsqueda: poca gente, pero muy buena.` : ''),
      hago: 'Para llegar a gente nueva, escena y miniatura claras (sugeridos e inicio). Para el fondo del canal, títulos con la palabra que la gente teclea (búsqueda).',
    };
  }
  {
    const sugAg = (() => {
      const xs = V.filter((v) => v._al?.fuentes?.sug && v._al.fuentes.sug.impr >= 20);
      const n = xs.reduce((s, v) => s + v._al.fuentes.sug.impr, 0);
      return n >= 300 ? (xs.reduce((s, v) => s + v._al.fuentes.sug.clics, 0) / n) * 100 : null;
    })();
    trad.ctr = {
      sig: 'El CTR cambia según de dónde llegue la gente: en búsqueda y entre tu gente es alto; en sugeridos, con gente fría, es más bajo.' +
        (sugAg != null ? ` Tu ${dec(sugAg)} % en sugeridos está ${sugAg < 2 ? 'por debajo de' : sugAg < 3 ? 'en el borde bajo de' : 'dentro de'} lo habitual (YouTube dice que la mitad de los canales está entre el 2 y el 10 %).` : '') +
        ' Fíjate sobre todo en los puntos grandes: son los que tienen muchas impresiones.',
      hago: sugAg != null && sugAg < CTR_BIEN
        ? `Meta razonable: subir sugeridos del ${dec(sugAg)} % al ${CTR_BIEN} %, con cambios de una sola cosa en miniatura o título.`
        : 'Mantén lo que haces y cambia una sola cosa por vídeo para saber qué mueve el número.',
    };
  }
  trad.miniaturas = {
    sig: 'Miniaturas ordenadas de más a menos clics en sugeridos (gente que no te conoce). Las de los primeros vídeos llevaban más elementos del tema, un texto corto en pregunta o acusación con una palabra en color y una cara con emoción clara; las de septiembre-octubre, un fragmento de una frase y casi ningún objeto.',
    hago: 'Prueba por pares: la miniatura nueva con una variante B que cambie solo una cosa, y compara el CTR a igual volumen de impresiones.',
  };
  trad.paquetes = {
    sig: 'Cada fila es un vídeo con su título, el texto de su miniatura y el CTR de toda su vida. El CTR baja solo al crecer las impresiones (YouTube lo enseña a gente más fría), por eso se compara por debajo y por encima de 1.000 impresiones.',
    hago: (() => {
      const f = (g) => (g && g.ctr != null ? `${dec(g.ctr)} % (${g.n})` : '—');
      const p = resumenPaq;
      return `Con poco volumen: antes de septiembre ${f(p.antes.poco)}, septiembre-octubre ${f(p.sobrio.poco)}${p.nuevo.poco.n ? `, desde el 12/10 ${f(p.nuevo.poco)}` : ''}. ` +
        `Con mucho: ${f(p.antes.mucho)}, ${f(p.sobrio.mucho)}${p.nuevo.mucho.n ? `, desde el 12/10 ${f(p.nuevo.mucho)}` : ''}. ` +
        'Los vídeos publicados desde el 12 de octubre aparecen aparte, en la última fila: ahí se ve si el CTR vuelve.';
    })(),
  };
  {
    const grandes = V.filter((v) => v.noSigue != null && v.vistas >= 100);
    const w = grandes.reduce((s, v) => s + v.vistas, 0);
    const pFrio = w ? Math.round(grandes.reduce((s, v) => s + v.noSigue * v.vistas, 0) / w) : null;
    const compara = aud.filter((a) => a.siP > 0 && a.noP > 0);
    const mas = compara.filter((a) => a.siAvdS > a.noAvdS).length;
    const sTot = V.filter((v) => v.vistas >= 40).reduce((s, v) => s + (v.subs || 0), 0);
    const vTot = V.filter((v) => v.vistas >= 40).reduce((s, v) => s + v.vistas, 0);
    trad.aud = {
      sig: (pFrio != null ? `Casi todo lo que ves es gente fría (alrededor del ${pFrio} %). ` : '') +
        (compara.length ? `Quien ya te sigue se queda más tiempo en ${mas} de ${compara.length} vídeos. ` : '') +
        `Es buena señal para el contenido, pero también dice que casi nadie pasa de ver el vídeo a seguirte: ${sTot} suscriptores con ${miles(vTot)} vistas.`,
      hago: 'Nada que cambiar ahora: tu única llamada es el test, y los suscriptores llegan como consecuencia de vídeos que retienen. Vigílalo con el tiempo.',
    };
  }

  const dic = [
    { t: 'Impresión', d: 'Una vez que YouTube enseña tu miniatura a alguien. Es lo que reparte YouTube, no interés.' },
    { t: 'CTR', d: 'De cada 100 impresiones, cuántas acaban en clic.' },
    { t: 'Sugeridos', d: 'Tu vídeo aparece al lado de otro que alguien está viendo. Gente que no te buscaba.' },
    { t: 'Inicio y exploración', d: 'La página de inicio de YouTube y la pestaña de suscripciones.' },
    { t: 'Búsqueda y página de canal', d: 'Gente que escribió algo o entró en tu canal: venía a por ti.' },
    { t: 'Retención', d: 'De cada 100 que empiezan el vídeo, cuántas siguen en ese momento.' },
    { t: 'Frente a otros vídeos de su duración', d: 'Dato oficial de YouTube: compara tu retención con la de todos los vídeos de duración parecida. 0,5 es la mediana.' },
    { t: 'Duración media y % visto', d: 'Lo que ve cada persona de media, y qué parte del vídeo es.' },
    { t: 'Visualizaciones interesadas', d: 'Las que pasan de los primeros segundos.' },
    { t: 'Gente fría', d: 'Quien no te sigue ni te buscaba.' },
    { t: 'Certeza', d: 'Cuánto me fío de la conclusión según cuántos datos hay. Con pocas vistas, nunca es alta.' },
  ];

  const videosOut = V.map((v) => {
    const { _al, _c, ...resto } = v;
    for (const k of Object.keys(resto)) if (typeof resto[k] === 'number' && !Number.isInteger(resto[k])) resto[k] = Math.round(resto[k] * 100) / 100;
    return resto;
  });

  return {
    version: 1,
    meta: {
      generado: ahora, datosHasta, alcance: origenAlcance,
      nLargos: V.length, nPrivados: privados.length,
    },
    vistazo, acciones: acciones.slice(0, 7), noTocar,
    veredicto: [
      { clase: 'bien', icono: '💚', titulo: 'Va bien', items: bien },
      { clase: 'mal', icono: '🌧️', titulo: 'Falla', items: mal },
      { clase: 'ojo', icono: '👀', titulo: 'A vigilar', items: ojo },
    ],
    videos: videosOut, ret, ocultosInicio, rel,
    dia: { series: diaSeries, nota: notaDia },
    origen: { nombres: NOMBRES_GRUPO, filas: origenFilas },
    ctrOrigen, miniaturas,
    paquetes: {
      filas: listaPaq.map((p) => ({
        id: p.id, titulo: p.titulo, mini: p.mini || null, pub: p.pub, fecha: dia(p.pub), impr: Math.round(p.impr),
        ctr: Math.round(p.ctr * 10) / 10, vistas: p.vistas ?? null, era: eraDe(p), noPublico: !!p.privado, origen: p.origen,
      })),
      resumen: resumenPaq, cambios,
    },
    aud, avisos, trad, dic,
    chips: ['¿Qué hago esta semana?', '¿Dónde pierdo más gente?', '¿Qué miniatura funciona mejor?', '¿Es bueno mi CTR?', '¿Cuándo se actualizan los datos?'],
  };
}
