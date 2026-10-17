// Resumen de todo lo que enseña el panel (la guía, los largos de YouTube y los Shorts) para que Martina, la organizadora
// de «Mi jefa», lo sepa.
//
// Solo se ejecuta dentro de Mi jefa (jefa.abigailpni.com), en la página oculta panel/martina.html que Mi jefa abre cada
// pocas horas. Usa los mismos cálculos que las pestañas, pero no pinta nada, no cambia nada y no escribe en ninguna base
// de datos. Nunca lleva correos, nombres ni nada que identifique a nadie: solo recuentos y lo público de YouTube.
// Si algún día cambia cómo youtube.js o shorts.js preparan los datos, hay que cambiarlo aquí también.

const DESTINO = 'https://jefa.abigailpni.com';

const r1 = (n, d = 1) => (n == null || Number.isNaN(n) ? null : Math.round(n * 10 ** d) / 10 ** d);
const pc = (x, d = 1) => (x == null ? null : r1(x * 100, d));
const txt = (s, n = 90) => String(s == null ? '' : s).slice(0, n);

function guia(d) {
  const c = d.crudos;
  const m = d.metricas;
  return {
    desde: d.periodo.desde,
    hasta: d.periodo.hasta,
    ingresos: r1(c.ingresos, 2),
    guiasVendidas: c.ventas,
    compradoras: c.compradoras,
    visitasALaGuia: c.visitasGuia,
    correosRecogidos: c.leads,
    testEmpezados: c.testEmpezados,
    testAcabados: c.testAcabados,
    devoluciones: c.devoluciones,
    compradorasQueRepiten: c.repetidoras,
    gastosTotales: r1(c.gastos, 2),
    gastosFijosAlMes: r1(c.gastosFijosMes, 2),
    gastoEnPublicidad: r1(c.gastoCampanas, 2),
    impresionesDeAnuncios: c.impresiones,
    clicsEnAnuncios: c.clics,
    visitasDesdeEnlacesDeVideo: c.visitasConMarca,
    ticketMedio: r1(m.ticketMedio, 2),
    roas: r1(m.roas, 2),
    roi: r1(m.roi, 2),
    costePorClienta: r1(m.costePorClienta, 2),
    guiasQueFaltanParaCubrirGastosAlMes: r1(m.puntoEquilibrio, 1),
    conversionDeVisitaACompraPorCiento: pc(m.conversion, 2),
    finalizacionDelTestPorCiento: pc(m.finalizacionTest, 1),
    devolucionPorCiento: pc(m.tasaDevolucion, 1),
    ctrDeAnunciosPorCiento: pc(m.ctrAnuncio, 2),
    ventasPorCanal: (d.porCanal || []).slice(0, 8).map((x) => ({ canal: txt(x.canal, 40), ventas: x.ventas, ingresos: r1(x.ingresos, 2) })),
    visitasPorEnlaceDeVideo: (d.porVideo || []).slice(0, 10).map((x) => ({ marca: txt(x.marca, 40), visitas: x.visitas })),
    paginasMasVistas: (d.porPagina || []).slice(0, 8).map((x) => ({ pagina: txt(`${x.sitio}${x.ruta}`, 50), visitas: x.visitas })),
    gastos: (d.listaGastos || []).slice(0, 30).map((x) => ({ mes: x.mes, concepto: txt(x.concepto, 50), importe: r1(x.importe, 2), seRepiteCadaMes: !!x.recurrente })),
    campanas: (d.listaCampanas || []).slice(0, 12).map((x) => ({ mes: x.mes, nombre: txt(x.nombre, 50), gasto: r1(x.gasto, 2), impresiones: x.impresiones, clics: x.clics })),
    ventasPorDia: (d.ventasDia || []).filter((x) => x.ventas > 0).slice(-40).map((x) => ({ dia: x.dia, ventas: x.ventas, ingresos: r1(x.ingresos, 2) })),
  };
}

