// Devuelve todos los números del panel ya calculados, para el periodo que se
// pida (?desde=YYYY-MM-DD&hasta=YYYY-MM-DD).
//
// Esta dirección queda detrás de Cloudflare Access: solo la abre Abby.

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

function dividir(a, b) {
  return b > 0 ? a / b : null;
}

export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const desde = fecha(url.searchParams.get('desde'), haceDias(29));
  const hasta = fecha(url.searchParams.get('hasta'), hoy());

  const db = env.PANEL;
  const consulta = (sql, ...args) => db.prepare(sql).bind(...args).all();

  const [resumen, ventasDia, visitasDia, porPagina, porVideo, porCanal, repetidoras, gastos, videos] =
    await Promise.all([
      consulta(
        `SELECT COUNT(*) AS ventas,
                COALESCE(SUM(importe), 0) AS ingresos,
                COUNT(DISTINCT contacto) AS compradoras
           FROM ventas WHERE dia BETWEEN ? AND ?`,
        desde,
        hasta
      ),
      consulta(
        `SELECT dia, COUNT(*) AS ventas, COALESCE(SUM(importe), 0) AS ingresos
           FROM ventas WHERE dia BETWEEN ? AND ? GROUP BY dia ORDER BY dia`,
        desde,
        hasta
      ),
      consulta(
        `SELECT dia, SUM(visitas) AS visitas
           FROM trafico WHERE dia BETWEEN ? AND ? GROUP BY dia ORDER BY dia`,
        desde,
        hasta
      ),
      consulta(
        `SELECT sitio, ruta, SUM(visitas) AS visitas
           FROM trafico WHERE dia BETWEEN ? AND ?
          GROUP BY sitio, ruta ORDER BY visitas DESC LIMIT 25`,
        desde,
        hasta
      ),
      consulta(
        `SELECT marca, SUM(visitas) AS visitas
           FROM trafico WHERE dia BETWEEN ? AND ? AND marca <> ''
          GROUP BY marca ORDER BY visitas DESC LIMIT 25`,
        desde,
        hasta
      ),
      consulta(
        `SELECT COALESCE(o.respuesta, 'sin respuesta') AS canal,
                COUNT(*) AS ventas,
                COALESCE(SUM(v.importe), 0) AS ingresos
           FROM ventas v LEFT JOIN origenes o ON o.huella = v.contacto
          WHERE v.dia BETWEEN ? AND ?
          GROUP BY canal ORDER BY ventas DESC`,
        desde,
        hasta
      ),
      consulta(
        `SELECT COUNT(*) AS n FROM (
            SELECT contacto FROM ventas
             WHERE contacto IS NOT NULL
             GROUP BY contacto HAVING COUNT(*) > 1)`
      ),
      consulta(
        `SELECT COALESCE(SUM(importe), 0) AS total FROM gastos
          WHERE mes BETWEEN ? AND ?`,
        desde.slice(0, 7),
        hasta.slice(0, 7)
      ),
      consulta(
        `SELECT video, titulo, MAX(visualizaciones) AS visualizaciones
           FROM videos WHERE dia BETWEEN ? AND ?
          GROUP BY video, titulo ORDER BY visualizaciones DESC LIMIT 25`,
        desde,
        hasta
      ),
    ]);

  const r = resumen.results[0] || { ventas: 0, ingresos: 0, compradoras: 0 };
  const visitasGuia = porPagina.results
    .filter((f) => f.sitio === 'web' && f.ruta.startsWith('/guia'))
    .reduce((s, f) => s + f.visitas, 0);
  const visitasTotales = porPagina.results.reduce((s, f) => s + f.visitas, 0);
  const coste = gastos.results[0] ? gastos.results[0].total : 0;

  return Response.json(
    {
      periodo: { desde, hasta },
      resumen: {
        ventas: r.ventas,
        ingresos: r.ingresos,
        compradoras: r.compradoras,
        visitas: visitasTotales,
        visitasGuia,
        // Ticket medio: lo que deja de media cada compra.
        ticketMedio: dividir(r.ingresos, r.ventas),
        // Conversión: de las que ven la página de la guía, cuántas compran.
        conversion: dividir(r.ventas, visitasGuia),
        // Valor por visita a la página de venta.
        valorPorVisita: dividir(r.ingresos, visitasGuia),
        // Valor por clienta: todo lo que deja de media cada compradora.
        valorPorClienta: dividir(r.ingresos, r.compradoras),
        // Coste por clienta: solo sale si hay gastos apuntados.
        costePorClienta: dividir(coste, r.compradoras),
        gastos: coste,
        repetidoras: repetidoras.results[0] ? repetidoras.results[0].n : 0,
      },
      ventasDia: ventasDia.results,
      visitasDia: visitasDia.results,
      porPagina: porPagina.results,
      porVideo: porVideo.results,
      porCanal: porCanal.results,
      videos: videos.results,
    },
    { headers: { 'cache-control': 'no-store' } }
  );
}
