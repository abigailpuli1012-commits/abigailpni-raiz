/* La pestaña «Shorts» del panel. Pinta lo que le da /api/panel/youtube (la misma dirección que la de largos) y lo que
   calcula panel/analisis-shorts.js. Todo texto que viene del servidor se escapa antes de pintarlo. */
(function () {
  'use strict';

  const raiz = document.getElementById('vistaShorts');
  if (!raiz) return;

  const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
  const MES3 = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
  const POR_PAGINA = 12;

  const esc = (v) => String(v == null ? '' : v)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  const nf = (x) => Math.round(x).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  const dec = (x, d) => Number(x).toFixed(d).replace('.', ',');
  const el = (id) => document.getElementById(id);

  let P = null; // las conclusiones ya calculadas (aquí, en el navegador: panel/analisis-shorts.js)
  let datos = null; // lo que YouTube ha dado, en bruto
  let version = null; // versión de esos datos: así el servidor no repite lo que ya tenemos
  let motor = null; // construirShorts
  let estado = null; // cómo va la carga
  let orden = 'vistas';
  let verTodos = false;
  let temporizador = null;
  let construido = false;
  let activo = false;

  /* ---------- esqueleto ---------- */
  const trad = (k) => `<div class="yt-traductor" data-t="${k}"></div>`;
  function construir() {
    raiz.innerHTML = `
      <div class="yt-estado" id="ysEstado"></div>
      <div id="ysContenido">
        <div class="vistazo" id="ysVistazo"></div>

        <details open>
          <summary>🎯 Qué hacer esta semana <span class="flecha">▾</span></summary>
          <div class="cuerpo">
            <p class="nota">Las conclusiones de todo lo de abajo, <b>ordenadas por lo que más mueve el número</b>. Cada una dice qué hacer y por qué.</p>
            <div class="yt-acciones" id="ysAcciones"></div>
          </div>
        </details>

        <details open>
          <summary>🧠 El veredicto: qué va bien y qué falla <span class="flecha">▾</span></summary>
          <div class="cuerpo">
            <p class="nota">Se escribe solo, con unas reglas fijas. <b>Con la certeza al lado</b>, porque son pocos Shorts y las cifras de los últimos días todavía no están completas.</p>
            <div class="yt-grupos" id="ysVeredicto"></div>
          </div>
        </details>

        <details open>
          <summary>📆 Vistas día a día <span class="flecha">▾</span></summary>
          <div class="cuerpo">
            <p class="nota">Vistas de todos tus Shorts en los últimos 60 días. <b>Los puntos de abajo son los días en que publicaste.</b> Pasa el ratón (o el dedo) por una barra.</p>
            <div class="yt-grafico" id="ysDias"></div>
            ${trad('dias')}
          </div>
        </details>

        <details open>
          <summary>🏆 Tus Shorts, uno a uno <span class="flecha">▾</span></summary>
          <div class="cuerpo">
            <p class="nota">El número grande es el <b>% visto</b>: cuánto del Short ve la gente de media. Las cifras de los Shorts de los últimos días aún no están completas.</p>
            <div class="yt-conmuta" id="ysOrden">
              <button type="button" data-orden="vistas" aria-pressed="true">Más vistas</button>
              <button type="button" data-orden="retienen" aria-pressed="false">Los que más retienen (desde el giro)</button>
            </div>
            <div id="ysLista"></div>
            <button type="button" class="yt-actualizar ys-mas" id="ysMas" hidden></button>
            ${trad('ranking')}
          </div>
        </details>

        <details>
          <summary>⏱️ Duración frente a % visto <span class="flecha">▾</span></summary>
          <div class="cuerpo">
            <p class="nota">Tus Shorts desde el giro hacia el digestivo, agrupados por lo que duran. <b>Los grupos con pocos Shorts son una pista, no una ley.</b></p>
            <div id="ysDuracion"></div>
            <p class="yt-chico" id="ysNotaDur"></p>
            ${trad('duracion')}
          </div>
        </details>

        <details>
          <summary>🧭 De dónde llega la gente <span class="flecha">▾</span></summary>
          <div class="cuerpo">
            <p class="nota">Vistas de los últimos 90 días por origen. El <b>feed de Shorts</b> es gente que no te buscaba: YouTube se lo enseña porque sí.</p>
            <div id="ysOrigen"></div>
            <div class="yt-leyenda" id="ysLeyOrigen"></div>
            ${trad('origen')}
          </div>
        </details>

        <details>
          <summary>👥 Quién los ve <span class="flecha">▾</span></summary>
          <div class="cuerpo">
            <p class="nota">Vistas de gente que te sigue y de gente que no, y cuánto se queda cada una (últimos 90 días).</p>
            <div id="ysAud"></div>
            ${trad('aud')}
          </div>
        </details>

        <details open>
          <summary>🔔 Avisos <span class="flecha">▾</span></summary>
          <div class="cuerpo">
            <p class="nota">Cosas que el panel avisa solo, para no tener que acordarte.</p>
            <div class="yt-avisos" id="ysAvisos"></div>
          </div>
        </details>

        <details>
          <summary>📖 Diccionario: qué significa cada palabra <span class="flecha">▾</span></summary>
          <div class="cuerpo"><div class="yt-dic" id="ysDic"></div></div>
        </details>
      </div>`;
    construido = true;

    el('ysOrden').addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (!b || !P) return;
      orden = b.dataset.orden;
      verTodos = false;
      raiz.querySelectorAll('#ysOrden button').forEach((x) => x.setAttribute('aria-pressed', x === b ? 'true' : 'false'));
      pintarLista();
    });
    el('ysMas').addEventListener('click', () => { verTodos = !verTodos; pintarLista(); });
    // Si una miniatura no carga, se quita sin más.
    raiz.addEventListener('error', (e) => { if (e.target && e.target.tagName === 'IMG') e.target.remove(); }, true);
  }

  /* ---------- piezas ---------- */
  const vacio = (t) => `<p class="yt-vacio">${esc(t)}</p>`;
  function fechaLarga(iso) {
    if (!iso) return null;
    return `${Number(iso.slice(8, 10))} de ${MESES[Number(iso.slice(5, 7)) - 1]}`;
  }
  const fechaCorta = (iso) => `${Number(iso.slice(8, 10))} ${MES3[Number(iso.slice(5, 7)) - 1]}`;
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
    const caja = el('ysEstado');
    const cont = el('ysContenido');
    let html = '';
    if (estado && estado.hayClaves === false) {
      html = '<div class="yt-aviso-grande" style="flex-basis:100%"><b>Falta conectar Google.</b> Cuando el permiso de lectura esté guardado, esta pestaña se llena sola.</div>';
      cont.hidden = true;
    } else if (!P) {
      cont.hidden = true;
      if (estado && estado.error) {
        html = `<div class="yt-aviso-grande" style="flex-basis:100%"><b>No he podido cargar los datos de tus Shorts.</b> ${esc(estado.error)} Lo vuelvo a intentar solo.</div>`;
      } else {
        html = '<div class="yt-cargando" style="flex-basis:100%"><span class="yt-punto">🌸</span><br>Trayendo tus Shorts de YouTube… la primera vez tarda un momento.</div>';
      }
    } else {
      cont.hidden = false;
      const hasta = fechaLarga(P.meta && P.meta.datosHasta);
      html = `<span>Tus Shorts · datos de YouTube${hasta ? ` hasta el ${esc(hasta)}` : ''}${estado && estado.ultimo ? ` · actualizado ${esc(hace(estado.ultimo))}` : ''}</span>` +
        '<button type="button" class="yt-actualizar" id="ysActualizar">Actualizar</button>';
      if (estado && estado.error) {
        html += `<div class="yt-aviso-grande" style="flex-basis:100%;margin:6px 0 0"><b>Ojo:</b> ${esc(estado.error)} Lo que ves son los últimos datos buenos.</div>`;
      } else if (estado && estado.pendientes > 0) {
        html += '<span>· poniéndome al día…</span>';
      }
    }
    caja.innerHTML = html;
    const b = el('ysActualizar');
    if (b) b.addEventListener('click', actualizarAhora);
  }

  /* ---------- bloques ---------- */
  function pintarVistazo() {
    el('ysVistazo').innerHTML = (P.vistazo || []).map((g, i) =>
      `<div class="grande ${'abc'[i % 3]}"><div class="icono">${esc(g.icono)}</div><p class="rotulo">${esc(g.rotulo)}</p><p class="cifra">${esc(g.cifra)}</p><p class="pie">${esc(g.pie)}</p></div>`
    ).join('');
  }

  function pintarAcciones() {
    el('ysAcciones').innerHTML = (P.acciones || []).map((a, i) =>
      `<div class="yt-accion"><div class="yt-n">${i + 1}</div><div><p class="yt-t">${esc(a.icono)} ${esc(a.titulo)}</p><p class="yt-q">${esc(a.que)}</p>
        <p class="yt-p"><b>Por qué:</b> ${esc(a.porque)}</p>
        <div class="yt-etq"><span>impacto ${esc(a.impacto)}</span><span>esfuerzo ${esc(a.esfuerzo)}</span><span>certeza ${esc(a.certeza)}</span></div></div></div>`
    ).join('') || vacio('Ahora mismo no hay nada urgente que tocar.');
  }

  function pintarVeredicto() {
    el('ysVeredicto').innerHTML = (P.veredicto || []).map((g) =>
      `<div class="yt-grupo ${esc(g.clase)}"><h3>${esc(g.icono)} ${esc(g.titulo)}</h3>` +
      (g.items.length
        ? `<ul>${g.items.map((i) => `<li>${esc(i.t)}<span class="yt-cert">certeza ${esc(i.c)}</span></li>`).join('')}</ul>`
        : '<p class="yt-vacio-g">Nada por ahora.</p>') + '</div>'
    ).join('');
  }

  /* --- vistas por día, con los días de publicación --- */
  function pintarDias() {
    const s = P.serieDias || [];
    if (!s.length) { el('ysDias').innerHTML = vacio('Todavía no hay vistas por día.'); return; }
    const W = 700, H = 250, m = { l: 44, r: 10, t: 12, b: 44 };
    const iw = W - m.l - m.r, ih = H - m.t - m.b;
    const mx = Math.max(10, ...s.map((x) => x.v));
    const paso = mx <= 100 ? 20 : mx <= 300 ? 50 : mx <= 700 ? 100 : mx <= 1500 ? 250 : 500;
    const ymax = Math.ceil(mx / paso) * paso;
    const bw = iw / s.length;
    const X = (i) => m.l + i * bw;
    const Y = (v) => m.t + (1 - v / ymax) * ih;
    let g = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Vistas de los Shorts por día">`;
    for (let v = 0; v <= ymax; v += paso) {
      g += `<line x1="${m.l}" x2="${W - m.r}" y1="${Y(v)}" y2="${Y(v)}" stroke="#F2DFE5"/><text x="${m.l - 8}" y="${Y(v) + 4}" text-anchor="end" font-size="11" fill="#B9A4AC">${nf(v)}</text>`;
    }
    s.forEach((x, i) => {
      const h = Math.max(1, ih - (Y(x.v) - m.t));
      const fecha = fechaCorta(x.d);
      g += `<rect x="${(X(i) + bw * 0.11).toFixed(1)}" y="${(m.t + ih - h).toFixed(1)}" width="${(bw * 0.78).toFixed(1)}" height="${h.toFixed(1)}" rx="1.5" fill="${x.p ? '#E79BB0' : '#D9C4F0'}"><title>${esc(fecha)}: ${nf(x.v)} vistas${x.p ? ` · publicaste ${x.p}` : ''}</title></rect>`;
      if (x.p) g += `<circle cx="${(X(i) + bw / 2).toFixed(1)}" cy="${m.t + ih + 11}" r="${x.p > 1 ? 4.5 : 3.2}" fill="#C0607E"/>`;
      if (i % 7 === 0) g += `<text x="${(X(i) + bw / 2).toFixed(1)}" y="${H - 8}" text-anchor="middle" font-size="10.5" fill="#B9A4AC">${esc(fecha)}</text>`;
    });
    el('ysDias').innerHTML = g + '</svg>';
  }

  /* --- la lista de Shorts --- */
  function lista() {
    const F = P.filas || [];
    if (orden === 'retienen') {
      const porId = new Map(F.map((s) => [s.id, s]));
      return (P.porRet || []).map((id) => porId.get(id)).filter(Boolean);
    }
    return F;
  }
  function pintarLista() {
    const xs = lista();
    const ver = verTodos ? xs : xs.slice(0, POR_PAGINA);
    el('ysLista').innerHTML = ver.map((s) => {
      const ancho = Math.max(2, Math.min(100, s.pct));
      const bucle = s.pct > 100 ? ' · se repite en bucle' : '';
      return `<div class="ys-fila"><div class="ys-mini"><img src="https://i.ytimg.com/vi/${esc(s.id)}/mqdefault.jpg" alt="" loading="lazy"></div>
        <div><p class="yt-tit">${esc(s.titulo)}</p>
          <p class="yt-meta">${esc(s.fecha)} · ${esc(s.dur)} · ${nf(s.vistas)} vistas · ${nf(s.subs)} ${s.subs === 1 ? 'suscriptor' : 'suscriptores'}${s.reciente ? ' · cifras incompletas' : ''}${esc(bucle)}</p></div>
        <div class="ys-num"><b>${Math.round(s.pct)} %</b><div class="yt-pista"><span style="width:${ancho}%"></span></div><small>visto</small></div></div>`;
    }).join('') || vacio('Todavía no hay Shorts con datos.');
    const b = el('ysMas');
    if (xs.length > POR_PAGINA) { b.hidden = false; b.textContent = verTodos ? 'Ver menos' : `Ver los ${xs.length - POR_PAGINA} restantes`; } else { b.hidden = true; }
  }

  /* --- duración --- */
  function pintarDuracion() {
    const d = P.duracion || { cubos: [] };
    const hay = d.cubos.some((x) => x.n > 0);
    el('ysDuracion').innerHTML = hay
      ? `<div class="yt-rel-esc"><table class="ys-tabla"><thead><tr><th>Duración</th><th>Shorts</th><th>Vistas (mediana)</th><th>% visto</th><th>Suscr. por 1.000</th></tr></thead><tbody>` +
        d.cubos.map((x) => `<tr class="${x.n && x.n < 3 ? 'ys-poco' : ''}"><td>${esc(x.nombre)}</td><td>${x.n}${x.n && x.n < 3 ? ' <small>pocos</small>' : ''}</td>` +
          `<td>${x.vistasMed == null ? '—' : nf(x.vistasMed)}</td><td>${x.pct == null ? '—' : `<b>${dec(x.pct, 0)} %</b>`}</td><td>${x.subsMil == null ? '—' : dec(x.subsMil, 1)}</td></tr>`).join('') +
        '</tbody></table></div>'
      : vacio('Todavía no hay Shorts suficientes con datos completos.');
    el('ysNotaDur').textContent = d.nota || '';
  }

  /* --- de dónde llega --- */
  function pintarOrigen() {
    const o = P.origen;
    if (!o || !o.total) { el('ysOrigen').innerHTML = vacio('Todavía no hay datos de origen.'); el('ysLeyOrigen').innerHTML = ''; return; }
    el('ysOrigen').innerHTML = `<div class="yt-apilada" style="height:26px">${o.valores.map((x, k) => x ? `<span style="width:${x / o.total * 100}%;background:${o.nombres[k].c}" title="${esc(o.nombres[k].n)}: ${nf(x)}"></span>` : '').join('')}</div>`;
    el('ysLeyOrigen').innerHTML = o.valores.map((x, k) => x ? `<span><i style="background:${o.nombres[k].c}"></i>${esc(o.nombres[k].n)} · ${dec(x / o.total * 100, x / o.total < 0.1 ? 1 : 0)} %</span>` : '').join('');
  }

  /* --- quién los ve --- */
  function pintarAud() {
    const a = P.aud;
    el('ysAud').innerHTML = a
      ? `<div class="yt-aud"><div class="yt-apilada"><span style="width:${a.noP}%;background:#E79BB0">${a.noP} % no te sigue</span><span style="width:${a.siP}%;background:#B98DC9">${a.siP >= 10 ? a.siP + ' %' : ''}</span></div>
          <p class="yt-pie">No te siguen: <b>${esc(a.noAvd)} s</b> de media · Te siguen: <b>${esc(a.siAvd)} s</b> de media</p></div>`
      : vacio('Todavía no hay vistas suficientes para saberlo.');
  }

  function pintarAvisos() {
    el('ysAvisos').innerHTML = (P.avisos || []).map((a) => `<div class="yt-aviso"><span class="yt-ico">${esc(a.i)}</span><span>${esc(a.t)}</span></div>`).join('') || vacio('Nada que avisar.');
    el('ysDic').innerHTML = (P.dic || []).map((x) => `<div><b>${esc(x.t)}</b>${esc(x.d)}</div>`).join('');
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
    pintarVistazo(); pintarAcciones(); pintarVeredicto(); pintarDias(); pintarLista();
    pintarDuracion(); pintarOrigen(); pintarAud(); pintarAvisos(); pintarTraductores();
  }

  /* ---------- la carga ---------- */
  function visible() { return activo && !document.hidden; }

  function programar() {
    clearTimeout(temporizador);
    const deprisa = (!P && !(estado && estado.error)) || (estado && estado.pendientes > 0 && !estado.error);
    temporizador = setTimeout(() => { if (visible()) cargar(); else programar(); }, deprisa ? 6000 : 60000);
  }

  // El cálculo de las conclusiones vive en panel/analisis-shorts.js y se hace aquí, en el navegador.
  async function recalcular() {
    if (!motor) motor = (await import('/panel/analisis-shorts.js')).construirShorts;
    // Para comparar con los largos: lo que han sumado desde agosto.
    let vistas = 0;
    let subs = 0;
    for (const t of Object.values(datos.totales || {})) { vistas += t.views || 0; subs += t.subscribersGained || 0; }
    P = datos.cortos ? motor({ ahora: new Date().toISOString(), cortos: datos.cortos, largos: { vistas, subs } }) : null;
    window.panelShorts = P; // Trufa lo lee de aquí para contestar
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
    const b = el('ysActualizar');
    if (b) { b.disabled = true; b.textContent = 'Actualizando…'; }
    try { await fetch('/api/panel/youtube', { method: 'POST' }); } catch (e) { /* se reintenta solo */ }
    setTimeout(cargar, 2500);
  }

  /* ---------- se enciende y se apaga desde las pestañas ---------- */
  document.addEventListener('vista-panel', (e) => {
    activo = e.detail === 'shorts';
    if (!activo) { clearTimeout(temporizador); return; }
    if (!construido) { construir(); pintarEstado(); }
    cargar();
  });
  document.addEventListener('visibilitychange', () => { if (visible()) cargar(); });
})();
