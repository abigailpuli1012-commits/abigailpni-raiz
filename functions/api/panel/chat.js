// Trufa, el conejo que contesta preguntas sobre los datos del panel.
//
// Primero intenta entender la pregunta por su cuenta y contestar con los
// números exactos: es instantáneo, gratis y no se inventa nada. Solo si no la
// reconoce tira de la inteligencia artificial que Cloudflare incluye en la
// cuenta (enlace «AI»), pasándole los datos ya calculados.
//
// Esta dirección está detrás del middleware de /api/panel, así que solo
// contesta a Abby con su sesión abierta.

import { reunirDatos } from '../../_datos.js';

const JSON_ = { 'content-type': 'application/json', 'cache-control': 'no-store' };

const euro = (n) => n == null ? 'todavía nada'
  : n.toLocaleString('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: Math.abs(n) < 100 ? 2 : 0 });
const pct = (n) => n == null ? 'todavía no se puede calcular'
  : (n * 100).toLocaleString('es-ES', { maximumFractionDigits: n < 0.1 ? 2 : 1 }) + ' %';
const num = (n) => (n == null ? '0' : n.toLocaleString('es-ES'));

function sinTildes(t) {
  return t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[¿?¡!.,;:]/g, ' ');
}

// Saludos y cortesías: no son preguntas sobre datos, pero quedar mudo ante un
// «hola» es lo que peor sienta.
function cortesia(p, d) {
  const limpio = sinTildes(p).trim().replace(/\s+/g, ' ');
  // Solo se toma como saludo un mensaje corto: en "cuanto vale mi casa" la
  // palabra "vale" no es un "vale, gracias".
  if (limpio.split(' ').length > 5) return null;
  const t = ' ' + limpio + ' ';
  const tiene = (...xs) => xs.some((x) => t.includes(' ' + x + ' ') || limpio === x);

  if (tiene('hola', 'buenas', 'hey', 'holi', 'buenos dias', 'buenas tardes', 'buenas noches')) {
    const c = d.crudos;
    const estado = c.ventas === 0
      ? 'De momento no hay ventas en este periodo, pero el contador ya está puesto.'
      : `Vas por ${c.ventas} guías.`;
    return `¡Hola! ${estado} Puedes preguntarme cómo vas, qué vídeo trae más gente o si la publicidad sale a cuenta.`;
  }
  // «vale» y «ok» solo cuentan si es lo único que se ha escrito: si no,
  // «cuánto vale mi casa» se tomaría por un «vale, gracias».
  const soloEso = ['vale', 'ok', 'okey', 'genial', 'perfecto', 'guay'].includes(limpio);
  if (soloEso || tiene('gracias', 'muchas gracias')) {
    return 'A mandar. Aquí sigo.';
  }
  if (tiene('quien eres', 'que eres', 'como te llamas', 'tu nombre')) {
    return 'Soy Trufa. Vivo en tu panel y me sé tus números: ventas, visitas, gastos y lo que sale de cruzarlos.';
  }
  if (tiene('que sabes', 'que puedes hacer', 'ayuda', 'opciones') || /puedes preguntar|puedo preguntar|que sabes hacer/.test(limpio)) {
    return 'Puedo decirte cuánto has ingresado, cuántas guías llevas, cuántas te faltan para cubrir gastos, ' +
      'tu conversión, qué vídeo trae más gente, de dónde salen las ventas y si la publicidad sale a cuenta.';
  }
  if (tiene('adios', 'hasta luego', 'chao', 'me voy')) {
    return '¡Hasta luego! Cuando quieras, aquí estoy.';
  }
  return null;
}

