// Devuelve todos los números del panel ya calculados, para el periodo que se
// pida (?desde=YYYY-MM-DD&hasta=YYYY-MM-DD).
//
// IMPORTANTE: este panel es SOLO de la guía. La portada del dominio es la
// página del programa y queda fuera a propósito: son dos negocios distintos y
// mezclarlos daría conversiones falsas. El filtro está en SOLO_GUIA.
//
// Lo que no se puede calcular todavía vuelve como null, y la pantalla explica
// qué falta para que salga.

const SOLO_GUIA = `(sitio = 'test' OR ruta LIKE '/guia%')`;

function hoy() {
  return new Date().toISOString().slice(0, 10);
}

function haceDias(n) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
}

function fecha(v, porDefecto) {
  return /^\d{4}-\d{2}-\d{2}$/.test(v || '') ? v : porDefecto;
}

// Divide solo cuando tiene sentido; si no, devuelve null y la pantalla pone «—».
function dividir(a, b) {
  return b > 0 && a != null ? a / b : null;
}

async function prepararTablas(db) {
  // Tablas añadidas después de las primeras; esto las deja listas la primera
  // vez y no hace nada las siguientes.
  await db.prepare(
    `CREATE TABLE IF NOT EXISTS leads (
       contacto TEXT PRIMARY KEY, recibida TEXT NOT NULL, dia TEXT NOT NULL,
       origen TEXT, bruto TEXT)`
  ).run();
  await db.prepare(
    `CREATE TABLE IF NOT EXISTS campanas (
       id INTEGER PRIMARY KEY AUTOINCREMENT, mes TEXT NOT NULL, nombre TEXT,
       gasto REAL NOT NULL DEFAULT 0, impresiones INTEGER NOT NULL DEFAULT 0,
       clics INTEGER NOT NULL DEFAULT 0)`
  ).run();
}

