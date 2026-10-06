// Todo lo que cuelga de /api/panel/ pide sesión, menos el propio acceso.
import { sesionValida } from '../../_sesion.js';

export async function onRequest(context) {
  const { request, env, next } = context;
  const ruta = new URL(request.url).pathname;

  if (ruta.startsWith('/api/panel/acceso')) return next();

  if (!(await sesionValida(request, env.PANEL))) {
    return new Response(JSON.stringify({ error: 'Hay que entrar.' }), {
      status: 401,
      headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
    });
  }

  return next();
}
