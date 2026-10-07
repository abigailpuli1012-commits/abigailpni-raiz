// La pantalla del panel pide aqui sus numeros.
import { reunirDatos } from '../../_datos.js';
import { refrescarYoutube } from '../../_youtube.js';

export async function onRequestGet({ request, env, waitUntil }) {
  const url = new URL(request.url);
  const datos = await reunirDatos(env, url.searchParams.get('desde'), url.searchParams.get('hasta'));

  // De paso, y sin hacer esperar al panel, se miran las visualizaciones de
  // YouTube si hace mas de seis horas que no se miran.
  if (waitUntil) waitUntil(refrescarYoutube(env));

  return Response.json(datos, { headers: { 'cache-control': 'no-store' } });
}