export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const desde = fecha(url.searchParams.get('desde'), haceDias(29));
  const hasta = fecha(url.searchParams.get('hasta'), hoy());
  const mesDesde = desde.slice(0, 7);
  const mesHasta = hasta.slice(0, 7);

  const db = env.PANEL;
  await prepararTablas(db);
  const q = (sql, ...a) => db.prepare(sql).bind(...a).all();

  const [
    resumen, ventasDia, visitasDia, porPagina, porVideo, porCanal,
    repetidoras, fijos, listaGastos, videos, leads, trafico, campanas,
  ] = await Promise.all([
    q(`SELECT COUNT(*) AS ventas, COALESCE(SUM(importe),0) AS ingresos,
              COUNT(DISTINCT contacto) AS compradoras
         FROM ventas WHERE dia BETWEEN ? AND ?`, desde, hasta),
    q(`SELECT dia, COUNT(*) AS ventas, COALESCE(SUM(importe),0) AS ingresos
         FROM ventas WHERE dia BETWEEN ? AND ? GROUP BY dia ORDER BY dia`, desde, hasta),
    q(`SELECT dia, SUM(visitas) AS visitas FROM trafico
        WHERE dia BETWEEN ? AND ? AND ${SOLO_GUIA} GROUP BY dia ORDER BY dia`, desde, hasta),
    q(`SELECT sitio, ruta, SUM(visitas) AS visitas FROM trafico
        WHERE dia BETWEEN ? AND ? AND ${SOLO_GUIA}
        GROUP BY sitio, ruta ORDER BY visitas DESC LIMIT 25`, desde, hasta),
    q(`SELECT marca, SUM(visitas) AS visitas FROM trafico
        WHERE dia BETWEEN ? AND ? AND marca <> '' AND ${SOLO_GUIA}
        GROUP BY marca ORDER BY visitas DESC LIMIT 25`, desde, hasta),
    q(`SELECT COALESCE(o.respuesta,'sin respuesta') AS canal, COUNT(*) AS ventas,
              COALESCE(SUM(v.importe),0) AS ingresos
         FROM ventas v LEFT JOIN origenes o ON o.huella = v.contacto
        WHERE v.dia BETWEEN ? AND ? GROUP BY canal ORDER BY ventas DESC`, desde, hasta),
    q(`SELECT COUNT(*) AS n FROM (SELECT contacto FROM ventas
         WHERE contacto IS NOT NULL GROUP BY contacto HAVING COUNT(*) > 1)`),
    q(`SELECT COALESCE(SUM(importe),0) AS total FROM gastos WHERE mes BETWEEN ? AND ?`, mesDesde, mesHasta),
    q(`SELECT id, mes, concepto, importe FROM gastos ORDER BY mes DESC, id DESC LIMIT 40`),
    q(`SELECT video, titulo, MAX(visualizaciones) AS visualizaciones FROM videos
        WHERE dia BETWEEN ? AND ? GROUP BY video, titulo
        ORDER BY visualizaciones DESC LIMIT 25`, desde, hasta),
    q(`SELECT COUNT(*) AS n FROM leads WHERE dia BETWEEN ? AND ?`, desde, hasta),
    q(`SELECT sitio, ruta, SUM(visitas) AS visitas FROM trafico
        WHERE dia BETWEEN ? AND ? AND ${SOLO_GUIA} GROUP BY sitio, ruta`, desde, hasta),
    q(`SELECT id, mes, nombre, gasto, impresiones, clics FROM campanas
        WHERE mes BETWEEN ? AND ? ORDER BY mes DESC, id DESC`, mesDesde, mesHasta),
  ]);

  const r = resumen.results[0] || { ventas: 0, ingresos: 0, compradoras: 0 };
  const suma = (filtro) => trafico.results.filter(filtro).reduce((s, f) => s + f.visitas, 0);

  const visitasGuia = suma((f) => f.sitio === 'web');
  const testEmpezados = suma((f) => f.sitio === 'test' && !f.ruta.startsWith('/fin'));
  const testAcabados = suma((f) => f.sitio === 'test' && f.ruta.startsWith('/fin'));
  const visitasConMarca = porVideo.results.reduce((s, f) => s + f.visitas, 0);
  const visualizaciones = videos.results.reduce((s, f) => s + (f.visualizaciones || 0), 0);

  // Gastos = los fijos (Systeme, dominio…) más lo invertido en campañas.
  const gastosFijos = fijos.results[0] ? fijos.results[0].total : 0;
  const gastoCampanas = campanas.results.reduce((s, c) => s + (c.gasto || 0), 0);
  const impresiones = campanas.results.reduce((s, c) => s + (c.impresiones || 0), 0);
  const clics = campanas.results.reduce((s, c) => s + (c.clics || 0), 0);
  const gastos = gastosFijos + gastoCampanas;

  const nLeads = leads.results[0] ? leads.results[0].n : 0;
  const nRepetidoras = repetidoras.results[0] ? repetidoras.results[0].n : 0;
  const ingresos = r.ingresos;
  const ticketMedio = dividir(ingresos, r.ventas);

  return Response.json(
    {
      periodo: { desde, hasta },
      crudos: {
        ingresos, ventas: r.ventas, compradoras: r.compradoras,
        visitasGuia, visitasConMarca, testEmpezados, testAcabados,
        visualizaciones, leads: nLeads,
        gastos, gastosFijos, gastoCampanas, impresiones, clics,
        repetidoras: nRepetidoras,
      },
      metricas: {
        // Lo que entra
        ingresos,
        ticketMedio,
        valorPorClienta: dividir(ingresos, r.compradoras),
        valorPorVisita: dividir(ingresos, visitasGuia),
        // Lo que cuesta
        gastos,
        costePorClienta: dividir(gastos, r.compradoras),
        costePorLead: dividir(gastos, nLeads),
        roas: dividir(ingresos, gastos),
        roi: gastos > 0 ? (ingresos - gastos) / gastos : null,
        recuperacion: dividir(dividir(gastos, r.compradoras), ticketMedio),
        // La publicidad
        cpm: dividir(gastoCampanas * 1000, impresiones),
        cpc: dividir(gastoCampanas, clics),
        ctrAnuncio: dividir(clics, impresiones),
        // Por el camino
        conversion: dividir(r.ventas, visitasGuia),
        conversionLead: dividir(nLeads, visitasGuia),
        clicDesdeVideo: dividir(visitasConMarca, visualizaciones),
        finalizacionTest: dividir(testAcabados, testEmpezados),
        // Lo que se queda
        repeticion: dividir(nRepetidoras, r.compradoras),
      },
      ventasDia: ventasDia.results,
      visitasDia: visitasDia.results,
      porPagina: porPagina.results,
      porVideo: porVideo.results,
      porCanal: porCanal.results,
      videos: videos.results,
      listaGastos: listaGastos.results,
      listaCampanas: campanas.results,
    },
    { headers: { 'cache-control': 'no-store' } }
  );
}
