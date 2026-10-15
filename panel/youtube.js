/* La pestaña «YouTube» del panel. Pinta lo que le da /api/panel/youtube.
   Todo texto que viene del servidor se escapa antes de pintarlo. */
(function () {
  'use strict';

  const raiz = document.getElementById('vistaYoutube');
  if (!raiz) return;

  const COL = ['#E79BB0', '#B98DC9', '#6FC3A4', '#F0A878', '#7FB5DC', '#A0587C', '#9AA9A0', '#D98B5F', '#7C6FC3', '#C9A24D'];
  const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

  const esc = (v) => String(v == null ? '' : v)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  const nf = (x) => Math.round(x).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  const dec = (x, d) => Number(x).toFixed(d).replace('.', ',');
  const el = (id) => document.getElementById(id);

  let P = null; // el panel ya calculado (aquí, en el navegador: panel/analisis.js)
  let datos = null; // lo que YouTube ha dado, en bruto, tal cual lo manda el servidor
  let version = null; // versión de esos datos: así el servidor no repite lo que ya tenemos
  let motor = null; // construirPanel
  let semilla = null; // copia de Studio para lo que los informes de YouTube no cubren
  let estado = null; // cómo va la carga
  let avisoActualizar = null; // lo que se dice si se pulsa «Actualizar» y no hace falta cargar nada
  let modo = 'min';
  let ocultos = null;
  let temporizador = null;
  let construido = false;
  let activo = false;

  /* ---------- esqueleto ---------- */
  const trad = (k) => `<div class="yt-traductor" data-t="${k}"></div>`;
  function construir() {
    raiz.innerHTML = `
      <div class="yt-estado" id="ytEstado"></div>
      <div id="ytContenido">
        <div class="vistazo" id="ytVistazo"></div>

        <details open>
          <summary>🎯 Qué hacer esta semana <span class="flecha">▾</span></summary>
          <div class="cuerpo">
            <p class="nota">Las conclusiones de todo lo de abajo, <b>ordenadas por lo que más mueve el número</b>. Cada una dice qué hacer y por qué.</p>
            <div class="yt-acciones" id="ytAcciones"></div>
            <p class="yt-nada" id="ytNada" hidden></p>
          </div>
        </details>

        <details open>
          <summary>🧠 El veredicto: qué va bien y qué falla <span class="flecha">▾</span></summary>
          <div class="cuerpo">
            <p class="nota">Se escribe solo, con unas reglas fijas: tema frente a lo que reparte YouTube, arranque, final y miniatura. <b>Con la certeza al lado</b>, porque son pocos vídeos.</p>
            <div class="yt-grupos" id="ytVeredicto"></div>
          </div>
        </details>

        <details open>
          <summary>🚦 Un semáforo por vídeo <span class="flecha">▾</span></summary>
          <div class="cuerpo">
            <p class="nota">Cuatro preguntas por vídeo: <b>¿lo reparte YouTube?</b> (impresiones la primera semana), <b>¿te eligen?</b> (clics en «sugeridos», la gente que no te conoce), <b>¿se quedan al minuto?</b> y <b>¿llegan al final?</b> (las dos, frente a vídeos de su misma duración).</p>
            <div id="ytSemaforo"></div>
            <p class="yt-chico">Umbrales propuestos: reparto, 1.500 y 500 impresiones; clics, 3 % y 1,5 %; minuto y final, 0,5 y 0,35 sobre la mediana de YouTube.</p>
            ${trad('semaforo')}
          </div>
        </details>

        <details open>
          <summary>📉 Dónde se va la gente <span class="flecha">▾</span></summary>
          <div class="cuerpo">
            <p class="nota">De cada 100 personas que empiezan el vídeo, <b>cuántas siguen</b> en cada momento. Pasa el ratón (o el dedo) por la gráfica.</p>
            <div class="yt-conmuta" id="ytConmuta">
              <button type="button" data-modo="min" aria-pressed="true">Primer minuto</button>
              <button type="button" data-modo="todo" aria-pressed="false">Vídeo entero</button>
            </div>
            <div class="yt-chips" id="ytChips"></div>
            <div class="yt-grafico" id="ytRet"></div>
            <p class="yt-chico" id="ytNotaRet"></p>
            ${trad('curvas')}
          </div>
        </details>

        <details open>
          <summary>📏 Frente a otros vídeos de su duración <span class="flecha">▾</span></summary>
          <div class="cuerpo">
            <p class="nota">Dato oficial de YouTube: compara cada punto de tu vídeo con <b>todos los vídeos de duración parecida</b>. 0,5 es la mediana. Verde: mejor que la mitad. Rosa: peor que la mayoría.</p>
            <div id="ytRel"></div>
            ${trad('rel')}
          </div>
        </details>

        <details>
          <summary>🏁 Cuánta gente llega al 80 % y al 90 % <span class="flecha">▾</span></summary>
          <div class="cuerpo">
            <p class="nota">Cuántas personas, de cada 100 que empezaron, siguen viendo cuando llevas el 80 % y el 90 % del vídeo.</p>
            <div id="ytFila80"></div>
            ${trad('r80')}
          </div>
        </details>

        <details>
          <summary>🚀 Lo que reparte YouTube, día a día <span class="flecha">▾</span></summary>
          <div class="cuerpo">
            <p class="nota">Impresiones por día desde que se publica cada vídeo. Si YouTube lo sostiene, la línea se mantiene; si lo prueba y lo suelta, cae tras el primer día.</p>
            <div class="yt-grafico" id="ytDia"></div>
            <div class="yt-leyenda" id="ytLeyDia"></div>
            ${trad('dia')}
          </div>
        </details>

        <details>
          <summary>🧭 De dónde llega la gente <span class="flecha">▾</span></summary>
          <div class="cuerpo">
            <p class="nota">Vistas por origen. <b>Sugeridos</b> e <b>inicio</b> es gente que no te buscaba; <b>búsqueda</b> y <b>páginas de canal</b> es gente que venía a por ti.</p>
            <div id="ytOrigen"></div>
            <div class="yt-leyenda" id="ytLeyOrigen"></div>
            ${trad('origen')}
          </div>
        </details>

        <details>
          <summary>🖱️ Tu CTR frente a lo habitual <span class="flecha">▾</span></summary>
          <div class="cuerpo">
            <p class="nota">Cada punto es un vídeo y su tamaño es cuántas impresiones tuvo (cuanto más grande, más fiable). La franja verde es lo que suelen citar las herramientas de terceros: <b>orientativo, no oficial</b>. Lo oficial: la mitad de los canales está entre el 2 y el 10 %.</p>
            <div id="ytTiras"></div>
            <div class="yt-leyenda" id="ytLeyTiras"></div>
            ${trad('ctr')}
          </div>
        </details>

        <details open>
          <summary>🖼️ Miniaturas frente a clics <span class="flecha">▾</span></summary>
          <div class="cuerpo">
            <p class="nota">CTR en sugeridos (gente fría) de cada miniatura. La raya verde es el 3 %.</p>
            <div class="yt-tarjetas" id="ytTarjetas"></div>
            <p class="yt-chico">Pista con pocos vídeos, no una ley.</p>
            ${trad('miniaturas')}
          </div>
        </details>

        <details open>
          <summary>📦 Tus paquetes: título y miniatura frente al CTR <span class="flecha">▾</span></summary>
          <div class="cuerpo">
            <p class="nota">Todos tus vídeos largos, con el texto de su miniatura y el CTR de toda su vida. <b>El CTR baja solo al crecer las impresiones</b> (YouTube lo enseña a gente más fría), así que se compara con volumen parecido.</p>
            <div id="ytPaqResumen"></div>
            <div id="ytPaquetes"></div>
            <div id="ytCambios"></div>
            ${trad('paquetes')}
          </div>
        </details>

        <details>
          <summary>👥 Quién los ve <span class="flecha">▾</span></summary>
          <div class="cuerpo">
            <p class="nota">Vistas de gente que te sigue y de gente que no, y cuánto se queda cada una.</p>
            <div id="ytAud"></div>
            ${trad('aud')}
          </div>
        </details>

        <details open>
          <summary>🔔 Avisos <span class="flecha">▾</span></summary>
          <div class="cuerpo">
            <p class="nota">Cosas que el panel avisa solo, para no tener que acordarte.</p>
            <div class="yt-avisos" id="ytAvisos"></div>
          </div>
        </details>

        <details>
          <summary>📖 Diccionario: qué significa cada palabra <span class="flecha">▾</span></summary>
          <div class="cuerpo"><div class="yt-dic" id="ytDic"></div></div>
        </details>
      </div>`;
    construido = true;
    ocultos = null;

    el('ytChips').addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (!b || !P) return;
      const i = Number(b.dataset.i);
      if (ocultos.has(i)) ocultos.delete(i); else ocultos.add(i);
      pintarChips();
      dibujarRet();
    });
    el('ytConmuta').addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (!b || !P) return;
      modo = b.dataset.modo;
      raiz.querySelectorAll('#ytConmuta button').forEach((x) => x.setAttribute('aria-pressed', x === b ? 'true' : 'false'));
      dibujarRet();
    });
    // Si una miniatura no carga, se quita sin más.
    raiz.addEventListener('error', (e) => { if (e.target && e.target.tagName === 'IMG') e.target.remove(); }, true);
  }

  /* ---------- piezas ---------- */
  const foto = (v) => `<div class="yt-mini"><img src="https://i.ytimg.com/vi/${esc(v.id)}/mqdefault.jpg" alt="" loading="lazy"><span class="yt-dur">${esc(v.dur)}</span></div>`;
  const vacio = (t) => `<p class="yt-vacio">${esc(t)}</p>`;
  const sinAlcance = () => (P.meta && P.meta.alcance === 'ninguna'
    ? 'Esto se llena solo cuando lleguen los informes de impresiones de YouTube (tardan hasta 48 horas desde que se pidieron).'
    : 'Todavía no hay datos suficientes para esto.');
  const V = () => P.videos || [];

  function fechaLarga(iso) {
    if (!iso) return null;
    return `${Number(iso.slice(8, 10))} de ${MESES[Number(iso.slice(5, 7)) - 1]}`;
  }
  function hace(iso) {
    if (!iso) return null;
    const m = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 60000));
    if (m < 2) return 'hace un momento';
    if (m < 90) return `hace ${m} min`;
    const h = Math.round(m / 60);
    if (h < 36) return `hace ${h} h`;
    return `hace ${Math.round(h / 24)} días`;
  }

  /* ---------- el estado de la carga ---------- */
  function pintarEstado() {
    const caja = el('ytEstado');
    const cont = el('ytContenido');
    let html = '';
    if (estado && estado.hayClaves === false) {
      html = '<div class="yt-aviso-grande" style="flex-basis:100%"><b>Falta conectar Google.</b> Cuando el permiso de lectura esté guardado, esta pestaña se llena sola.</div>';
      cont.hidden = true;
    } else if (!P || !datos || !datos.videos) {
      cont.hidden = true;
      if (estado && estado.error) {
        html = `<div class="yt-aviso-grande" style="flex-basis:100%"><b>No he podido cargar los datos de YouTube.</b> ${esc(estado.error)} Lo vuelvo a intentar solo.</div>`;
      } else {
        html = '<div class="yt-cargando" style="flex-basis:100%"><span class="yt-punto">🌸</span><br>Cargando tus datos de YouTube… la primera vez tarda un par de minutos.</div>';
      }
    } else {
      cont.hidden = false;
      const hasta = fechaLarga(P.meta && P.meta.datosHasta);
      html = `<span>Tus vídeos largos · datos de YouTube${hasta ? ` hasta el ${esc(hasta)}` : ''}${estado && estado.ultimo ? ` · actualizado ${esc(hace(estado.ultimo))}` : ''}</span>` +
        '<button type="button" class="yt-actualizar" id="ytActualizar">Actualizar</button>';
      if (estado && estado.error) {
        html += `<div class="yt-aviso-grande" style="flex-basis:100%;margin:6px 0 0"><b>Ojo:</b> ${esc(estado.error)} Lo que ves son los últimos datos buenos.</div>`;
      } else if (estado && estado.pendientes > 0) {
        html += '<span>· poniéndome al día…</span>';
      }
      if (avisoActualizar && Date.now() < avisoActualizar.hasta) {
        html += `<div class="yt-aviso-grande" style="flex-basis:100%;margin:6px 0 0">${esc(avisoActualizar.texto)}</div>`;
      }
    }
    caja.innerHTML = html;
    const b = el('ytActualizar');
    if (b) b.addEventListener('click', actualizarAhora);
  }

  /* ---------- bloques ---------- */
  function pintarVistazo() {
    el('ytVistazo').innerHTML = (P.vistazo || []).map((g, i) =>
      `<div class="grande ${'abc'[i % 3]}"><div class="icono">${esc(g.icono)}</div><p class="rotulo">${esc(g.rotulo)}</p><p class="cifra">${esc(g.cifra)}</p><p class="pie">${esc(g.pie)}</p></div>`
    ).join('');
  }

  function pintarAcciones() {
    el('ytAcciones').innerHTML = (P.acciones || []).map((a, i) =>
      `<div class="yt-accion"><div class="yt-n">${i + 1}</div><div><p class="yt-t">${esc(a.icono)} ${esc(a.titulo)}</p><p class="yt-q">${esc(a.que)}</p>
        <p class="yt-p"><b>Por qué:</b> ${esc(a.porque)}</p>
        <div class="yt-etq"><span>impacto ${esc(a.impacto)}</span><span>esfuerzo ${esc(a.esfuerzo)}</span><span>certeza ${esc(a.certeza)}</span></div></div></div>`
    ).join('') || vacio('Ahora mismo no hay nada urgente que tocar.');
    const n = el('ytNada');
    if (P.noTocar) { n.innerHTML = '<b>🚫 Mejor no tocar:</b> ' + esc(P.noTocar); n.hidden = false; } else { n.hidden = true; }
  }

  function pintarVeredicto() {
    el('ytVeredicto').innerHTML = (P.veredicto || []).map((g) =>
      `<div class="yt-grupo ${esc(g.clase)}"><h3>${esc(g.icono)} ${esc(g.titulo)}</h3>` +
      (g.items.length
        ? `<ul>${g.items.map((i) => `<li>${esc(i.t)}<span class="yt-cert">certeza ${esc(i.c)}</span></li>`).join('')}</ul>`
        : '<p class="yt-vacio-g">Nada por ahora.</p>') + '</div>'
    ).join('');
  }

  function pintarSemaforo() {
    const luz = (l, nombre, texto, ayuda) =>
      `<div class="yt-luz ${esc(l.c)}"${ayuda ? ` title="${esc(ayuda)}"` : ''}><i></i><b>${nombre}</b> ${esc(texto)} <em>${esc(l.t)}</em></div>`;
    el('ytSemaforo').innerHTML = V().map((v) => {
      const t1 = v.semana1 == null ? '—' : v.semana1Completa ? `${nf(v.semana1)} la 1.ª semana` : `${nf(v.semana1)} en ${Math.max(v.dias, 0)} días`;
      const t2 = v.ctrSug == null ? '—' : dec(v.ctrSug, 1) + ' %';
      const t3 = v.ret60 == null ? '—' : Math.round(v.ret60) + ' % siguen';
      const t4 = v.r90 == null ? '—' : Math.round(v.r90) + ' % llegan';
      const meta = [v.fecha, v.vistas ? `${nf(v.vistas)} vistas` : (v.dias <= 0 ? 'sin datos aún' : '0 vistas'), v.publico].filter(Boolean).join(' · ');
      return `<div class="yt-video">${foto(v)}<div><p class="yt-tit">${esc(v.titulo)}</p><p class="yt-meta">${esc(meta)}</p>
        <div class="yt-luces">
          ${luz(v.luzReparto, 'Reparto', t1, 'Lo que YouTube enseña tu miniatura en la primera semana. No mide interés.')}
          ${luz(v.luzEleccion, 'Te eligen', t2, 'Clics en sugeridos: gente que no te conoce.')}
          ${luz(v.luzMinuto, 'Al minuto', t3, v.rel60 == null ? '' : `Frente a vídeos de su duración: ${dec(v.rel60, 2)} (0,5 es la mediana)`)}
          ${luz(v.luzFinal, 'El final', t4, v.rel90 == null ? '' : `Hacia el 90 % del vídeo, frente a los de su duración: ${dec(v.rel90, 2)} (0,5 es la mediana)`)}
        </div></div></div>`;
    }).join('') || vacio('Todavía no hay vídeos largos publicados.');
  }

  /* --- la curva de retención --- */
  function conCurva() { return V().map((v, i) => i).filter((i) => P.ret.min[i] && P.ret.todo[i]); }
  function pintarChips() {
    const idx = conCurva();
    el('ytChips').innerHTML = idx.map((i) =>
      `<button type="button" data-i="${i}" aria-pressed="${!ocultos.has(i)}" title="${esc(V()[i].titulo)}"><i style="background:${COL[i % COL.length]}"></i><span>${esc(V()[i].corto)}</span></button>`
    ).join('');
  }
  function dibujarRet() {
    const idx = conCurva().filter((i) => !ocultos.has(i));
    const W = 700, H = 300, m = { l: 40, r: 14, t: 14, b: 34 };
    const iw = W - m.l - m.r, ih = H - m.t - m.b;
    const xmax = modo === 'min' ? 60 : 100;
    const X = (v) => m.l + v / xmax * iw;
    const Y = (p) => m.t + (100 - p) / 100 * ih;
    if (!conCurva().length) { el('ytRet').innerHTML = vacio('Todavía no hay curvas de retención.'); el('ytNotaRet').textContent = ''; return; }
    let s = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Retención de la audiencia">`;
    for (let p = 0; p <= 100; p += 25) {
      s += `<line x1="${m.l}" x2="${W - m.r}" y1="${Y(p)}" y2="${Y(p)}" stroke="#F2DFE5"/><text x="${m.l - 8}" y="${Y(p) + 4}" text-anchor="end" font-size="11" fill="#B9A4AC">${p} %</text>`;
    }
    const marcas = modo === 'min' ? [[10, '10 s'], [20, '20 s'], [30, '30 s'], [45, '45 s'], [60, '1 min']] : [[25, '25 %'], [50, 'mitad'], [80, '80 %'], [90, '90 %'], [100, 'final']];
    marcas.forEach(([v, t]) => {
      const fuerte = (modo === 'min' && v === 30) || (modo === 'todo' && (v === 80 || v === 90));
      s += `<line x1="${X(v)}" x2="${X(v)}" y1="${m.t}" y2="${H - m.b}" stroke="${fuerte ? '#B98DC9' : '#F7EDF1'}" stroke-dasharray="${fuerte ? '4 4' : ''}"/>`;
      s += `<text x="${X(v)}" y="${H - 12}" text-anchor="middle" font-size="11" fill="${fuerte ? '#B98DC9' : '#B9A4AC'}">${t}</text>`;
    });
    const datos = modo === 'min' ? P.ret.min : P.ret.todo;
    idx.forEach((i) => {
      const d = datos[i].map((p, k) => `${k ? 'L' : 'M'}${X(k).toFixed(1)},${Y(p).toFixed(1)}`).join(' ');
      s += `<path d="${d}" fill="none" stroke="${COL[i % COL.length]}" stroke-width="${V()[i].vistas >= 100 ? 3 : 2.2}" stroke-linejoin="round" stroke-linecap="round"/>`;
    });
    s += `<line id="ytGuia" x1="0" x2="0" y1="${m.t}" y2="${H - m.b}" stroke="#8C7580" stroke-width="1" style="display:none"/></svg><div class="yt-tip" id="ytTip"></div>`;
    el('ytRet').innerHTML = s;
    el('ytNotaRet').textContent = modo === 'min'
      ? 'Línea discontinua: los 30 segundos. YouTube da un punto por cada 1 % de la duración del vídeo; entre puntos, la línea es una interpolación.'
      : 'Líneas discontinuas: el 80 % y el 90 % del vídeo. Las líneas gruesas son los vídeos con 100 vistas o más.';

    const svg = el('ytRet').querySelector('svg'), tip = el('ytTip'), guia = el('ytGuia');
    const mover = (cx) => {
      const r = svg.getBoundingClientRect();
      const x = (cx - r.left) / r.width * W;
      const v = Math.round((x - m.l) / iw * xmax);
      if (v < 0 || v > xmax) { tip.style.display = 'none'; guia.style.display = 'none'; return; }
      guia.setAttribute('x1', X(v)); guia.setAttribute('x2', X(v)); guia.style.display = '';
      const filas = idx.map((i) => `<div><i style="background:${COL[i % COL.length]}"></i>${esc(V()[i].corto)}<span>${Math.round(datos[i][v])} %</span></div>`).join('');
      tip.innerHTML = `<b>${modo === 'min' ? v + ' segundos' : v + ' % del vídeo'}</b>${filas}`;
      tip.style.display = 'block';
      const px = (X(v) / W) * r.width;
      tip.style.left = Math.min(Math.max(px + 12, 4), Math.max(4, r.width - tip.offsetWidth - 4)) + 'px';
      tip.style.top = '8px';
    };
    svg.addEventListener('mousemove', (e) => mover(e.clientX));
    svg.addEventListener('touchmove', (e) => mover(e.touches[0].clientX), { passive: true });
    svg.addEventListener('mouseleave', () => { tip.style.display = 'none'; guia.style.display = 'none'; });
  }

  /* --- frente a otros vídeos de su duración --- */
  function pintarRel() {
    const r = P.rel || { cols: [], filas: [] };
    if (!r.filas.length) { el('ytRel').innerHTML = vacio('Todavía no hay vídeos con suficientes vistas para compararlos.'); return; }
    const clase = (x) => (x == null ? '' : x >= 0.5 ? 'v' : x >= 0.35 ? 'a' : 'r');
    el('ytRel').innerHTML = `<div class="yt-rel-esc"><table class="yt-rel"><thead><tr><th>Vídeo</th>${r.cols.map((c) => `<th>${esc(c)}</th>`).join('')}</tr></thead><tbody>` +
      r.filas.map((f) => {
        const v = V()[f.v];
        return `<tr><td class="yt-rel-nom">${esc(v.titulo)}${v.vistas < 40 ? '<small>poca muestra</small>' : ''}</td>` +
          f.vals.map((x) => `<td class="yt-rel-c"><span class="${clase(x)}">${x == null ? '—' : dec(x, 2)}</span></td>`).join('') + '</tr>';
      }).join('') + '</tbody></table></div>' +
      '<div class="yt-rel-leyenda"><span><i style="background:#E2F5EE"></i>0,5 o más: como la mediana o mejor</span><span><i style="background:#FDEDE2"></i>0,35-0,5: algo por debajo</span><span><i style="background:#FCE9EE"></i>menos de 0,35: muy por debajo</span></div>';
  }

  /* --- 80 % y 90 % --- */
  function pintarFila80() {
    const filas = V().map((v, i) => ({ v, i })).filter((x) => x.v.r80 != null);
    el('ytFila80').innerHTML = filas.map(({ v, i }) => {
      const poca = v.vistas < 60 ? ' · poca muestra' : '';
      return `<div class="yt-fila80"><div class="yt-nom"><span style="color:${COL[i % COL.length]}">●</span> ${esc(v.titulo)}<small>${nf(v.vistas)} vistas${poca}</small></div>
        <div class="yt-dos">
          <div class="yt-bar"><em>80 %</em><div class="yt-pista"><span style="width:${Math.round(v.r80)}%;background:${COL[i % COL.length]}"></span></div><b>${Math.round(v.r80)} %</b></div>
          <div class="yt-bar"><em>90 %</em><div class="yt-pista"><span style="width:${Math.round(v.r90)}%;background:${COL[i % COL.length]};opacity:.7"></span></div><b>${Math.round(v.r90)} %</b></div>
        </div></div>`;
    }).join('') || vacio('Todavía no hay curvas de retención.');
  }

  /* --- impresiones por día --- */
  function pintarDia() {
    const series = (P.dia && P.dia.series) || [];
    if (!series.length) { el('ytDia').innerHTML = vacio(sinAlcance()); el('ytLeyDia').innerHTML = ''; return; }
    const W = 700, H = 260, m = { l: 44, r: 14, t: 14, b: 30 };
    const iw = W - m.l - m.r, ih = H - m.t - m.b;
    const xmax = Math.max(7, ...series.map((s) => s.datos.length));
    const mx = Math.max(1, ...series.map((s) => Math.max(...s.datos)));
    const paso = mx <= 100 ? 20 : mx <= 300 ? 50 : mx <= 700 ? 100 : mx <= 1500 ? 250 : 500;
    const ymax = Math.ceil(mx / paso) * paso;
    const X = (d) => m.l + (d - 1) / (xmax - 1) * iw;
    const Y = (v) => m.t + (1 - v / ymax) * ih;
    let s = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Impresiones por día">`;
    for (let v = 0; v <= ymax; v += paso) {
      s += `<line x1="${m.l}" x2="${W - m.r}" y1="${Y(v)}" y2="${Y(v)}" stroke="#F2DFE5"/><text x="${m.l - 8}" y="${Y(v) + 4}" text-anchor="end" font-size="11" fill="#B9A4AC">${nf(v)}</text>`;
    }
    for (let d = 1; d <= xmax; d++) s += `<text x="${X(d)}" y="${H - 9}" text-anchor="middle" font-size="11" fill="#B9A4AC">${d}</text>`;
    s += `<text x="${W - m.r}" y="${m.t + 2}" text-anchor="end" font-size="11" fill="#B9A4AC">día desde la publicación</text>`;
    series.forEach((srv) => {
      const c = COL[srv.v % COL.length];
      const d = srv.datos.map((p, k) => `${k ? 'L' : 'M'}${X(k + 1).toFixed(1)},${Y(p).toFixed(1)}`).join(' ');
      s += `<path d="${d}" fill="none" stroke="${c}" stroke-width="2.6" stroke-linejoin="round" stroke-linecap="round"/>`;
      srv.datos.forEach((p, k) => { s += `<circle cx="${X(k + 1)}" cy="${Y(p)}" r="3" fill="${c}"><title>${esc(V()[srv.v].titulo)}: ${nf(p)} impresiones el día ${k + 1}</title></circle>`; });
    });
    el('ytDia').innerHTML = s + '</svg>';
    el('ytLeyDia').innerHTML = series.map((srv) => `<span><i style="background:${COL[srv.v % COL.length]}"></i>${esc(V()[srv.v].titulo)}</span>`).join('') +
      (P.dia.nota ? `<span style="flex-basis:100%">${esc(P.dia.nota)}</span>` : '');
  }

  /* --- de dónde llega --- */
  function pintarOrigen() {
    const o = P.origen || { nombres: [], filas: [] };
    el('ytOrigen').innerHTML = o.filas.map((f) =>
      `<div class="yt-origen"><p class="yt-nom">${esc(V()[f.vid].titulo)} <small style="color:var(--tenue);font-weight:400">· ${nf(f.tot)} vistas</small></p>
        <div class="yt-apilada">${f.v.map((x, k) => x ? `<span style="width:${x / f.tot * 100}%;background:${o.nombres[k].c}" title="${esc(o.nombres[k].n)}: ${nf(x)}"></span>` : '').join('')}</div></div>`
    ).join('') || vacio('Todavía no hay vídeos con vistas suficientes.');
    el('ytLeyOrigen').innerHTML = o.nombres.map((n) => `<span><i style="background:${n.c}"></i>${esc(n.n)}</span>`).join('');
  }

  /* --- CTR por origen --- */
  function pintarTiras() {
    const tiras = P.ctrOrigen || [];
    if (!tiras.length) { el('ytTiras').innerHTML = vacio(sinAlcance()); el('ytLeyTiras').innerHTML = ''; return; }
    const W = 700, H = 74, m = { l: 14, r: 14 };
    const iw = W - m.l - m.r;
    const usados = new Set();
    el('ytTiras').innerHTML = tiras.map((o) => {
      const X = (c) => m.l + Math.min(c, o.max) / o.max * iw;
      let s = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="CTR en ${esc(o.nombre)}">`;
      s += `<rect x="${m.l}" y="26" width="${iw}" height="16" rx="8" fill="#F7EDF1"/>`;
      s += `<rect x="${X(o.ref[0])}" y="26" width="${X(o.ref[1]) - X(o.ref[0])}" height="16" rx="8" fill="#6FC3A4" opacity=".38"/>`;
      for (let t = 0; t <= o.max; t += o.paso) s += `<text x="${X(t)}" y="64" text-anchor="middle" font-size="11" fill="#B9A4AC">${t} %</text>`;
      o.puntos.forEach((p) => {
        usados.add(p.v);
        const r = Math.max(5, Math.min(13, Math.sqrt(p.impr) / 4));
        s += `<circle cx="${X(p.ctr)}" cy="34" r="${r}" fill="${COL[p.v % COL.length]}" fill-opacity=".85" stroke="#fff" stroke-width="1.5"><title>${esc(V()[p.v].titulo)}: ${dec(p.ctr, 1)} % con ${nf(p.impr)} impresiones</title></circle>`;
      });
      return `<div class="yt-tira"><p class="yt-nom">${esc(o.nombre)} <small>· franja habitual ${o.ref[0]}-${o.ref[1]} %</small></p>${s}</svg></div>`;
    }).join('');
    el('ytLeyTiras').innerHTML = [...usados].sort((a, b) => a - b).map((i) => `<span><i style="background:${COL[i % COL.length]}"></i>${esc(V()[i].titulo)}</span>`).join('');
  }

  /* --- miniaturas --- */
  function pintarMiniaturas() {
    const m = P.miniaturas || [];
    el('ytTarjetas').innerHTML = m.map((t) => {
      const v = V()[t.v];
      return `<div class="yt-tarjeta">${foto(v)}<p class="yt-texto">${esc(v.titulo)}</p><p class="yt-ctr">${dec(t.ctr, 1)} %</p>
        <div class="yt-pista"><span style="width:${Math.min(100, t.ctr / 4 * 100)}%"></span><u style="left:${3 / 4 * 100}%"></u></div>
        <p class="yt-pie">en sugeridos · ${nf(t.impr)} impresiones</p></div>`;
    }).join('') || vacio(sinAlcance());
  }

  /* --- los paquetes: cada vídeo con su CTR --- */
  function pintarPaquetes() {
    const q = P.paquetes || { filas: [], resumen: null, cambios: [] };
    const r = q.resumen;
    const celda = (g) => (g && g.n ? `<b>${dec(g.ctr, 1)} %</b><small>${g.n} ${g.n === 1 ? 'vídeo' : 'vídeos'}</small>` : '<span class="yt-sin">—</span>');
    el('ytPaqResumen').innerHTML = r
      ? `<div class="yt-rel-esc"><table class="yt-paq-res"><thead><tr><th></th><th>Poco volumen<small>menos de 1.000 impresiones</small></th><th>Mucho volumen<small>más de 1.000 impresiones</small></th></tr></thead><tbody>
          <tr><td class="yt-era antes">Hasta agosto</td><td>${celda(r.antes.poco)}</td><td>${celda(r.antes.mucho)}</td></tr>
          <tr><td class="yt-era sobrio">Septiembre-octubre (miniaturas sobrias)</td><td>${celda(r.sobrio.poco)}</td><td>${celda(r.sobrio.mucho)}</td></tr>
          <tr><td class="yt-era nuevo">Publicados desde el 12/10</td><td>${celda(r.nuevo.poco)}</td><td>${celda(r.nuevo.mucho)}</td></tr>
        </tbody></table></div>`
      : '';
    const filas = [...q.filas].reverse();
    el('ytPaquetes').innerHTML = filas.map((f) => {
      const ancho = Math.max(2, Math.min(100, (f.ctr / 10) * 100));
      return `<div class="yt-paq ${esc(f.era)}"><div class="yt-mini"><img src="https://i.ytimg.com/vi/${esc(f.id)}/mqdefault.jpg" alt="" loading="lazy"></div>
        <div><p class="yt-tit">${esc(f.titulo)}${f.noPublico ? ' <small class="yt-nopub">(no público)</small>' : ''}</p>
          <p class="yt-meta">${esc(f.fecha)} · ${nf(f.impr)} impresiones${f.mini ? ` · miniatura: ${esc(f.mini)}` : ''}</p></div>
        <div class="yt-paq-ctr"><b>${dec(f.ctr, 1)} %</b><div class="yt-pista"><span style="width:${ancho}%"></span></div></div></div>`;
    }).join('') || vacio('Todavía no hay datos de impresiones.');
    const c = q.cambios || [];
    el('ytCambios').innerHTML = c.length
      ? '<p class="yt-nota"><b>Vídeos con el paquete cambiado</b> (CTR de los días de antes frente a los de después, con los informes diarios de YouTube):</p>' +
        c.map((x) => `<div class="yt-aviso"><span class="yt-ico">🔁</span><span><b>${esc(x.titulo)}</b> · cambio el ${esc(x.fecha.split('-').reverse().join('/'))}: antes ${x.antes.ctr == null ? '—' : dec(x.antes.ctr, 1) + ' %'} (${nf(x.antes.impr)} impr.) → después ${x.despues.ctr == null ? 'todavía sin datos' : dec(x.despues.ctr, 1) + ' %'} (${nf(x.despues.impr)} impr.)</span></div>`).join('')
      : '';
  }

  /* --- quién los ve --- */
  function pintarAud() {
    el('ytAud').innerHTML = (P.aud || []).map((a) =>
      `<div class="yt-aud"><p class="yt-nom">${esc(V()[a.v].titulo)}</p>
        <div class="yt-apilada"><span style="width:${a.noP}%;background:#E79BB0">${a.noP} % no te sigue</span><span style="width:${a.siP}%;background:#B98DC9">${a.siP >= 10 ? a.siP + ' %' : ''}</span></div>
        <p class="yt-pie">No te siguen: <b>${esc(a.noAvd)}</b> de media · Te siguen: <b>${esc(a.siAvd)}</b> de media</p></div>`
    ).join('') || vacio('Todavía no hay vídeos con vistas suficientes.');
  }

  function pintarAvisos() {
    el('ytAvisos').innerHTML = (P.avisos || []).map((a) => `<div class="yt-aviso"><span class="yt-ico">${esc(a.i)}</span><span>${esc(a.t)}</span></div>`).join('') || vacio('Nada que avisar.');
    el('ytDic').innerHTML = (P.dic || []).map((x) => `<div><b>${esc(x.t)}</b>${esc(x.d)}</div>`).join('');
  }

  function pintarTraductores() {
    raiz.querySelectorAll('.yt-traductor').forEach((n) => {
      const t = P.trad && P.trad[n.dataset.t];
      n.innerHTML = t ? `<div><h4>💡 Qué significa</h4><p>${esc(t.sig)}</p></div><div class="yt-hago"><h4>🛠️ Qué hago</h4><p>${esc(t.hago)}</p></div>` : '';
      n.hidden = !t;
    });
  }

  function pintar() {
    if (!P || !construido) return;
    if (!ocultos) ocultos = new Set(P.ocultosInicio || []);
    pintarVistazo(); pintarAcciones(); pintarVeredicto(); pintarSemaforo();
    pintarChips(); dibujarRet(); pintarRel(); pintarFila80(); pintarDia(); pintarOrigen();
    pintarTiras(); pintarMiniaturas(); pintarPaquetes(); pintarAud(); pintarAvisos(); pintarTraductores();
  }

  /* ---------- la carga ---------- */
  function visible() { return activo && !document.hidden; }

  function programar() {
    clearTimeout(temporizador);
    const deprisa = !datos || !datos.videos || (estado && estado.pendientes > 0 && !estado.error);
    temporizador = setTimeout(() => { if (visible()) cargar(); else programar(); }, deprisa ? 6000 : 60000);
  }

  // El cálculo de las conclusiones vive en panel/analisis.js y se hace aquí, en el navegador.
  async function recalcular() {
    if (!motor) {
      const [a, b] = await Promise.all([import('/panel/analisis.js'), import('/panel/semilla.js')]);
      motor = a.construirPanel;
      semilla = b.SEMILLA;
    }
    P = motor({
      ahora: new Date().toISOString(),
      videos: (datos.videos && datos.videos.videos) || [],
      totales: datos.totales || {},
      canal: datos.canal,
      porVideo: datos.porVideo || {},
      alcance: datos.alcance || { b: {}, c: {} },
      semilla,
    });
    window.panelYoutube = P; // Trufa lo lee de aquí para contestar
    pintar();
  }

  async function cargar() {
    try {
      const r = await fetch('/api/panel/youtube' + (version ? '?v=' + encodeURIComponent(version) : ''), { cache: 'no-store' });
      if (r.status === 401) { location.reload(); return; }
      if (!r.ok) throw new Error(r.status);
      const d = await r.json();
      estado = d.estado || null;
      if (d.datos) {
        version = d.version;
        datos = d.datos;
        await recalcular();
      }
      pintarEstado();
    } catch (e) {
      if (!P) { estado = { error: 'No he podido conectar.' }; pintarEstado(); }
    }
    programar();
  }

  async function actualizarAhora() {
    // Si la última carga fue hace menos de un cuarto de hora, el servidor no empieza otra (para no gastar el cupo de YouTube):
    // en vez de dejar el botón mudo, se dice por qué y qué es lo más reciente que hay.
    const min = estado && estado.ultimo ? (Date.now() - Date.parse(estado.ultimo)) / 60000 : null;
    if (min !== null && min < 15 && !(estado.pendientes > 0)) {
      const tope = fechaLarga(P && P.meta && P.meta.datosHasta);
      avisoActualizar = {
        texto: `Ya está al día: la última carga fue ${hace(estado.ultimo)}. ` +
          (tope ? `YouTube entrega los datos con 2 o 3 días de retraso, así que lo más reciente que hay es el ${tope}. ` : '') +
          'Puedes volver a pulsar pasados 15 minutos.',
        hasta: Date.now() + 20000,
      };
      pintarEstado();
      setTimeout(pintarEstado, 20500);
      return;
    }
    avisoActualizar = null;
    const b = el('ytActualizar');
    if (b) { b.disabled = true; b.textContent = 'Actualizando…'; }
    try { await fetch('/api/panel/youtube', { method: 'POST' }); } catch (e) { /* se reintenta solo */ }
    setTimeout(cargar, 2500);
  }

  /* ---------- se enciende y se apaga desde las pestañas ---------- */
  document.addEventListener('vista-panel', (e) => {
    activo = e.detail === 'youtube';
    if (!activo) { clearTimeout(temporizador); return; }
    if (!construido) { construir(); pintarEstado(); }
    cargar();
  });
  document.addEventListener('visibilitychange', () => { if (visible()) cargar(); });
})();
