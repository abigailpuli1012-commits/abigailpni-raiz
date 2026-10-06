// Contador de visitas propio. Suma una visita al día de hoy para esta página,
// y si la visitante ha llegado por un enlace con marca (?v=sibo), la apunta
// para saber qué vídeo trae gente.
//
// No usa cookies ni guarda nada en el navegador, no manda la IP ni el
// referente, y no identifica a nadie: solo suma uno a un contador.
// Por eso no necesita banner de consentimiento.
(function () {
  try {
    var marca = new URLSearchParams(location.search).get('v') || '';
    var destino =
      '/api/visita?s=web&r=' +
      encodeURIComponent(location.pathname) +
      (marca ? '&v=' + encodeURIComponent(marca.slice(0, 40)) : '');

    if (navigator.sendBeacon) navigator.sendBeacon(destino);
    else fetch(destino, { method: 'POST', keepalive: true });
  } catch (e) {
    /* si falla, la página sigue funcionando igual */
  }
})();
