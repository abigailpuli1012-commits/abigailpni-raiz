// TEMPORAL: solo para verificar los calculos. Se borra en cuanto se compruebe.
import { reunirDatos } from '../_datos.js';

export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  if (!env.WEBHOOK_TOKEN || url.searchParams.get('k') !== env.WEBHOOK_TOKEN) {
    return new Response('no', { status: 403 });
  }
  const d = await reunirDatos(env, url.searchParams.get('desde'), url.searchParams.get('hasta'));
  return Response.json(d, { headers: { 'cache-control': 'no-store' } });
}
