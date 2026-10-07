// Reune y calcula todos los numeros del panel. Lo usan la pantalla
// (api/panel/datos) y Trufa (api/panel/chat), para que los dos vean
// exactamente lo mismo.

const SOLO_GUIA = `(sitio = 'test' OR ruta LIKE '/guia%')`;

// Precio de la guía. Solo se usa para calcular el punto de equilibrio mientras
// todavía no hay ventas de las que sacar el ticket medio real.
const PRECIO_GUIA = 48;

// Lista de meses («2026-09», «2026-10»…) que caen dentro del periodo.
function mesesEntre(desde, hasta) {
  const meses = [];
  let [a, m] = desde.slice(0, 7).split('-').map(Number);
  const [aF, mF] = hasta.slice(0, 7).split('-').map(Number);
  while (a < aF || (a === aF && m <= mF)) {
    meses.push(`${a}-${String(m).padStart(2, '0')}`);
    if (++m > 12) { m = 1; a++; }
  }
  return meses;
}

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

export async function reunirDatos(env, desdePedido, hastaPedido) {
  const desde = fecha(desdePedido, haceDias(29));
  const hasta = fecha(hastaPedido, hoy());
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
    q(`SELECT 0 AS total`),
    q(`SELECT id, mes, concepto, importe,
              COALESCE(recurrente, 0) AS recurrente
         FROM gastos ORDER BY recurrente DESC, mes DESC, id DESC LIMIT 60`),
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

  // Gastos fijos: los que se repiten cada mes cuentan una vez por cada mes del
  // periodo (desde el mes en que se dieron de alta); los sueltos, solo en el suyo.
  const meses = mesesEntre(desde, hasta);
  const gastosFijos = listaGastos.results.reduce((s, g) => {
    if (g.recurrente) return s + g.importe * meses.filter((m) => m >= g.mes).length;
    return meses.includes(g.mes) ? s + g.importe : s;
  }, 0);
  // Lo que cuesta tener el negocio en pie un mes cualquiera.
  const gastosFijosMes = listaGastos.results
    .filter((g) => g.recurrente)
    .reduce((s, g) => s + g.importe, 0);

  const gastoCampanas = campanas.results.reduce((s, c) => s + (c.gasto || 0), 0);
  const impresiones = campanas.results.reduce((s, c) => s + (c.impresiones || 0), 0);
  const clics = campanas.results.reduce((s, c) => s + (c.clics || 0), 0);
  const gastos = gastosFijos + gastoCampanas;

  const nLeads = leads.results[0] ? leads.results[0].n : 0;
  const nRepetidoras = repetidoras.results[0] ? repetidoras.results[0].n : 0;
  const ingresos = r.ingresos;
  const ticketMedio = dividir(ingresos, r.ventas);

  return {
      periodo: { desde, hasta },
      crudos: {
        ingresos, ventas: r.ventas, compradoras: r.compradoras,
        visitasGuia, visitasConMarca, testEmpezados, testAcabados,
        visualizaciones, leads: nLeads,
        gastos, gastosFijos, gastosFijosMes, gastoCampanas, impresiones, clics,
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
        // El coste de captar: solo publicidad. Es el que manda para decidir si
        // merece la pena gastar más en anuncios.
        costePorClienta: dividir(gastoCampanas, r.compradoras),
        // El coste contándolo todo, incluidos los gastos que pagas vendas o no.
        costeTotalPorClienta: dividir(gastos, r.compradoras),
        costePorLead: dividir(gastoCampanas, nLeads),
        roas: dividir(ingresos, gastoCampanas),
        roi: gastos > 0 ? (ingresos - gastos) / gastos : null,
        recuperacion: dividir(dividir(gastoCampanas, r.compradoras), ticketMedio),
        // Cuántas guías hay que vender al mes para cubrir los gastos fijos.
        puntoEquilibrio: dividir(gastosFijosMes, ticketMedio || PRECIO_GUIA),
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
    };
}