function largos(P) {
  const pq = P.paquetes && P.paquetes.resumen;
  return {
    datosHasta: P.meta && P.meta.datosHasta,
    cifras: (P.vistazo || []).map((v) => ({ cifra: txt(v.rotulo, 60), valor: txt(v.cifra, 20), nota: txt(v.pie, 240) })),
    videos: (P.videos || []).map((v) => ({
      titulo: txt(v.titulo, 110), fecha: v.fecha, diasDesdeSuPublicacion: v.dias, duracion: v.dur, vistas: v.vistas,
      horasVistas: r1(v.horas), suscriptoresGanados: v.subs, impresiones: v.impr, ctrPorCiento: r1(v.ctr),
      ctrEnSugeridosPorCiento: r1(v.ctrSug), impresionesPrimeraSemana: v.semana1, reparteYoutube: v.reparto || null,
      noTeSiguenPorCiento: v.noSigue, vistasDeBusquedaPorCiento: v.pBus, siguenAlMinutoPorCiento: r1(v.ret60, 0),
      retencionFrenteAOtrosAlMinuto: r1(v.rel60, 2), retencionFrenteAOtrosAl90PorCiento: r1(v.rel90, 2),
    })),
    queHacer: (P.acciones || []).map((a) => ({ accion: txt(a.titulo, 120), que: txt(a.que, 220), porque: txt(a.porque, 280) })),
    veredicto: (P.veredicto || []).map((g) => ({ [g.titulo]: (g.items || []).map((i) => txt(i.t, 240)) })),
    empaquetado: pq ? Object.fromEntries(Object.entries(pq).map(([era, v]) => [era, Object.fromEntries(Object.entries(v).map(([vol, x]) => [vol, { videos: x.n, impresiones: x.impr, ctrPorCiento: r1(x.ctr) }]))])) : null,
    avisos: (P.avisos || []).slice(0, 8).map((a) => txt(a.t, 220)),
  };
}

function shorts(S) {
  return {
    datosHasta: S.meta && S.meta.datosHasta,
    cifras: (S.vistazo || []).map((v) => ({ cifra: txt(v.rotulo, 60), valor: txt(v.cifra, 20), nota: txt(v.pie, 260) })),
    queHacer: (S.acciones || []).slice(0, 6).map((a) => ({ accion: txt(a.titulo, 120), que: txt(a.que, 220), porque: txt(a.porque, 280) })),
    veredicto: (S.veredicto || []).map((g) => ({ [g.titulo]: (g.items || []).map((i) => txt(i.t, 240)) })),
    reparto: S.dist || null,
    ultimosShorts: (S.filas || []).slice(0, 30).map((s) => ({ titulo: txt(s.titulo, 80), fecha: s.fecha, segundos: s.durS, vistas: s.vistas, porcentajeVisto: s.pct, suscriptores: s.subs })),
  };
}

export async function reunir() {
  const hoy = new Date().toISOString().slice(0, 10);
  const hace30 = new Date(Date.now() - 29 * 86400000).toISOString().slice(0, 10);
  const pedir = async (url) => {
    const r = await fetch(url, { cache: 'no-store' });
    if (!r.ok) throw new Error(String(r.status));
    return r.json();
  };
  const [d30, dTodo, yt, motor, semilla, motorShorts] = await Promise.all([
    pedir(`/api/panel/datos?desde=${hace30}&hasta=${hoy}`),
    pedir(`/api/panel/datos?desde=2026-01-01&hasta=${hoy}`),
    pedir('/api/panel/youtube'),
    import('/panel/analisis.js'),
    import('/panel/semilla.js'),
    import('/panel/analisis-shorts.js'),
  ]);
  const d = (yt && yt.datos) || {};
  const ahora = new Date().toISOString();
  const P = motor.construirPanel({
    ahora, videos: (d.videos && d.videos.videos) || [], totales: d.totales || {}, canal: d.canal,
    porVideo: d.porVideo || {}, alcance: d.alcance || { b: {}, c: {} }, semilla: semilla.SEMILLA,
  });
  let vistas = 0;
  let subs = 0;
  for (const t of Object.values(d.totales || {})) { vistas += t.views || 0; subs += t.subscribersGained || 0; }
  const S = d.cortos ? motorShorts.construirShorts({ ahora, cortos: d.cortos, largos: { vistas, subs } }) : null;
  return {
    generado: ahora,
    guiaUltimos30Dias: guia(d30),
    guiaDesdeEnero: guia(dTodo),
    youtubeLargos: largos(P),
    youtubeShorts: S ? shorts(S) : null,
  };
}

// Fuera de Mi jefa no hace nada (así se puede importar para probarlo).
if (window.top !== window.self) {
  reunir()
    .then((resumen) => window.parent.postMessage({ martina: 'negocio', version: 1, ts: Date.now(), resumen }, DESTINO))
    .catch(() => {});
}
