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
  const t = ' ' + sinTildes(p).trim() + ' ';
  const tiene = (...xs) => xs.some((x) => t.includes(' ' + x + ' ') || t.trim() === x);

  if (tiene('hola', 'buenas', 'hey', 'holi', 'buenos dias', 'buenas tardes', 'buenas noches')) {
    const c = d.crudos;
    const estado = c.ventas === 0
      ? 'De momento no hay ventas en este periodo, pero el contador ya está puesto.'
      : `Vas por ${c.ventas} guías.`;
    return `¡Hola! ${estado} Puedes preguntarme cómo vas, qué vídeo trae más gente o si la publicidad sale a cuenta.`;
  }
  if (tiene('gracias', 'genial', 'perfecto', 'vale', 'ok', 'guay')) {
    return 'A mandar. Aquí sigo.';
  }
  if (tiene('quien eres', 'que eres', 'como te llamas', 'tu nombre')) {
    return 'Soy Trufa. Vivo en tu panel y me sé tus números: ventas, visitas, gastos y lo que sale de cruzarlos.';
  }
  if (tiene('que sabes', 'que puedes hacer', 'ayuda', 'que te puedo preguntar', 'opciones')) {
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
      claves: ['resumen', 'como voy', 'que tal', 'como va', 'negocio', 'balance'],
      texto: () => {
        const trozos = [];
        trozos.push(c.ventas === 0
          ? 'Todavía no hay ventas en este periodo.'
          : `Llevas ${num(c.ventas)} guías y ${euro(m.ingresos)}.`);
        if (c.visitasGuia) trozos.push(`${num(c.visitasGuia)} visitas a la página de la guía.`);
        if (m.conversion != null) trozos.push(`Compra el ${pct(m.conversion)} de las que entran.`);
        if (faltan != null) trozos.push(faltan === 0 ? 'Ya cubres gastos.' : `Te faltan ${num(faltan)} guías para cubrir gastos.`);
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
      if (suyas.every((w) => palabras.some((x) => x === w || x.startsWith(w) || w.startsWith(x))) && suyas.length > puntos) {
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
    c = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: 'No te he entendido.' }), { status: 400, headers: JSON_ });
  }

  const pregunta = String(c.pregunta || '').trim().slice(0, 300);
  if (!pregunta) return new Response(JSON.stringify({ error: 'Pregúntame algo.' }), { status: 400, headers: JSON_ });

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
