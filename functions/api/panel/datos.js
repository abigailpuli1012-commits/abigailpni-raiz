// La pantalla del panel pide aqui sus numeros.
import { reunirDatos } from '../../_datos.js';

export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const datos = await reunirDatos(env, url.searchParams.get('desde'), url.searchParams.get('hasta'));
  return Response.json(datos, { headers: { 'cache-control': 'no-store' } });
}
