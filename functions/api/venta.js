// Recibe el aviso que manda Systeme cada vez que alguien compra.
// La regla de automatización de Systeme («Venta nueva» → «Enviar webhook»)
// apunta a https://abigailpni.com/api/venta?k=<WEBHOOK_TOKEN>
//
// Guardamos el cuerpo entero en `bruto` y además intentamos sacar los campos
// que nos interesan. Systeme no documenta la forma exacta del envío, así que
// se prueban varios nombres posibles y, si algo no se encuentra, queda a null:
// con el primer aviso real se mira `bruto` y se afina.

const CANDIDATOS = {
  importe: ['amount', 'total', 'price', 'order.amount', 'order.total', 'sale.amount', 'data.amount'],
  moneda: ['currency', 'order.currency', 'sale.currency', 'data.currency'],
  producto: ['product', 'product_name', 'productName', 'item', 'order.product', 'order.product_name', 'sale.product', 'data.product'],
  cupon: ['coupon', 'coupon_code', 'couponCode', 'promo_code', 'order.coupon', 'data.coupon'],
  correo: ['email', 'contact.email', 'customer.email', 'buyer.email', 'order.email', 'data.email'],
};

function leer(objeto, ruta) {
  return ruta.split('.').reduce((o, k) => (o == null ? undefined : o[k]), objeto);
}

function primero(objeto, rutas) {
  for (const ruta of rutas) {
    const v = leer(objeto, ruta);
    if (v !== undefined && v !== null && v !== '') return v;
  }
  return null;
}

function numero(v) {
  if (v == null) return null;
  const n = typeof v === 'number' ? v : parseFloat(String(v).replace(',', '.').replace(/[^\d.-]/g, ''));
  return Number.isFinite(n) ? n : null;
}

// Guardamos una huella del correo, no el correo: sirve para saber si una
// compradora repite (y poder calcular el LTV) sin almacenar el dato personal.
async function huella(correo) {
  if (!correo) return null;
  const datos = new TextEncoder().encode(String(correo).trim().toLowerCase());
  const resumen = await crypto.subtle.digest('SHA-256', datos);
  return [...new Uint8Array(resumen)].slice(0, 8).map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function guardar(request, env) {
  const url = new URL(request.url);
  const token = url.searchParams.get('k');
  if (!env.WEBHOOK_TOKEN || token !== env.WEBHOOK_TOKEN) {
    return new Response('no autorizado', { status: 403 });
  }

  const texto = await request.text();
  let cuerpo = {};
  try {
    cuerpo = JSON.parse(texto);
  } catch {
    // Si no viene como JSON, puede venir como formulario.
    try {
      cuerpo = Object.fromEntries(new URLSearchParams(texto));
    } catch {
      cuerpo = {};
    }
  }

  const ahora = new Date();
  const dia = ahora.toISOString().slice(0, 10);

  await env.PANEL.prepare(
    `INSERT INTO ventas (recibida, dia, producto, importe, moneda, cupon, contacto, origen, bruto)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  )
    .bind(
      ahora.toISOString(),
      dia,
      primero(cuerpo, CANDIDATOS.producto),
      numero(primero(cuerpo, CANDIDATOS.importe)),
      primero(cuerpo, CANDIDATOS.moneda) || 'EUR',
      primero(cuerpo, CANDIDATOS.cupon),
      await huella(primero(cuerpo, CANDIDATOS.correo)),
      url.searchParams.get('origen'),
      texto.slice(0, 20000)
    )
    .run();

  return new Response('ok');
}

export const onRequestPost = ({ request, env }) => guardar(request, env);

// Systeme podría mandarlo por GET al probar la regla; lo aceptamos igual.
export const onRequestGet = ({ request, env }) => guardar(request, env);
