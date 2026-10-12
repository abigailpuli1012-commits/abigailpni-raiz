// Convierte los datos de los Shorts en lo que enseña la pestaña «Shorts» del panel: las cifras, la clasificación
// de cada Short y las conclusiones («qué significa» y «qué hago»).
//
// Igual que panel/analisis.js, se ejecuta en el NAVEGADOR de Abby y en las pruebas locales. Es una función pura:
// recibe datos y devuelve datos. Todo lo que escribe son frases sin etiquetas: la pantalla las pinta como texto.
//
// De los Shorts YouTube da vistas, tiempo visto, % visto, suscriptores, «me gusta» y compartidos, de dónde llegan y
// quién los ve. NO da impresiones ni «vistos frente a deslizados»: lo que no se puede medir no se inventa.

import { PALABRAS_VETADAS } from './analisis.js';

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

// Umbrales propuestos (se ajustan aquí, en un solo sitio).
const GIRO = '2026-08-09'; // primer largo del giro hacia el digestivo
const MIN_VISTAS = 200; // por debajo, el % visto de un Short no dice nada
const RECIENTE = 3; // días: YouTube todavía no ha completado las cifras
const META_VISTO = 60; // % visto que se propuso en el manual de reels
const DIA_MUERTO = 50; // un día con menos vistas que esto es un día sin Short «vivo»
const LARGO_CORTO = 50; // segundos: tope duro de un Short en el manual de reels