// Las preguntas que Trufa sabe contestar sola, con su respuesta.
function respuestasConocidas(d) {
  const m = d.metricas, c = d.crudos;
  const faltan = m.puntoEquilibrio == null ? null : Math.max(0, Math.ceil(m.puntoEquilibrio) - c.ventas);
  const mejorVideo = d.porVideo[0];
  const mejorCanal = d.porCanal.filter((x) => x.canal !== 'sin respuesta')[0];

  return [
    {
      claves: ['ingresos', 'ingresado', 'ganado', 'dinero', 'facturado', 'cuanto llevo'],
      texto: () => c.ventas === 0
        ? 'Todavía no ha entrado nada en este periodo. En cuanto se venda la primera guía, aquí verás el dinero.'
        : `Han entrado ${euro(m.ingresos)} con ${num(c.ventas)} guías vendidas, de ${num(c.compradoras)} personas distintas.`,
    },
    {
      claves: ['guias', 'ventas', 'vendido', 'vendidas'],
      texto: () => c.ventas === 0
        ? 'Todavía ninguna en este periodo.'
        : `${num(c.ventas)} guías, compradas por ${num(c.compradoras)} personas. El ticket medio está en ${euro(m.ticketMedio)}.`,
    },
    {
      claves: ['cubrir gastos', 'equilibrio', 'faltan', 'rentable', 'cubro'],
      texto: () => faltan == null
        ? 'Para eso necesito que apuntes tus gastos fijos en el panel. Sin saber lo que pagas al mes no puedo decirte cuántas guías te hacen falta.'
        : !c.gastosFijosMes
          ? 'No tienes gastos fijos apuntados todavía, así que no puedo decirte cuántas guías necesitas. Apúntalos en el panel, abajo del todo.'
          : faltan === 0
          ? `Ya los cubres. Con ${euro(c.gastosFijosMes)} al mes de gastos y ${num(c.ventas)} guías vendidas, lo que venga de más es tuyo.`
          : `Te faltan ${num(faltan)} guías. Tus gastos fijos son ${euro(c.gastosFijosMes)} al mes y con la guía a ${euro(m.ticketMedio || 48)} necesitas vender ${num(Math.ceil(m.puntoEquilibrio))} al mes para cubrirlos.`,
    },
    {
      claves: ['video', 'videos', 'youtube trae'],
      texto: () => !mejorVideo
        ? 'Todavía no ha llegado nadie por un enlace con marca. Cuando publiques un vídeo con su enlace propio (del tipo abigailpni.com/guia?v=sibo) te diré cuál trae más gente.'
        : `El que mejor funciona es «${mejorVideo.marca}», con ${num(mejorVideo.visitas)} visitas. ` +
          (d.porVideo[1] ? `Detrás va «${d.porVideo[1].marca}» con ${num(d.porVideo[1].visitas)}.` : ''),
    },
    {
      claves: ['conversion', 'convierte', 'cuantas compran'],
      texto: () => m.conversion == null
        ? 'Aún no hay visitas suficientes en la página de la guía para calcularlo.'
        : `De las que entran en la página de la guía, compra el ${pct(m.conversion)}. Son ${num(c.visitasGuia)} visitas y ${num(c.ventas)} ventas.`,
    },
    {
      claves: ['publicidad', 'anuncios', 'anuncio', 'campana', 'campanas', 'roas', 'merece la pena', 'sale a cuenta'],
      texto: () => m.roas == null
        ? 'Todavía no has apuntado ninguna campaña, así que no hay publicidad que medir. Cuando lances la de YouTube, copia en el panel lo gastado, las impresiones y los clics.'
        : `Por cada euro de anuncios vuelven ${m.roas.toLocaleString('es-ES', { maximumFractionDigits: 2 })} €. ` +
          (m.roas >= 1 ? 'Sale a cuenta.' : 'Por debajo de 1× estás perdiendo dinero con los anuncios.') +
          ` Cada clienta te cuesta ${euro(m.costePorClienta)} en publicidad y te deja ${euro(m.valorPorClienta)}.`,
    },
    {
      claves: ['cac', 'captar', 'cuesta clienta', 'coste clienta', 'cuesta cliente'],
      texto: () => m.costePorClienta == null
        ? 'No puedo calcularlo todavía: hacen falta campañas apuntadas y alguna venta. Ojo, que esto cuenta solo publicidad; tus gastos fijos van aparte.'
        : `Conseguir una clienta te cuesta ${euro(m.costePorClienta)} en publicidad, y cada una te deja ${euro(m.valorPorClienta)}. ` +
          (m.valorPorClienta > m.costePorClienta ? 'Vas ganando.' : 'Cuidado: cuesta más de lo que deja.'),
    },
    {
      claves: ['test', 'semaforo', 'alimentos'],
      texto: () => m.finalizacionTest == null
        ? 'Todavía no tengo datos del test. Falta ponerle el contador.'
        : `Del test, lo empiezan ${num(c.testEmpezados)} y lo acaban ${num(c.testAcabados)}: termina el ${pct(m.finalizacionTest)}.`,
    },
    {
      claves: ['donde vienen', 'conocen', 'canal', 'canales', 'donde salen', 'conociste'],
      texto: () => !mejorCanal
        ? 'Aún no hay ventas con respuesta a «¿cómo me conociste?». Cuando empiecen a comprar lo verás aquí.'
        : `La mayoría llega por: ${d.porCanal.map((x) => `${x.canal} (${num(x.ventas)})`).join(', ')}.`,
    },
    {
      claves: ['visitas', 'gente', 'trafico', 'entran'],
      texto: () => `A la página de la guía han llegado ${num(c.visitasGuia)} visitas. ` +
        (m.valorPorVisita ? `Cada una vale de media ${euro(m.valorPorVisita)}.` : 'Todavía no puedo decirte cuánto vale cada una.'),
    },
    {
      claves: ['resumen', 'como voy', 'como va', 'balance', 'que tal va', 'que tal todo'],
      texto: () => {
        const trozos = [];
        trozos.push(c.ventas === 0
          ? 'Todavía no hay ventas en este periodo.'
          : `Llevas ${num(c.ventas)} guías y ${euro(m.ingresos)}.`);
        if (c.visitasGuia) trozos.push(`${num(c.visitasGuia)} visitas a la página de la guía.`);
        if (m.conversion != null) trozos.push(`Compra el ${pct(m.conversion)} de las que entran.`);
        if (!c.gastosFijosMes) trozos.push('Te faltan tus gastos fijos por apuntar para saber si cubres.');
        else if (faltan != null) trozos.push(faltan === 0 ? 'Ya cubres gastos.' : `Te faltan ${num(faltan)} guías para cubrir gastos.`);
        return trozos.join(' ');
      },
    },
  ];
}

