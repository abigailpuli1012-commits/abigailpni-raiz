// Impresiones y clics que Studio enseñaba el 6 de octubre de 2026, copiados a mano.
//
// Los informes de alcance de YouTube (impresiones y CTR) solo se generan desde 30 días antes de pedirlos
// (9 de septiembre) y no existen en la API de datos. Esto cubre lo que ellos no ven: los vídeos anteriores
// a esa fecha y, hasta que llegan los primeros informes, también los nuevos. En cuanto un vídeo tiene
// informes desde el día que se publicó, mandan los informes y esto se ignora.
//
// Formato por vídeo:
//   impr, ctr  → impresiones y CTR (%) de toda su vida, a 6/10
//   f          → por origen: [impresiones, CTR %]  (sug = sugeridos, exp = inicio y exploración,
//                can = páginas de canal, bus = búsqueda)
//   dias       → impresiones de cada día desde que se publicó (día 1, día 2…)

// «paquetes»: todos los largos con su CTR de toda la vida, leído en Studio el 12/10/2026 (los informes de
// alcance no llegan más atrás del 9 de septiembre). `mini` es el texto de la miniatura. Lo que ya tenga
// informes desde su publicación se actualiza solo y sustituye a estas cifras.
const PAQUETES = [
  { id: 'Ruz8F3RnzsU', pub: '2026-05-23', titulo: '¿Te despiertas a las 3 A.M.? No es ansiedad, es HISTAMINA', mini: '«¿3:17 am? No es ansiedad»', impr: 825, ctr: 8.2, vistas: 161 },
  { id: '26QbTN6qcjM', pub: '2026-05-27', titulo: 'Hacer dieta NO cura tus intolerancias: El origen real de la HISTAMINA', mini: '«El origen real»', impr: 2638, ctr: 2.8, vistas: 148 },
  { id: 'EEyCirHa4cs', pub: '2026-06-03', titulo: 'No es cansancio, es NIEBLA MENTAL: Cómo apagar el fuego en tu cerebro', mini: '«Tu cerebro inflamado»', impr: 1701, ctr: 6.7, vistas: 205 },
  { id: 'h7BdbioL4AA', pub: '2026-06-10', titulo: '¿Niebla mental a los 40? No te estás volviendo loca: Es una CRISIS ENERGÉTICA (PNI)', mini: '«No es tu Edad!»', impr: 4257, ctr: 2.4, vistas: 185 },
  { id: 'kvEsF6PltSo', pub: '2026-06-17', titulo: 'El enemigo invisible que te roba la energía', mini: null, impr: 356, ctr: 5.6, vistas: 38, privado: true },
  { id: 'q9PT0QKEkeM', pub: '2026-06-24', titulo: '¿NADA TE FUNCIONA? Tu NERVIO VAGO está bloqueado', mini: '«Nada funciona»', impr: 4369, ctr: 3.6, vistas: 244 },
  { id: 'q9n6uCVed2Q', pub: '2026-07-01', titulo: 'Cuando tu intestino está mal, tu cabeza también', mini: '«¿Ansiedad o Intestino?»', impr: 2292, ctr: 3.6, vistas: 127 },
  { id: 'KuPuqGBc89o', pub: '2026-07-08', titulo: 'Ayuno intermitente: por qué a ti te empeora', mini: '«¿Ayuno o Cortisol?»', impr: 2911, ctr: 2.9, vistas: 124 },
  { id: 'QuUUFYyV0k4', pub: '2026-07-08', titulo: 'Índice Glucémico vs. Carga Glucémica: por qué la sandía «engaña» más que el helado', mini: '«¿El IG Miente?»', impr: 482, ctr: 2.9, vistas: 30 },
  { id: 'L7f4WpnkThU', pub: '2026-07-16', titulo: 'Por qué no adelgazas en déficit calórico: La verdad sobre el Modo Supervivencia', mini: '«¿Tu metabolismo se protege?»', impr: 407, ctr: 3.2, vistas: 22, privado: true },
  { id: 'my_sHhvStsQ', pub: '2026-07-22', titulo: 'Por qué tienes niebla mental aunque comas bien', mini: '«Niebla Mental»', impr: 2005, ctr: 1.9, vistas: 60 },
  { id: 'HcBbDeHV5rE', pub: '2026-07-28', titulo: 'Siempre agotada aunque duermas: la razón real', mini: '«¿Siempre agotada?»', impr: 193, ctr: 5.2, vistas: 15 },
  { id: 'XKuw6HIb0DE', pub: '2026-07-29', titulo: 'Cortisol y niebla mental: la insulina que no llega', mini: '«Señal bloqueada»', impr: 707, ctr: 1.8, vistas: 36 },
  { id: 'V6FcXvNcJzY', pub: '2026-08-04', titulo: 'Zonulina: la proteína que apaga tu cerebro', mini: '«Cerebro al 60%»', impr: 507, ctr: 4.9, vistas: 43 },
  { id: 'dxe4Nsf62bI', pub: '2026-08-09', titulo: 'Hipersensibilidad visceral: por qué unos días sí y otros no', mini: '«El quinto factor»', impr: 681, ctr: 8.5, vistas: 96 },
  { id: 'IEYqMus4U5g', pub: '2026-08-11', titulo: 'COLON IRRITABLE: por qué la dieta NO te funciona', mini: '«¿Y ya está?» + papel «TODO NORMAL»', impr: 239, ctr: 7.1, vistas: 54 },
  { id: 'TEg9v9cgQ4U', pub: '2026-09-01', titulo: 'Por qué tu intestino reacciona a cualquier cosa y que hacer al respecto', mini: '«Como bien y me hincho»', impr: 461, ctr: 2.8, vistas: 32 },
  { id: '8s_jOGYrpVQ', pub: '2026-09-13', titulo: 'Hinchazón: no es lo que comiste, es cómo dormiste', mini: '«Dos noches antes.»', impr: 659, ctr: 3.5, vistas: 66 },
  { id: 'Nx2ePDQZ-GA', pub: '2026-09-20', titulo: 'Porque tardo mucho en hacer la digestion?', mini: '«Comí hace tres horas.»', impr: 2281, ctr: 2.2, vistas: 165 },
  { id: 't9wPppqOpjQ', pub: '2026-09-27', titulo: 'Por qué cada vez te sienta MAL más comida', mini: '«Esto es todo lo que como»', impr: 4460, ctr: 2.2, vistas: 227 },
  { id: 'X_KLxJJB3oM', pub: '2026-10-01', titulo: 'El trastorno alimentario que causan tus sintomas digestivos', mini: '«Trastorno de evitación de alimentos»', impr: 523, ctr: 2.3, vistas: 32 },
  { id: '8o0e-kC5uYU', pub: '2026-10-08', titulo: 'Lo que nadie mira antes de tratarte un SIBO', mini: '«Mejoré. Y volvió.»', impr: 596, ctr: 2.0, vistas: 32 },
];