/* ---------- utilidades ---------- */
const miles = (n) => Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
const dec = (x, d = 1) => x.toFixed(d).replace('.', ',');
const pc = (x) => `${Math.round(x)} %`;
const solo = (iso) => iso.slice(0, 10);
const msDia = (iso) => Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10));
const diasEntre = (a, b) => Math.round((msDia(b) - msDia(a)) / 86400000);
const masDias = (iso, n) => new Date(msDia(iso) + n * 86400000).toISOString().slice(0, 10);
const dia = (iso) => `${Number(iso.slice(8, 10))} ${MESES[Number(iso.slice(5, 7)) - 1]}`;
const mediana = (xs) => {
  if (!xs.length) return null;
  const o = [...xs].sort((a, b) => a - b);
  const m = o.length >> 1;
  return o.length % 2 ? o[m] : (o[m - 1] + o[m]) / 2;
};
const percentil = (xs, p) => {
  if (!xs.length) return null;
  const o = [...xs].sort((a, b) => a - b);
  return o[Math.min(o.length - 1, Math.max(0, Math.round((o.length - 1) * p)))];
};
const unir = (xs) => (xs.length <= 1 ? xs.join('') : xs.slice(0, -1).join(', ') + ' y ' + xs[xs.length - 1]);
function corto(t) {
  const s = String(t || '').replace(/\s+/g, ' ').trim();
  if (s.length <= 40) return s;
  const c = s.slice(0, 40);
  const i = c.lastIndexOf(' ');
  return (i > 20 ? c.slice(0, i) : c.slice(0, 39)).replace(/[ ,.:;¿?¡!(]+$/, '') + '…';
}
const certezaMuestra = (vistas) => (vistas >= 800 ? 'media-alta' : vistas >= 300 ? 'media' : vistas >= 100 ? 'media-baja' : 'baja');
const ponderado = (xs, f) => {
  const w = xs.reduce((s, x) => s + x.vistas, 0);
  return w ? xs.reduce((s, x) => s + f(x) * x.vistas, 0) / w : null;
};
const porMil = (xs, k) => {
  const w = xs.reduce((s, x) => s + x.vistas, 0);
  return w ? (xs.reduce((s, x) => s + x[k], 0) / w) * 1000 : null;
};

/* ---------- de dónde llega la gente ---------- */
const ORIGEN = [
  { n: 'Feed de Shorts', c: '#E79BB0' }, { n: 'Búsqueda', c: '#F0A878' }, { n: 'Tu canal y otras páginas', c: '#6FC3A4' },
  { n: 'Gente que te sigue (suscriptores y avisos)', c: '#B98DC9' }, { n: 'Otros', c: '#D8CBD1' },
];
function grupoOrigen(tipo) {
  if (tipo === 'SHORTS') return 0;
  if (tipo === 'YT_SEARCH') return 1;
  if (tipo === 'YT_CHANNEL' || tipo === 'YT_OTHER_PAGE') return 2;
  if (tipo === 'SUBSCRIBER' || tipo === 'NOTIFICATION') return 3;
  return 4;
}

export function construirShorts(e) {
  const c = e && e.cortos;
  if (!c || !Array.isArray(c.filas) || !c.filas.length) return null;
  const ahora = e.ahora || new Date().toISOString();
  const hoy = solo(ahora);
  const fin = c.hasta || masDias(hoy, -3);
  const info = new Map((c.lista || []).map((x) => [x.id, x]));

  /* --- un objeto por Short --- */
  const todos = c.filas.map((f) => {
    const x = info.get(f[0]);
    if (!x || !x.publicado) return null;
    const pub = solo(x.publicado);
    const vistas = f[1];
    return {
      id: f[0], titulo: x.titulo, corto: corto(x.titulo), pub, fecha: dia(pub), durS: x.dur, vistas, minutos: f[2], avd: f[3],
      pct: f[4], subs: f[5], likes: f[6], shares: f[7], comments: f[8], publico: x.privacidad === 'public',
      dias: diasEntre(pub, hoy), reciente: diasEntre(pub, hoy) <= RECIENTE,
      subsMil: vistas ? (f[5] / vistas) * 1000 : 0, likesMil: vistas ? (f[6] / vistas) * 1000 : 0,
    };
  }).filter(Boolean);
  const privados = todos.filter((s) => !s.publico);
  const S = todos.filter((s) => s.publico).sort((a, b) => b.vistas - a.vistas);
  if (!S.length) return null;
  const desdeGiro = S.filter((s) => s.pub >= GIRO);
  const antesGiro = S.filter((s) => s.pub < GIRO);
  const firmes = (xs) => xs.filter((s) => !s.reciente && s.vistas >= MIN_VISTAS);
  const giroFirmes = firmes(desdeGiro);
  const recientes = S.filter((s) => s.reciente);

  /* --- las vistas por día --- */
  const dias = (c.dias || []).slice().sort((a, b) => a[0].localeCompare(b[0]));
  const suma = (a, b) => dias.filter((d) => d[0] >= a && d[0] <= b).reduce((s, d) => s + d[1], 0);
  const v28 = suma(masDias(fin, -27), fin);
  const p28 = suma(masDias(fin, -55), masDias(fin, -28));
  const cambio = p28 >= 300 ? (v28 / p28 - 1) * 100 : null;
  const pubs28 = S.filter((s) => s.pub >= masDias(fin, -27) && s.pub <= fin).length;
  const pubsPrev = S.filter((s) => s.pub >= masDias(fin, -55) && s.pub <= masDias(fin, -28)).length;

  const pubPorDia = {};
  for (const s of S) pubPorDia[s.pub] = (pubPorDia[s.pub] || 0) + 1;
  const ventana = dias.filter((d) => d[0] > masDias(fin, -60));
  const serieDias = ventana.map((d) => ({ d: d[0], v: d[1], p: pubPorDia[d[0]] || 0 }));
  // ¿Tienen cola los Shorts? Se mira qué pasa los días en que se publicó (o se publicó el día antes) y los demás.
  const vivos = ventana.filter((d) => pubPorDia[d[0]] || pubPorDia[masDias(d[0], -1)]).map((d) => d[1]);
  const quietos = ventana.filter((d) => !pubPorDia[d[0]] && !pubPorDia[masDias(d[0], -1)]).map((d) => d[1]);
  const diasMuertos = ventana.filter((d) => d[1] < DIA_MUERTO).length;
  const medVivos = mediana(vivos);
  const medQuietos = mediana(quietos);
  const sinCola = vivos.length >= 8 && quietos.length >= 8 && medVivos > 0 && medQuietos != null && medQuietos <= medVivos * 0.1;
  // La mejor racha (días seguidos publicando) y el mayor hueco (días seguidos sin publicar).
  let racha = null;
  let actual = null;
  let hueco = null;
  let sin = null;
  for (const d of ventana) {
    if (pubPorDia[d[0]]) {
      actual = actual ? { ...actual, hasta: d[0], vals: [...actual.vals, d[1]] } : { desde: d[0], hasta: d[0], vals: [d[1]] };
      if (!racha || actual.vals.length > racha.vals.length) racha = actual;
      sin = null;
    } else {
      actual = null;
      sin = sin ? { ...sin, hasta: d[0], vals: [...sin.vals, d[1]] } : { desde: d[0], hasta: d[0], vals: [d[1]] };
      if (!hueco || sin.vals.length > hueco.vals.length) hueco = sin;
    }
  }
  // ¿Suma el doble publicar dos Shorts el mismo día? Se compara con los días con uno solo.
  const dobles = ventana.filter((d) => (pubPorDia[d[0]] || 0) >= 2);
  const unos = ventana.filter((d) => pubPorDia[d[0]] === 1).map((d) => d[1]);
  const medUnos = unos.length >= 6 ? mediana(unos) : null;
  const dobleNoSuma = dobles.length >= 1 && medUnos != null && dobles.every((d) => d[1] < medUnos * 1.5);
  const hayRacha = racha && racha.vals.length >= 5;
  const hayHueco = hueco && hueco.vals.length >= 4 && Math.max(...hueco.vals) < DIA_MUERTO * 2;

  /* --- el % visto, la duración y los suscriptores --- */
  const pctGiro = giroFirmes.length >= 5 ? ponderado(giroFirmes, (s) => s.pct) : null;
  const pctAntes = antesGiro.length >= 5 ? ponderado(firmes(antesGiro), (s) => s.pct) : null;
  const durGiro = mediana(giroFirmes.map((s) => s.durS));
  const durAntes = mediana(firmes(antesGiro).map((s) => s.durS));
  const subsMilShorts = desdeGiro.length ? porMil(desdeGiro, 'subs') : null;
  const lar = e.largos || null;
  // Los largos solo se comparan si tienen suscriptores suficientes: con 5 o 6 el cociente no vale nada.
  const subsMilLargos = lar && lar.vistas >= 500 && lar.subs >= 10 ? (lar.subs / lar.vistas) * 1000 : null;
  const pocosLargos = lar && lar.vistas > 0 && subsMilLargos == null ? lar : null;

  const cubos = [['Menos de 30 s', 0, 30], ['30 a 39 s', 30, 40], ['40 a 49 s', 40, 50], ['50 s o más', 50, 9999]].map(([nombre, lo, hi]) => {
    const xs = giroFirmes.filter((s) => s.durS >= lo && s.durS < hi);
    return {
      nombre, n: xs.length, vistasMed: xs.length ? Math.round(mediana(xs.map((s) => s.vistas))) : null,
      pct: xs.length ? Math.round(ponderado(xs, (s) => s.pct) * 10) / 10 : null,
      subsMil: xs.length ? Math.round(porMil(xs, 'subs') * 100) / 100 : null,
    };
  });
  const cuboLargo = cubos[3];
  const cubosOtros = giroFirmes.filter((s) => s.durS < LARGO_CORTO);
  const largosPocos = cuboLargo.n >= 4 && cubosOtros.length >= 6
    && cuboLargo.vistasMed < mediana(cubosOtros.map((s) => s.vistas)) * 0.7;

  /* --- cuánto reparte YouTube a cada Short --- */
  const vistasFirmes = firmes(S).map((s) => s.vistas);
  const dist = {
    n: vistasFirmes.length, p25: percentil(vistasFirmes, 0.25), mediana: mediana(vistasFirmes), p75: percentil(vistasFirmes, 0.75),
    max: S[0].vistas, top5: S.slice(0, 5).reduce((s, x) => s + x.vistas, 0), total: S.reduce((s, x) => s + x.vistas, 0),
  };
  const planos = dist.n >= 15 && dist.max < dist.mediana * 4;

  /* --- el origen y la audiencia --- */
  const origenV = [0, 0, 0, 0, 0];
  for (const f of c.fuentes || []) origenV[grupoOrigen(f[0])] += f[1] || 0;
  const origenTot = origenV.reduce((s, x) => s + x, 0);
  const sus = {};
  for (const f of c.sus || []) sus[f[0]] = { vistas: f[1], avd: f[2] };
  const siV = (sus.SUBSCRIBED && sus.SUBSCRIBED.vistas) || 0;
  const noV = (sus.UNSUBSCRIBED && sus.UNSUBSCRIBED.vistas) || 0;
  const aud = siV + noV >= 200
    ? { noP: Math.round((noV / (siV + noV)) * 100), siP: Math.round((siV / (siV + noV)) * 100), noAvd: Math.round(sus.UNSUBSCRIBED ? sus.UNSUBSCRIBED.avd : 0), siAvd: Math.round(sus.SUBSCRIBED ? sus.SUBSCRIBED.avd : 0) }
    : null;

  /* --- las clasificaciones --- */
  const retenedores = [...giroFirmes].filter((s) => s.pct >= 65 && s.vistas >= 500).sort((a, b) => b.pct - a.pct).slice(0, 4);
  const seCaen = [...giroFirmes].filter((s) => s.pct < 35 && s.vistas >= 250).sort((a, b) => a.pct - b.pct).slice(0, 3);
  const mediaPct = giroFirmes.length ? ponderado(giroFirmes, (s) => s.pct) : null;
  const bucles = S.filter((s) => s.pct > 100 && s.vistas >= 25).length;

  /* --- avisos --- */
  const avisos = [];
  const arreglos = [];
  for (const s of S) {
    const texto = s.titulo.toLowerCase();
    for (const [palabra, re, nota] of PALABRAS_VETADAS) {
      if (re.test(texto)) { avisos.push({ i: '🔤', t: `«${s.titulo}» (${s.fecha}): lleva «${palabra}»; ${nota}.` }); arreglos.push(s.id); }
    }
  }
  if (recientes.length) avisos.push({ i: '⏳', t: `${recientes.length === 1 ? '1 Short tiene' : `${recientes.length} Shorts tienen`} menos de ${RECIENTE + 1} días: YouTube entrega sus cifras con 2-3 días de retraso, así que todavía no cuentan.` });
  if (privados.length) avisos.push({ i: '📌', t: `${privados.length === 1 ? 'Hay 1 Short' : `Hay ${privados.length} Shorts`} que no son públicos (privados o no listados): no cuentan en estas cifras.` });
  avisos.push({ i: '🧮', t: 'De los Shorts, YouTube no da las impresiones ni cuánta gente desliza al segundo: ese dato solo se ve en Studio, Short a Short.' });

  /* --- el veredicto --- */
  const bien = [];
  const mal = [];
  const ojo = [];
  if (cambio != null && cambio >= 20 && v28 >= 1000) {
    bien.push({ t: `Tus Shorts suman ${miles(v28)} vistas en los últimos 28 días, un ${dec(cambio, 0)} % más que en los 28 anteriores (${miles(p28)}). Ojo: también publicaste más (${pubs28} frente a ${pubsPrev}).`, c: 'media' });
  }
  if (retenedores.length >= 2) {
    bien.push({ t: `Retienen mucho más que el resto: ${unir(retenedores.map((s) => `«${s.corto}» (${pc(s.pct)} visto, ${s.durS} s)`))}.`, c: certezaMuestra(Math.min(...retenedores.map((s) => s.vistas))) });
  }
  if (aud && aud.siAvd > aud.noAvd * 1.2) {
    bien.push({ t: `La gente que ya te sigue se queda más: ${aud.siAvd} s de media frente a ${aud.noAvd} s de quien no te conoce.`, c: 'media-alta' });
  }
  if (sinCola) {
    mal.push({ t: `Tus Shorts no tienen cola: casi todas las vistas llegan el día que publicas o al siguiente (mediana de ${miles(medVivos)} vistas esos días frente a ${miles(medQuietos)} el resto). En los últimos 60 días, ${diasMuertos} días tuvieron menos de ${DIA_MUERTO} vistas.`, c: 'media-alta' });
  }
  if (planos) {
    mal.push({ t: `Ninguno ha despegado: la mitad se queda entre ${miles(dist.p25)} y ${miles(dist.p75)} vistas y el que más tiene llega a ${miles(dist.max)}. YouTube reparte a cada uno una cantidad parecida y se acaba.`, c: 'media-alta' });
  }
  if (pctGiro != null && pctAntes != null && pctAntes - pctGiro >= 4) {
    mal.push({ t: `El % visto ha bajado del ${pc(pctAntes)} al ${pc(pctGiro)} desde el giro hacia el digestivo. Parte se explica por la duración: ahora duran ${Math.round(durGiro)} s de mediana frente a ${Math.round(durAntes)} s antes.`, c: 'media' });
  }
  if (seCaen.length) {
    mal.push({ t: `Se caen pronto: ${unir(seCaen.map((s) => `«${s.corto}» (${pc(s.pct)} visto)`))}.`, c: certezaMuestra(Math.min(...seCaen.map((s) => s.vistas))) });
  }
  if (subsMilShorts != null && subsMilLargos != null && subsMilLargos >= subsMilShorts * 1.5) {
    ojo.push({ t: `Un Short trae ${dec(subsMilShorts)} suscriptores por cada 1.000 vistas; un largo, ${dec(subsMilLargos)}. Los Shorts sirven para que te vea gente nueva, no para ganar suscriptores.`, c: 'media-baja' });
  } else if (subsMilShorts != null) {
    ojo.push({ t: `Los Shorts traen ${dec(subsMilShorts)} suscriptores por cada 1.000 vistas.`, c: 'media-baja' });
  }
  if (largosPocos) {
    ojo.push({ t: `Los de ${LARGO_CORTO} s o más tienen la mitad de vistas: mediana de ${miles(cuboLargo.vistasMed)} frente a ${miles(mediana(cubosOtros.map((s) => s.vistas)))} de los más cortos (solo ${cuboLargo.n} Shorts: pista, no ley).`, c: 'baja' });
  }
  if (bucles) {
    ojo.push({ t: `${bucles === 1 ? 'Un Short supera' : `${bucles} Shorts superan`} el 100 % visto: se repiten en bucle porque duran menos de 25 s. No se comparan con los de 40 s.`, c: 'media' });
  }
  if (recientes.length) {
    ojo.push({ t: `${recientes.length === 1 ? '1 Short es' : `${recientes.length} Shorts son`} de los últimos ${RECIENTE + 1} días y todavía no tienen las cifras completas.`, c: 'media' });
  }

  /* --- las acciones --- */
  const acciones = [];
  const orden = { alto: 3, medio: 2, bajo: 1 };
  if (sinCola) {
    acciones.push({
      icono: '📆', titulo: 'Publica un Short cada día durante la semana del largo',
      que: 'Son 7 por largo: uno al día, sin dejar huecos. Si un día no hay Short nuevo, ese día prácticamente no hay vistas.',
      porque: (hayRacha ? `Del ${dia(racha.desde)} al ${dia(racha.hasta)} publicaste ${racha.vals.length} días seguidos y cada día sumó entre ${miles(Math.min(...racha.vals))} y ${miles(Math.max(...racha.vals))} vistas. ` : '')
        + (hayHueco ? `Del ${dia(hueco.desde)} al ${dia(hueco.hasta)}, sin publicar, las vistas fueron de ${miles(Math.min(...hueco.vals))} a ${miles(Math.max(...hueco.vals))} al día.` : `Los días sin Short nuevo tienen una mediana de ${miles(medQuietos)} vistas.`),
      impacto: 'alto', esfuerzo: 'medio', certeza: 'media-alta',
    });
  }
  if (retenedores.length >= 2) {
    acciones.push({
      icono: '✂️', titulo: 'Saca el siguiente Short con el esquema de los que más retienen',
      que: `Mira ${unir(retenedores.slice(0, 3).map((s) => `«${s.corto}»`))}: ${unir(retenedores.slice(0, 3).map((s) => `${s.durS} s`))}. Tu manual de reels dice que el arranque del largo suele ser el mejor Short y que el gancho nombra una escena concreta con dos variantes del síntoma.`,
      porque: `Retienen entre el ${Math.round(Math.min(...retenedores.map((s) => s.pct)))} y el ${Math.round(Math.max(...retenedores.map((s) => s.pct)))} %, frente al ${mediaPct != null ? pc(mediaPct) : '—'} de media de los demás desde el giro.`,
      impacto: 'alto', esfuerzo: 'medio', certeza: certezaMuestra(Math.min(...retenedores.map((s) => s.vistas))),
    });
  }
  if (largosPocos) {
    acciones.push({
      icono: '⏱️', titulo: `Mantén cada Short por debajo de ${LARGO_CORTO} s`,
      que: `Córtalo a 38-45 s (tope duro ${LARGO_CORTO}, como dice tu manual de reels) salvo que el gancho necesite más.`,
      porque: `Los de ${LARGO_CORTO} s o más tienen una mediana de ${miles(cuboLargo.vistasMed)} vistas y un ${pc(cuboLargo.pct)} visto, frente a ${miles(mediana(cubosOtros.map((s) => s.vistas)))} vistas y ${pc(ponderado(cubosOtros, (s) => s.pct))} de los demás. Son pocos: se confirma con los próximos.`,
      impacto: 'medio', esfuerzo: 'bajo', certeza: 'baja',
    });
  }
  if (seCaen.length) {
    acciones.push({
      icono: '🔎', titulo: 'No repitas el formato de los que se caen pronto',
      que: `Escucha ${unir(seCaen.map((s) => `«${s.corto}»`))} y compáralos con los que más retienen: ¿gancho sin recompensa? ¿consejo suelto sin mecanismo?`,
      porque: `Los ve entre el ${Math.round(Math.min(...seCaen.map((s) => s.pct)))} y el ${Math.round(Math.max(...seCaen.map((s) => s.pct)))} % de media, muy por debajo del resto.`,
      impacto: 'medio', esfuerzo: 'bajo', certeza: 'media-baja',
    });
  }
  if (arreglos.length) {
    const n = new Set(arreglos).size;
    acciones.push({
      icono: '✏️', titulo: 'Arregla los títulos con palabras vetadas',
      que: `Hay ${n} ${n === 1 ? 'Short' : 'Shorts'} con palabras que no se usan en el canal. Están en la sección de avisos, más abajo.`,
      porque: 'Es gratis y se ve en el feed.', impacto: 'bajo', esfuerzo: 'bajo', certeza: 'alta',
    });
  }
  if (recientes.length) {
    acciones.push({
      icono: '⏳', titulo: 'Espera antes de juzgar los Shorts de los últimos días',
      que: `Vuelve a mirar ${unir(recientes.slice(0, 3).map((s) => `«${s.corto}»`))} dentro de unos días.`,
      porque: `Tienen ${recientes.map((s) => s.dias).join(', ')} ${recientes.length === 1 && recientes[0].dias === 1 ? 'día' : 'días'} y YouTube tarda 2-3 días en dar las cifras completas.`,
      impacto: 'bajo', esfuerzo: 'ninguno', certeza: 'media',
    });
  }
  const pesoEsfuerzo = { ninguno: 0, bajo: 1, medio: 2 };
  const pesoCerteza = { alta: 5, 'media-alta': 4, media: 3, 'media-baja': 2, baja: 1 };
  acciones.sort((a, b) => (orden[b.impacto] - orden[a.impacto]) || (pesoCerteza[b.certeza] - pesoCerteza[a.certeza]) || (pesoEsfuerzo[a.esfuerzo] - pesoEsfuerzo[b.esfuerzo]));

  /* --- el vistazo --- */
  const vistazo = [];
  vistazo.push({
    icono: '📱', rotulo: 'Vistas de tus Shorts · 28 días', cifra: miles(v28),
    pie: cambio != null
      ? `${dec(Math.abs(cambio), 0)} % ${cambio >= 0 ? 'más' : 'menos'} que los 28 días anteriores (${miles(p28)}). Publicaste ${pubs28} en estos 28 días y ${pubsPrev} en los anteriores.`
      : `Hasta el ${dia(fin)}. Publicaste ${pubs28} Shorts en este periodo.`,
  });
  vistazo.push({
    icono: '👀', rotulo: 'Lo que ven de cada Short', cifra: pctGiro != null ? pc(pctGiro) : '—',
    pie: pctGiro != null
      ? `Media de los ${giroFirmes.length} Shorts desde el 9 de agosto, ponderada por vistas.${pctAntes != null ? ` Antes del giro: ${pc(pctAntes)}.` : ''} La meta de tu manual de reels: más del ${META_VISTO} %.`
      : 'Se llenará cuando haya Shorts suficientes con datos completos.',
  });
  vistazo.push({
    icono: '🔔', rotulo: 'Suscriptores por 1.000 vistas', cifra: subsMilShorts != null ? dec(subsMilShorts) : '—',
    pie: subsMilShorts == null ? 'Se llenará con los Shorts del giro.'
      : subsMilLargos != null ? `Los largos: ${dec(subsMilLargos)} por 1.000 vistas. Los Shorts dan alcance; la conversión la hace el largo y el test.`
        : pocosLargos ? `De los Shorts desde el 9 de agosto. Los largos de este periodo suman ${pocosLargos.subs} suscriptores con ${miles(pocosLargos.vistas)} vistas: todavía muy pocos para comparar.`
          : 'De los Shorts desde el 9 de agosto.',
  });

  /* --- las frases de «qué significa» y «qué hago» --- */
  const trad = {};
  trad.dias = {
    sig: sinCola
      ? `Las vistas de un Short llegan casi todas el día que lo publicas y al siguiente, y luego se apagan. Los días con puntito (abajo) son los de publicación: coinciden con los picos. Los días sin Short nuevo, la mediana es de ${miles(medQuietos)} vistas.`
      : 'Cada barra son las vistas de ese día de todos tus Shorts. Los puntos de abajo marcan los días en que publicaste.',
    hago: sinCola
      ? `Que no haya días sin Short nuevo mientras dura el largo: uno al día durante la semana.${dobleNoSuma ? ` Publicar dos el mismo día no suma el doble: el ${dia(dobles[0][0])} publicaste ${pubPorDia[dobles[0][0]]} y sumaron ${miles(dobles[0][1])} vistas, como un día con uno (mediana ${miles(medUnos)}).` : ''}`
      : 'Fíjate en qué días suben las barras y cuáles son los días sin publicar.',
  };
  trad.ranking = {
    sig: 'El número grande es el % visto: de media, cuánto del Short se ve. Pasa del 100 % si se ve más de una vez (bucle), y eso solo ocurre en los de menos de 25 s. Tu meta era pasar del 60 %.',
    hago: retenedores.length
      ? `Copia el esquema de los de arriba del % visto (${unir(retenedores.slice(0, 3).map((s) => `«${s.corto}»`))}): tema nombrado en la primera frase, tu cara a cámara y el cierre que cierra la idea. No repitas el de los que están abajo.`
      : 'Compara los de arriba con los de abajo antes de grabar el siguiente.',
  };
  trad.duracion = {
    sig: giroFirmes.length >= 8
      ? `Agrupa tus Shorts desde el giro por duración. Cuanto más largo, menos gente lo termina (la correlación entre duración y % visto es negativa), y los de más de ${LARGO_CORTO} s ${largosPocos ? 'tienen además menos vistas' : 'no destacan'}. Los grupos con pocos Shorts son una pista, no una ley.`
      : 'Todavía hay pocos Shorts con datos completos para sacar nada.',
    hago: `Apunta a 38-45 s, que es lo que dice tu manual de reels, y vuelve a mirar esta tabla cuando haya más Shorts en cada grupo.`,
  };
  trad.origen = {
    sig: `El ${pc((origenV[0] / Math.max(1, origenTot)) * 100)} de las vistas de los últimos 90 días viene del feed de Shorts: YouTube se lo enseña a gente que no te conoce. La búsqueda trae el ${pc((origenV[1] / Math.max(1, origenTot)) * 100)} y tu canal y otras páginas, el ${pc((origenV[2] / Math.max(1, origenTot)) * 100)}.`,
    hago: 'Aquí manda el gancho de los 3 primeros segundos y que se entienda sin sonido: no hay posicionamiento que trabajar. Piensa cada Short para una desconocida que va deslizando.',
  };
  if (aud) {
    trad.aud = {
      sig: `El ${aud.noP} % de lo que ven tus Shorts es gente que no te sigue. Los que sí te siguen son pocos (${aud.siP} %), pero se quedan ${aud.siAvd > aud.noAvd ? 'más' : 'menos'}: ${aud.siAvd} s de media frente a ${aud.noAvd} s.`,
      hago: 'Es gente que no te conoce, y es a quien hay que llegar. El cierre hacia el largo («Vídeo completo en el link») es lo que convierte; no se mide aquí.',
    };
  }

  const dic = [
    { t: '% visto', d: 'De media, qué parte del Short ve la gente. Si pasa del 100 % es que lo ven más de una vez.' },
    { t: 'Tiempo medio', d: 'Los segundos que se queda cada persona de media.' },
    { t: 'Feed de Shorts', d: 'La pantalla en la que YouTube va enseñando Shorts uno detrás de otro. Casi todas tus vistas salen de ahí.' },
    { t: 'Suscriptores por 1.000 vistas', d: 'Cuántas personas te siguen después de ver un Short, por cada 1.000 vistas. Sirve para comparar con los largos.' },
    { t: 'Sin cola', d: 'Que el Short deja de recibir vistas a los 1-2 días. Un largo, en cambio, puede seguir recibiendo semanas.' },
    { t: 'Deslizar', d: 'Pasar al siguiente Short sin verlo. YouTube no da ese dato a este panel; solo se ve en Studio.' },
    { t: 'Certeza', d: 'Cuánto me fío de la conclusión según cuántos datos hay. Con pocos Shorts, nunca es alta.' },
  ];

  /* --- lo que sale a la pantalla --- */
  const redondo = (s) => ({
    id: s.id, titulo: s.titulo, corto: s.corto, fecha: s.fecha, pub: s.pub, durS: s.durS, dur: `${s.durS} s`,
    vistas: s.vistas, avd: Math.round(s.avd), pct: Math.round(s.pct), subs: s.subs, likes: s.likes, shares: s.shares,
    likesMil: Math.round(s.likesMil * 10) / 10, reciente: s.reciente, dias: s.dias,
  });
  const filas = S.map(redondo);
  const porRet = [...giroFirmes].sort((a, b) => b.pct - a.pct).map((s) => s.id);

  return {
    version: 1,
    meta: { generado: ahora, datosHasta: fin, nShorts: S.length, nPrivados: privados.length, nDesdeGiro: desdeGiro.length },
    vistazo, acciones: acciones.slice(0, 6),
    veredicto: [
      { clase: 'bien', icono: '💚', titulo: 'Va bien', items: bien },
      { clase: 'mal', icono: '🌧️', titulo: 'Falla', items: mal },
      { clase: 'ojo', icono: '👀', titulo: 'A vigilar', items: ojo },
    ],
    serieDias, filas, porRet,
    duracion: { cubos, nota: giroFirmes.length ? `${giroFirmes.length} Shorts desde el 9 de agosto con más de ${MIN_VISTAS} vistas y más de ${RECIENTE} días.` : '' },
    origen: { nombres: ORIGEN, valores: origenV, total: origenTot },
    aud, dist, avisos, trad, dic,
    chips: ['¿Cómo van mis Shorts?', '¿Cuál es mi mejor Short?', '¿Qué duración funciona?', '¿Qué hago esta semana?', '¿Cuándo se actualizan los datos?'],
  };
}
