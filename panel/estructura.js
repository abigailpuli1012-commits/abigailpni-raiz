/* Navegación por secciones y botón de subir. Solo ayuda a moverse: no lee ni cambia datos. */
(function () {
  'use strict';
  var IDS = ['vistaGuia', 'vistaYoutube', 'vistaShorts'];
  var vistas = document.getElementById('vistas');
  if (!vistas) return;

  var barra = document.createElement('nav');
  barra.className = 'ir-a';
  barra.setAttribute('aria-label', 'Ir a una sección');
  barra.hidden = true;
  vistas.insertAdjacentElement('afterend', barra);

  var subir = document.createElement('button');
  subir.type = 'button';
  subir.className = 'arriba';
  subir.setAttribute('aria-label', 'Subir al principio');
  subir.textContent = '↑';
  document.body.appendChild(subir);
  subir.addEventListener('click', function () { window.scrollTo({ top: 0, behavior: 'smooth' }); });

  var firma = '';
  var secciones = [];

  function vistaActiva() {
    for (var i = 0; i < IDS.length; i++) {
      var v = document.getElementById(IDS[i]);
      if (v && !v.hidden) return v;
    }
    return null;
  }

  function titulo(summary) {
    var c = summary.cloneNode(true);
    var f = c.querySelector('.flecha');
    if (f) f.remove();
    return c.textContent.replace(/\s+/g, ' ').trim();
  }

  function construir() {
    var v = vistaActiva();
    var lista = [];
    if (v) {
      var ds = v.querySelectorAll('details');
      for (var i = 0; i < ds.length; i++) {
        var d = ds[i];
        if (d.parentElement.closest('details')) continue;
        var s = d.querySelector('summary');
        if (!s || d.offsetParent === null) continue;
        lista.push({ d: d, t: titulo(s) });
      }
    }
    var nueva = (v ? v.id : '') + '|' + lista.map(function (x) { return x.t; }).join('|');
    if (nueva === firma) return;
    firma = nueva;
    secciones = lista;
    barra.textContent = '';
    if (lista.length < 3) { barra.hidden = true; return; }
    barra.hidden = false;

    var todo = document.createElement('button');
    todo.type = 'button';
    todo.className = 'todo';
    todo.textContent = '⇅ Abrir todo';
    todo.addEventListener('click', function () {
      var abrir = secciones.some(function (x) { return !x.d.open; });
      secciones.forEach(function (x) { x.d.open = abrir; });
      todo.textContent = abrir ? '⇅ Cerrar todo' : '⇅ Abrir todo';
    });
    barra.appendChild(todo);

    lista.forEach(function (x) {
      var b = document.createElement('button');
      b.type = 'button';
      b.textContent = x.t.length > 30 ? x.t.slice(0, 29) + '…' : x.t;
      b.addEventListener('click', function () {
        x.d.open = true;
        x.d.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
      x.b = b;
      barra.appendChild(b);
    });
    marcar();
  }

  function marcar() {
    subir.classList.toggle('ver', window.scrollY > 700);
    if (!secciones.length) return;
    var corte = window.innerWidth <= 760 ? 90 : 150;
    var actual = null;
    for (var i = 0; i < secciones.length; i++) {
      if (secciones[i].d.getBoundingClientRect().top <= corte) actual = secciones[i];
    }
    secciones.forEach(function (x) {
      var on = x === actual;
      if (x.b && x.b.classList.contains('on') !== on) {
        x.b.classList.toggle('on', on);
        if (on) {
          var l = x.b.offsetLeft - barra.clientWidth / 2 + x.b.clientWidth / 2;
          barra.scrollTo({ left: l, behavior: 'smooth' });
        }
      }
    });
  }

  var tic = null;
  function pronto() {
    if (tic) return;
    tic = setTimeout(function () { tic = null; construir(); marcar(); }, 250);
  }

  var cola = false;
  window.addEventListener('scroll', function () {
    if (cola) return;
    cola = true;
    requestAnimationFrame(function () { cola = false; marcar(); });
  }, { passive: true });

  var mo = new MutationObserver(pronto);
  IDS.forEach(function (id) {
    var v = document.getElementById(id);
    if (v) mo.observe(v, { attributes: true, attributeFilter: ['hidden'], childList: true, subtree: true });
  });
  vistas.addEventListener('click', function () {
    setTimeout(function () { construir(); window.scrollTo(0, 0); }, 60);
  });
  window.addEventListener('resize', pronto);
  construir();
})();