// Una pregunta encaja con una clave cuando todas las palabras de la clave
// aparecen en ella, en cualquier orden. Gana la clave con más palabras, que es
// la más específica.
function buscar(pregunta, lista) {
  const palabras = sinTildes(pregunta).split(/\s+/).filter(Boolean);
  let mejor = null;
  let puntos = 0;

  for (const r of lista) {
    for (const clave of r.claves) {
      const suyas = clave.split(/\s+/);
      // Las palabras de menos de cuatro letras solo valen enteras: «te» no es «test» ni «mi» es «minuto».
      const encaja = (w, x) => x === w || (x.length >= 4 && w.length >= 4 && (x.startsWith(w) || w.startsWith(x)));
      if (suyas.every((w) => palabras.some((x) => encaja(w, x))) && suyas.length > puntos) {
        puntos = suyas.length;
        mejor = r;
      }
    }
  }
  return mejor;
}

async function conIA(env, pregunta, d) {
  if (!env.AI) return null;

  const contexto = JSON.stringify({ periodo: d.periodo, crudos: d.crudos, metricas: d.metricas });
  const sistema =
    'Eres Trufa, un conejo que ayuda a Abby con los números de su negocio. ' +
    'Contestas en español de España, de tú, en dos o tres frases como mucho, directo y sin rodeos. ' +
    'Usas SOLO los datos que te doy: si algo no está, dices que todavía no se puede saber. ' +
    'Nunca te inventas cifras. Nada de emojis.';

  try {
    const r = await env.AI.run('@cf/meta/llama-3.1-8b-instruct', {
      messages: [
        { role: 'system', content: sistema + '\n\nDatos del panel:\n' + contexto },
        { role: 'user', content: pregunta },
      ],
      max_tokens: 220,
    });
    return (r && (r.response || r.result)) || null;
  } catch {
    return null;
  }
}