// Día en que se cambió el título o la miniatura de un vídeo ya publicado ({ id: 'AAAA-MM-DD' }). El panel
// compara el CTR de antes y de después con los informes diarios de YouTube.
const CAMBIOS = {};

export const SEMILLA = {
  hasta: '2026-10-06',
  paquetes: PAQUETES,
  cambios: CAMBIOS,
  videos: {
    // Por qué cada vez te sienta MAL más comida
    t9wPppqOpjQ: {
      impr: 3971, ctr: 2.2,
      f: { sug: [3634, 2.0], exp: [286, 5.9], bus: [9, 0] },
      dias: [207, 408, 501, 452, 408, 529, 648, 292, 273, 253],
    },
    // Porque tardo mucho en hacer la digestion?
    'Nx2ePDQZ-GA': {
      impr: 2272, ctr: 2.2,
      f: { sug: [1804, 1.9], exp: [380, 2.6], can: [47, 8.5], bus: [33, 3.0] },
      dias: [608, 184, 102, 97, 221, 159, 258, 98, 102, 60, 73, 69],
    },
    // Hinchazón: no es lo que comiste, es cómo dormiste
    '8s_jOGYrpVQ': {
      impr: 646, ctr: 3.4,
      f: { sug: [473, 0.6], exp: [99, 6.1], can: [58, 22.4], bus: [16, 0] },
      dias: [43, 19, 29, 32, 50, 70, 65, 58, 23, 25, 24, 29],
    },
    // El trastorno alimentario que causan tus sintomas digestivos
    X_KLxJJB3oM: {
      impr: 417, ctr: 2.2,
      f: { sug: [362, 1.4], exp: [26, 11.5], can: [17, 5.9], bus: [12, 0] },
      dias: [46, 95, 99, 47, 60, 70],
    },
    // Hipersensibilidad visceral: por qué unos días sí y otros no
    dxe4Nsf62bI: {
      impr: 673, ctr: 8.3,
      f: { sug: [313, 1.9], exp: [83, 12.1], can: [128, 5.5], bus: [143, 22.4] },
      dias: [20, 35, 30, 40, 24, 26, 46],
    },
    // COLON IRRITABLE: por qué la dieta NO te funciona
    IEYqMus4U5g: {
      impr: 236, ctr: 7.2,
      dias: [0, 8, 8, 4, 26, 14, 2],
    },
    // Por qué tu intestino reacciona a cualquier cosa y que hacer al respecto
    TEg9v9cgQ4U: {
      impr: 455, ctr: 2.9,
      dias: [86, 27, 40, 27, 28, 36, 58],
    },
  },
};
