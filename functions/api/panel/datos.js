// Devuelve todos los números del panel ya calculados, para el periodo que se
// pida (?desde=YYYY-MM-DD&hasta=YYYY-MM-DD).
//
// Cada métrica se calcula aquí una sola vez; la pantalla solo los pinta. Lo
// que no se puede calcular todavía vuelve como null, y el panel explica qué
// falta para que salga.

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

// Divide solo cuando tiene sentido; si no, devuelve null y el panel pone «—».
function dividir(a, b) {
  return b > 0 && a != null ? a / b : null;
}

export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const desde = fecha(url.searchParams.get('desde'), haceDias(29));
  const hasta = fecha(url.searchParams.get('hasta'), hoy());
  const mesDesde = desde.slice(0, 7);
  const mesHasta = hasta.slice(0, 7);

  const db = env.PANEL;
  const q = (sql, ...a) => db.prepare(sql).bind(...a).all();

  // La tabla de leads se creó después que las demás; esto la deja lista la
  // primera vez y no hace nada las siguientes.
  await db.prepare(
    `CREATE TABLE IF NOT EXISTS leads (
       contacto TEXT PRIMARY KEY, recibida TEXT NOT NULL, dia TEXT NOT NULL,
       origen TEXT, bruto TEXT)`
  ).run();

  const [
    resumen, ventasDia, visitasDia, porPagina, porVideo, porCanal,
    repetidoras, gastosTotal, listaGastos, videos, leads, trafico,
  ] = await Promise.all([
    q(`SELECT COUNT(*) AS ventas, COALESCE(SUM(importe),0) AS ingresos,
              COUNT(DISTINCT contacto) AS compradoras
         FROM ventas WHERE dia BETWEEN ? AND ?`, desde, hasta),
    q(`SELECT dia, COUNT(*) AS ventas, COALESCE(SUM(importe),0) AS ingresos
         FROM ventas WHERE dia BETWEEN ? AND ? GROUP BY dia ORDER BY dia`, desde, hasta),
    q(`SELECT dia, SUM(visitas) AS visitas FROM trafico
        WHERE dia BETWEEN ? AND ? GROUP BY dia ORDER BY dia`, desde, hasta),
    q(`SELECT sitio, ruta, SUM(visitas) AS visitas FROM trafico
        WHERE dia BETWEEN ? AND ? GROUP BY sitio, ruta
        ORDER BY visitas DESC LIMIT 25`, desde, hasta),
    q(`SELECT marca, SUM(visitas) AS visitas FROM trafico
        WHERE dia BETWEEN ? AND ? AND marca <> '' GROUP BY marca
        ORDER BY visitas DESC LIMIT 25`, desde, hasta),
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
        WHERE dia BETWEEN ? AND ? GROUP BY sitio, ruta`, desde, hasta),
  ]);

  const r = resumen.results[0] || { ventas: 0, ingresos: 0, compradoras: 0 };
  const suma = (filtro) => trafico.results.filter(filtro).reduce((s, f) => s + f.visitas, 0);

  const visitas = suma(() => true);
  const visitasGuia = suma((f) => f.sitio === 'web' && f.ruta.startsWith('/guia'));
  const testEmpezados = suma((f) => f.sitio === 'test' && !f.ruta.startsWith('/fin'));
  const testAcabados = suma((f) => f.sitio === 'test' && f.ruta.startsWith('/fin'));
  const visitasConMarca = porVideo.results.reduce((s, f) => s + f.visitas, 0);
  const visualizaciones = videos.results.reduce((s, f) => s + (f.visualizaciones || 0), 0);

  const gastos = gastosTotal.results[0] ? gastosTotal.results[0].total : 0;
  const nLeads = leads.results[0] ? leads.results[0].n : 0;
  const ingresos = r.ingresos;
  const ticketMedio = dividir(ingresos, r.ventas);

  return Response.json(
    {
      periodo: { desde, hasta },
      crudos: {
        ingresos, ventas: r.ventas, compradoras: r.compradoras,
        visitas, visitasGuia, visitasConMarca,
        testEmpezados, testAcabados, visualizaciones,
        leads: nLeads, gastos,
        repetidoras: repetidoras.results[0] ? repetidoras.results[0].n : 0,
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
        payback: dividir(dividir(gastos, r.compradoras), ticketMedio),
        // Por el camino
        conversion: dividir(r.ventas, visitasGuia),
        conversionLead: dividir(nLeads, visitas),
        clicDesdeVideo: dividir(visitasConMarca, visualizaciones),
        finalizacionTest: dividir(testAcabados, testEmpezados),
        // Lo que se queda
        repeticion: dividir(repetidoras.results[0] ? repetidoras.results[0].n : 0, r.compradoras),
      },
      ventasDia: ventasDia.results,
      visitasDia: visitasDia.results,
      porPagina: porPagina.results,
      porVideo: porVideo.results,
      porCanal: porCanal.results,
      videos: videos.results,
      listaGastos: listaGastos.results,
    },
    { headers: { 'cache-control': 'no-store' } }
  );
}