/* ---------- la pestaña de YouTube ---------- */
// Cuando Abby pregunta desde la pestaña «YouTube», Trufa contesta con las conclusiones ya calculadas
// (las mismas que ve en pantalla). Primero por reglas; si no reconoce la pregunta, tira de la IA.

const n0 = (x) => Math.round(x).toLocaleString('es-ES');
const d1 = (x) => x.toFixed(1).replace('.', ',');
const d2 = (x) => x.toFixed(2).replace('.', ',');
const lista = (xs) => (xs.length <= 1 ? xs.join('') : xs.slice(0, -1).join(', ') + ' y ' + xs[xs.length - 1]);
// «2026-10-08» + 14 días → «22/10»
const en14 = (iso) => {
  const d = new Date(Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10)) + 14 * 86400000);
  return `${String(d.getUTCDate()).padStart(2, '0')}/${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
};

function cortesiaYoutube(p) {
  const limpio = sinTildes(p).trim().replace(/\s+/g, ' ');
  if (limpio.split(' ').length > 5) return null;
  const t = ' ' + limpio + ' ';
  const tiene = (...xs) => xs.some((x) => t.includes(' ' + x + ' ') || limpio === x);
  if (tiene('hola', 'buenas', 'hey', 'holi')) {
    return '¡Hola! Puedo decirte qué hacer esta semana, dónde pierdes más gente, qué miniatura funciona mejor, si tu CTR es bueno o cómo va tu último vídeo.';
  }
  if (tiene('gracias', 'muchas gracias') || ['vale', 'ok', 'genial', 'perfecto', 'guay'].includes(limpio)) return 'A mandar. Aquí sigo.';
  if (tiene('quien eres', 'que eres', 'como te llamas')) return 'Soy Trufa. En esta pestaña me sé tus números de YouTube y lo que significan.';
  return null;
}

function respuestasYoutube(P) {
  const V = P.videos || [];
  const aj = (v) => `«${v.titulo}»`;
  const conMuestra = V.filter((v) => v.vistas >= 40);
  const hasta = P.meta && P.meta.datosHasta ? P.meta.datosHasta.split('-').reverse().join('/') : null;

  return [
    {
      claves: ['que hago', 'esta semana', 'que hacer', 'prioridad', 'prioridades', 'consejo', 'consejos', 'por donde empiezo', 'que cambio'],
      texto: () => {
        const a = (P.acciones || []).slice(0, 3);
        if (!a.length) return 'Ahora mismo no hay nada urgente que tocar.';
        return 'Esta semana, por este orden: ' + a.map((x, i) => `${i + 1}. ${x.titulo}. ${i === 0 ? x.que + ' ' : ''}`).join(' ').trim() +
          ' Tienes el detalle y el porqué en «Qué hacer esta semana».';
      },
    },
    {
      claves: ['minuto', 'retencion', 'se quedan', 'quedan viendo', 'siguen viendo', 'se queda mas'],
      texto: () => {
        const c = conMuestra.filter((v) => v.rel60 != null).sort((a, b) => b.rel60 - a.rel60);
        if (!c.length) return 'Todavía no hay vídeos con suficientes vistas para compararlos.';
        const m = c[0];
        const peor = c[c.length - 1];
        return `Al minuto sigue viendo el ${n0(m.ret60)} % en ${aj(m)} (${d2(m.rel60)} frente a vídeos de su duración; 0,5 es la mediana), que es el mejor de los que tienen 40 vistas o más. ` +
          (peor !== m ? `El más flojo es ${aj(peor)}, con el ${n0(peor.ret60)} % y ${d2(peor.rel60)}.` : '');
      },
    },
    {
      claves: ['pierdo', 'pierde', 'se va', 'se van', 'abandonan', 'abandono', 'donde se va'],
      texto: () => {
        const frios = V.filter((v) => v.noSigue >= 80 && v.vistas >= 100 && v.ret60 != null);
        const finales = conMuestra.filter((v) => v.rel90 != null && v.rel90 < 0.5);
        let t = frios.length
          ? `En el primer minuto se va entre el ${n0(Math.min(...frios.map((v) => 100 - v.ret60)))} y el ${n0(Math.max(...frios.map((v) => 100 - v.ret60)))} % del público frío, lo habitual en YouTube. `
          : '';
        t += finales.length
          ? `Donde queda por debajo de lo normal es el tramo final: ${finales.length} de ${conMuestra.filter((v) => v.rel90 != null).length} vídeos están por debajo de la mediana hacia el 90 %.`
          : 'El tramo final está en lo normal.';
        const flojo = conMuestra.filter((v) => v.rel60 != null && v.rel60 < 0.3);
        if (flojo.length) t += ` El arranque que sí está muy por debajo es el de ${lista(flojo.map(aj))}.`;
        return t;
      },
    },
    {
      claves: ['miniatura', 'miniaturas'],
      texto: () => {
        const m = P.miniaturas || [];
        const q = P.paquetes && P.paquetes.resumen;
        let t = '';
        if (m.length >= 2) {
          const mejor = V[m[0].v];
          const peor = V[m[m.length - 1].v];
          t += `En sugeridos (gente que no te conoce), la que más clics saca es la de ${aj(mejor)} con un ${d1(m[0].ctr)} %, y la que menos la de ${aj(peor)} con un ${d1(m[m.length - 1].ctr)} %. `;
        }
        if (q && q.antes.poco.n >= 3 && q.sobrio.poco.n >= 2) {
          t += `Mirando todos tus vídeos, con menos de 1.000 impresiones el CTR fue del ${d1(q.antes.poco.ctr)} % con las miniaturas de antes de septiembre (más elementos del tema, texto-pregunta y cara con emoción) y del ${d1(q.sobrio.poco.ctr)} % con las sobrias.`;
        }
        return t || 'Todavía no tengo clics suficientes para comparar miniaturas.';
      },
    },
    {
      claves: ['por que baja', 'primeros videos', 'desde septiembre', 'estilo antiguo', 'estilo nuevo', 'paquetes', 'paquete'],
      texto: () => {
        const q = P.paquetes && P.paquetes.resumen;
        if (!q) return 'Todavía no tengo datos de impresiones para compararlo.';
        const f = (g) => (g && g.n ? `${d1(g.ctr)} % (${g.n} ${g.n === 1 ? 'vídeo' : 'vídeos'})` : 'sin datos');
        return `Con poco volumen (menos de 1.000 impresiones): antes de septiembre ${f(q.antes.poco)}, septiembre-octubre ${f(q.sobrio.poco)}` +
          `${q.nuevo.poco.n ? `, desde el 12/10 ${f(q.nuevo.poco)}` : ''}. Con mucho volumen: ${f(q.antes.mucho)} y ${f(q.sobrio.mucho)}` +
          `${q.nuevo.mucho.n ? `, desde el 12/10 ${f(q.nuevo.mucho)}` : ''}. No puedo separar el paquete del cambio de tema de agosto; por eso cada miniatura nueva se prueba por pares.`;
      },
    },
    {
      claves: ['ctr', 'clics', 'clic', 'es bueno mi ctr', 'porcentaje de clics'],
      texto: () => {
        const g = (P.vistazo || []).find((x) => x.rotulo.startsWith('CTR'));
        const sug = (P.ctrOrigen || []).find((o) => o.nombre.startsWith('Sugeridos'));
        let t = g && g.cifra !== '—' ? `Tu CTR de los largos es del ${g.cifra}. ` : 'Todavía no tengo tus impresiones para calcular el CTR. ';
        t += 'YouTube dice que la mitad de los canales está entre el 2 y el 10 %, y que baja cuando el vídeo se enseña a mucha gente. ';
        if (sug && sug.puntos.length) {
          const n = sug.puntos.reduce((s, p) => s + p.impr, 0);
          const k = sug.puntos.reduce((s, p) => s + p.impr * p.ctr, 0) / 100;
          t += `En sugeridos, con gente fría, estás en el ${d1((k / n) * 100)} %: es lo que más conviene subir (meta razonable, el 3 %).`;
        }
        return t;
      },
    },
    {
      claves: ['impresiones', 'reparto', 'reparte', 'youtube reparte', 'enseña'],
      texto: () => {
        const c = V.filter((v) => v.semana1Completa).sort((a, b) => b.semana1 - a.semana1);
        if (!c.length) return 'Todavía no tengo las impresiones de la primera semana de ningún vídeo.';
        const m = c[0];
        const suelta = c.find((v) => v.reparto === 'soltó');
        return `El que más ha repartido YouTube es ${aj(m)}: ${n0(m.semana1)} impresiones la primera semana${m.reparto === 'amplió' ? ' y lo fue ampliando' : ''}. ` +
          (suelta ? `En cambio ${aj(suelta)} lo probó y lo soltó tras el primer día. ` : '') +
          'Las impresiones las decide YouTube: no miden interés, miden cuánto te enseña.';
      },
    },
    {
      claves: ['ultimo video', 'ultimo', 'nuevo', 'reciente', 'recien publicado', 'acabo de publicar', 'que tal el nuevo'],
      texto: () => {
        const v = V[0];
        if (!v) return 'No veo vídeos publicados todavía.';
        if (v.dias <= 0) return `${aj(v)} se ha publicado hace nada: YouTube tarda 2-3 días en dar los primeros datos. Vuelve a mirarlo hacia el ${en14(v.pub)}.`;
        return `${aj(v)} lleva ${v.dias} ${v.dias === 1 ? 'día' : 'días'} y ${n0(v.vistas)} vistas${v.semana1 != null ? `, con ${n0(v.semana1)} impresiones` : ''}. ` +
          (v.dias < 10 ? 'Todavía es pronto para juzgarlo.' : '');
      },
    },
    {
      claves: ['final', 'cierre', 'llamada al test', 'oyen el test'],
      texto: () => {
        const c = conMuestra.filter((v) => v.rel90 != null);
        const bajo = c.filter((v) => v.rel90 < 0.5);
        const frios = V.filter((v) => v.noSigue >= 80 && v.vistas >= 100 && v.r90 != null);
        return `Hacia el 90 % del vídeo, ${bajo.length} de ${c.length} están por debajo de la mediana de los vídeos de su duración. ` +
          (frios.length ? `Y queda entre el ${n0(Math.min(...frios.map((v) => v.r90)))} y el ${n0(Math.max(...frios.map((v) => v.r90)))} % del público frío para oír el test. ` : '') +
          'Mi hipótesis es que el cierre repite lo ya dicho; conviene escuchar ese tramo antes de cambiarlo.';
      },
    },
    {
      claves: ['actualiza', 'actualizan', 'cuando se', 'retraso', 'datos hasta', 'frescos', 'tiempo real', 'en directo', 'hasta cuando'],
      texto: () => `Mis datos de YouTube llegan hasta el ${hasta || 'último día disponible'}. YouTube los entrega con 2-3 días de retraso, así que lo de hoy y ayer todavía no está. ` +
        'El panel se actualiza solo cuando lo abres, como mucho cada 6 horas.',
    },
    {
      claves: ['suscriptores', 'seguidores', 'suscriben', 'me siguen'],
      texto: () => {
        const s = conMuestra.reduce((a, v) => a + (v.subs || 0), 0);
        const w = conMuestra.reduce((a, v) => a + v.vistas, 0);
        return `Entre los vídeos con 40 vistas o más han sumado ${s} suscriptores con ${n0(w)} vistas (${d1(w ? (s / w) * 100 : 0)} %). Tu única llamada es el test; los suscriptores llegan como consecuencia de vídeos que retienen.`;
      },
    },
    {
      claves: ['busqueda', 'buscan', 'buscando'],
      texto: () => {
        const c = V.filter((v) => v.pBus >= 20 && v.vistas >= 40).sort((a, b) => b.pBus - a.pBus);
        if (!c.length) return 'Casi ningún vídeo recibe gente desde la búsqueda todavía.';
        return `El más buscado es ${aj(c[0])}: el ${c[0].pBus} % de sus vistas viene de la búsqueda. ` + (c[1] ? `Después ${aj(c[1])} (${c[1].pBus} %).` : '');
      },
    },
    {
      claves: ['mejor video', 'video funciona mejor', 'que video funciona', 'cual video', 'cual funciona mejor'],
      texto: () => {
        const rep = V.filter((v) => v.semana1Completa).sort((a, b) => b.semana1 - a.semana1)[0];
        const min = conMuestra.filter((v) => v.rel60 != null).sort((a, b) => b.rel60 - a.rel60)[0];
        const bus = V.filter((v) => v.pBus >= 40 && v.vistas >= 40)[0];
        const partes = [];
        if (rep) partes.push(`el que más reparte YouTube es ${aj(rep)} (${n0(rep.semana1)} impresiones la primera semana)`);
        if (min) partes.push(`el que mejor se queda al minuto, frente a vídeos de su duración, es ${aj(min)} (${d2(min.rel60)})`);
        if (bus) partes.push(`el más buscado es ${aj(bus)} (${bus.pBus} % de búsqueda)`);
        return partes.length ? 'Depende de qué mires: ' + lista(partes) + '.' : 'Todavía no hay datos suficientes para decidirlo.';
      },
    },
    {
      claves: ['que falla', 'va mal', 'hago mal', 'peor video', 'video funciona peor'],
      texto: () => {
        const g = (P.veredicto || []).find((x) => x.clase === 'mal');
        return g && g.items.length ? 'Lo que más falla: ' + g.items.slice(0, 3).map((i, k) => `${k + 1}. ${i.t}`).join(' ') : 'Ahora mismo no veo nada que falle con claridad.';
      },
    },
    {
      claves: ['va bien', 'hago bien', 'que hago bien', 'que funciona bien'],
      texto: () => {
        const g = (P.veredicto || []).find((x) => x.clase === 'bien');
        return g && g.items.length ? 'Lo que va bien: ' + g.items.slice(0, 3).map((i, k) => `${k + 1}. ${i.t}`).join(' ') : 'Todavía no veo nada claramente bien.';
      },
    },
    {
      claves: ['publico', 'audiencia', 'quien me ve', 'gente fria', 'fria'],
      texto: () => {
        const frios = V.filter((v) => v.noSigue != null && v.vistas >= 100);
        const w = frios.reduce((s, v) => s + v.vistas, 0);
        const p = w ? Math.round(frios.reduce((s, v) => s + v.noSigue * v.vistas, 0) / w) : null;
        return p != null ? `Alrededor del ${p} % de lo que ven tus vídeos grandes es gente que no te sigue. Quien ya te sigue se queda más tiempo.` : 'Todavía no tengo vídeos con suficientes vistas para saberlo.';
      },
    },
  ];
}

async function conIAYoutube(env, pregunta, P) {
  if (!env.AI) return null;
  const resumen = {
    datosHasta: P.meta && P.meta.datosHasta,
    videos: (P.videos || []).map((v) => ({
      titulo: v.titulo, fecha: v.fecha, dias: v.dias, vistas: v.vistas, siguenAlMinuto: v.ret60 && Math.round(v.ret60),
      frenteAOtrosDeSuDuracion: { minuto: v.rel60, final90: v.rel90 }, clicsEnSugeridos: v.ctrSug && Math.round(v.ctrSug * 10) / 10,
      impresionesPrimeraSemana: v.semana1, noTeSigue: v.noSigue, vistasDeBusqueda: v.pBus, suscriptoresGanados: v.subs,
    })),
    queHacer: (P.acciones || []).slice(0, 5).map((a) => ({ accion: a.titulo, porque: a.porque })),
    veredicto: (P.veredicto || []).map((g) => ({ [g.titulo]: g.items.map((i) => i.t) })),
  };
  const sistema =
    'Eres Trufa, un conejo que ayuda a Abby a entender las analíticas de su canal de YouTube de divulgación sobre salud digestiva. ' +
    'Contestas en español de España, de tú, en tres frases como mucho, directo y sin rodeos ni tecnicismos. ' +
    'Usas SOLO los datos que te doy: si algo no está, dices que todavía no se puede saber. Nunca te inventas cifras. ' +
    'Nunca prometes resultados ni hablas de curar. La única llamada a la acción del canal es el test; no sugieras pedir suscripciones. Nada de emojis.';
  try {
    const r = await env.AI.run('@cf/meta/llama-3.1-8b-instruct', {
      messages: [
        { role: 'system', content: sistema + '\n\nDatos del panel de YouTube:\n' + JSON.stringify(resumen) },
        { role: 'user', content: pregunta },
      ],
      max_tokens: 260,
    });
    return (r && (r.response || r.result)) || null;
  } catch {
    return null;
  }
}

async function atenderYoutube(env, pregunta, panel) {
  const salida = (respuesta, fuente) => new Response(JSON.stringify({ respuesta, fuente }), { headers: JSON_ });
  const saludo = cortesiaYoutube(pregunta);
  if (saludo) return salida(saludo, 'trufa');

  // Las conclusiones las calcula el navegador (panel/analisis.js) y me las manda con la pregunta.
  const P = panel && typeof panel === 'object' && Array.isArray(panel.videos) ? panel : null;
  if (!P) return salida('Todavía no tengo tus datos de YouTube. Se cargan solos al abrir la pestaña: espera un momento y vuelve a preguntarme.', 'datos');

  const conocida = buscar(pregunta, respuestasYoutube(P));
  if (conocida) return salida(conocida.texto(), 'datos');

  const ia = await conIAYoutube(env, pregunta, P);
  if (ia) return salida(ia, 'ia');

  return salida('Esa no la sé contestar todavía. Prueba con «¿qué hago esta semana?», «¿dónde pierdo más gente?», «¿qué miniatura funciona mejor?» o «¿es bueno mi CTR?».', 'ninguna');
}

export async function onRequestPost(contexto) {
  try {
    return await atender(contexto);
  } catch (e) {
    return new Response(JSON.stringify({ respuesta: 'Se me ha atragantado algo: ' + e.message, fuente: 'error' }), { headers: JSON_ });
  }
}

async function atender({ request, env }) {
  let c;
  try {
    // Con la pregunta de YouTube viaja el panel calculado (unos 40 KB): más de medio mega no es normal.
    if (Number(request.headers.get('content-length') || 0) > 500000) throw new Error('demasiado grande');
    c = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: 'No te he entendido.' }), { status: 400, headers: JSON_ });
  }

  const pregunta = String(c.pregunta || '').trim().slice(0, 300);
  if (!pregunta) return new Response(JSON.stringify({ error: 'Pregúntame algo.' }), { status: 400, headers: JSON_ });

  if (c.vista === 'youtube') return atenderYoutube(env, pregunta, c.panel);

  const datos = await reunirDatos(env, c.desde, c.hasta);

  const saludo = cortesia(pregunta, datos);
  if (saludo) return new Response(JSON.stringify({ respuesta: saludo, fuente: 'trufa' }), { headers: JSON_ });

  const conocida = buscar(pregunta, respuestasConocidas(datos));
  if (conocida) {
    return new Response(JSON.stringify({ respuesta: conocida.texto(), fuente: 'datos' }), { headers: JSON_ });
  }

  const ia = await conIA(env, pregunta, datos);
  if (ia) return new Response(JSON.stringify({ respuesta: ia, fuente: 'ia' }), { headers: JSON_ });

  return new Response(
    JSON.stringify({
      respuesta:
        'Esa no la sé contestar todavía. Prueba con «¿cómo voy?», «¿cuántas me faltan para cubrir gastos?», ' +
        '«¿qué vídeo trae más gente?» o «¿sale a cuenta la publicidad?».',
      fuente: 'ninguna',
    }),
    { headers: JSON_ }
  );
}
