// Si no hay sesión, en vez del panel se sirve la pantalla de entrada.
import { sesionValida, hayClave } from '../_sesion.js';

function pantalla(configurado) {
  const crear = !configurado;
  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${crear ? 'Crea tu contraseña' : 'Entrar'} · Panel</title>
<meta name="robots" content="noindex, nofollow">
<style>
:root{
  --fondo:#FDF6F7; --tinta:#4A3A42; --suave:#8C7580;
  --rosa:#E79BB0; --rosa-claro:#FBE7EC; --malva:#B98DC9;
  --borde:#F0DCE2; --blanco:#FFFFFF;
}
*{box-sizing:border-box}
html,body{margin:0;height:100%}
body{
  background:
    radial-gradient(900px 500px at 15% -5%, #FCE9F0 0%, transparent 60%),
    radial-gradient(800px 500px at 95% 105%, #EDE6F7 0%, transparent 60%),
    var(--fondo);
  color:var(--tinta);
  font-family:ui-rounded,'SF Pro Rounded','Segoe UI Variable Display','Segoe UI',system-ui,sans-serif;
  display:grid;place-items:center;padding:24px;line-height:1.55;
}
.caja{
  width:100%;max-width:400px;background:var(--blanco);border:1px solid var(--borde);
  border-radius:22px;padding:34px 30px 30px;box-shadow:0 18px 50px -24px rgba(159,106,128,.45);
}
.emoji{font-size:34px;line-height:1;margin:0 0 12px}
h1{font-size:23px;font-weight:600;margin:0 0 6px;letter-spacing:-.01em}
p.intro{margin:0 0 22px;color:var(--suave);font-size:14px}
label{display:block;font-size:12.5px;font-weight:600;color:var(--suave);margin:0 0 6px}
input{
  width:100%;padding:12px 14px;margin:0 0 15px;font:inherit;font-size:15px;
  border:1px solid var(--borde);border-radius:12px;background:#FFFCFD;color:var(--tinta);
}
input:focus{outline:none;border-color:var(--rosa);box-shadow:0 0 0 3px var(--rosa-claro)}
button{
  width:100%;padding:13px;border:none;border-radius:12px;cursor:pointer;
  font:inherit;font-size:15px;font-weight:700;color:#fff;
  background:linear-gradient(135deg,var(--rosa),var(--malva));
}
button:disabled{opacity:.6;cursor:default}
.error{
  margin:0 0 15px;padding:10px 13px;border-radius:11px;font-size:13.5px;
  background:#FDEBEF;border:1px solid #F3C6D1;color:#9E4A62;
}
.pista{margin:16px 0 0;font-size:12.5px;color:var(--suave);text-align:center}
.pista a{color:var(--malva);text-decoration:none;font-weight:600}
.pista a:hover{text-decoration:underline}
.codigo{
  margin:0 0 20px;padding:15px;border-radius:13px;text-align:center;
  font-family:ui-monospace,'SFMono-Regular',Consolas,monospace;font-size:19px;font-weight:700;
  letter-spacing:.06em;color:#8A5A72;background:var(--rosa-claro);border:1px dashed var(--rosa);
  user-select:all;
}
</style>
</head>
<body>
  <form class="caja" id="f" autocomplete="on">
    <p class="emoji">${crear ? '🌸' : '🔐'}</p>
    <h1>${crear ? 'Crea tu contraseña' : 'Tu panel'}</h1>
    <p class="intro">${crear
      ? 'Es la primera vez que entras. Elige una contraseña: se guarda cifrada y solo la sabes tú.'
      : 'Entra con tu correo y tu contraseña.'}</p>

    <div id="error"></div>

    <label for="correo">Correo</label>
    <input id="correo" name="username" type="email" autocomplete="username" required>

    <label for="clave">Contraseña</label>
    <input id="clave" name="password" type="password"
           autocomplete="${crear ? 'new-password' : 'current-password'}"
           minlength="8" required>

    ${crear ? `<label for="clave2">Repítela</label>
    <input id="clave2" type="password" autocomplete="new-password" minlength="8" required>` : ''}

    <button type="submit">${crear ? 'Crear y entrar' : 'Entrar'}</button>
    <p class="pista">${crear
      ? 'Mínimo 8 caracteres. Te daré un código por si se te olvida.'
      : 'La sesión dura 30 días. <a href="#" id="olvide">He olvidado la contraseña</a>'}</p>
  </form>

  <form class="caja" id="fRecuperar" hidden autocomplete="off">
    <p class="emoji">🗝️</p>
    <h1>Recuperar</h1>
    <p class="intro">Escribe el código de recuperación que guardaste y elige una contraseña nueva.</p>
    <div id="errorRec"></div>
    <label for="codigo">Código de recuperación</label>
    <input id="codigo" type="text" placeholder="XXXX-XXXX-XXXX-XXXX" required>
    <label for="claveNueva">Contraseña nueva</label>
    <input id="claveNueva" type="password" autocomplete="new-password" minlength="8" required>
    <button type="submit">Cambiarla y entrar</button>
    <p class="pista"><a href="#" id="volver">Volver</a></p>
  </form>

  <div class="caja" id="cajaCodigo" hidden>
    <p class="emoji">🗝️</p>
    <h1>Guarda este código</h1>
    <p class="intro">Es lo único que te dejará entrar si se te olvida la contraseña.
      Apúntalo donde no lo pierdas: <b>no se puede volver a ver</b>.</p>
    <p class="codigo" id="elCodigo"></p>
    <button type="button" id="yaLoTengo">Ya lo tengo apuntado</button>
  </div>

<script>
const crear = ${crear};
const f = document.getElementById('f');
const cajaError = document.getElementById('error');

f.addEventListener('submit', async (e) => {
  e.preventDefault();
  cajaError.innerHTML = '';

  const correo = document.getElementById('correo').value;
  const clave = document.getElementById('clave').value;

  if (crear && clave !== document.getElementById('clave2').value) {
    cajaError.innerHTML = '<p class="error">Las dos contraseñas no coinciden.</p>';
    return;
  }

  const boton = f.querySelector('button');
  boton.disabled = true;
  boton.textContent = 'Un momento…';

  try {
    const r = await fetch('/api/panel/acceso', {
      method:'POST', headers:{'content-type':'application/json'},
      body: JSON.stringify({ accion: crear ? 'crear' : 'entrar', correo, clave })
    });
    const d = await r.json();
    if (r.ok) {
      if (d.codigo) { mostrarCodigo(d.codigo); return; }
      location.reload(); return;
    }
    cajaError.innerHTML = '<p class="error">' + (d.error || 'No ha podido ser.') + '</p>';
  } catch {
    cajaError.innerHTML = '<p class="error">No he podido conectar. Inténtalo otra vez.</p>';
  }

  boton.disabled = false;
  boton.textContent = crear ? 'Crear y entrar' : 'Entrar';
});

function mostrarCodigo(codigo){
  f.hidden = true;
  document.getElementById('fRecuperar').hidden = true;
  document.getElementById('elCodigo').textContent = codigo;
  document.getElementById('cajaCodigo').hidden = false;
}

document.getElementById('yaLoTengo').addEventListener('click', () => location.reload());

const fRec = document.getElementById('fRecuperar');
const olvide = document.getElementById('olvide');
if (olvide) olvide.addEventListener('click', (e) => { e.preventDefault(); f.hidden = true; fRec.hidden = false; });
document.getElementById('volver').addEventListener('click', (e) => { e.preventDefault(); fRec.hidden = true; f.hidden = false; });

fRec.addEventListener('submit', async (e) => {
  e.preventDefault();
  const caja = document.getElementById('errorRec');
  caja.innerHTML = '';
  const boton = fRec.querySelector('button');
  boton.disabled = true; boton.textContent = 'Un momento…';
  try {
    const r = await fetch('/api/panel/acceso', {
      method:'POST', headers:{'content-type':'application/json'},
      body: JSON.stringify({ accion:'recuperar',
        codigo: document.getElementById('codigo').value,
        clave: document.getElementById('claveNueva').value })
    });
    const d = await r.json();
    if (r.ok) { mostrarCodigo(d.codigo); return; }
    caja.innerHTML = '<p class="error">' + (d.error || 'No ha podido ser.') + '</p>';
  } catch {
    caja.innerHTML = '<p class="error">No he podido conectar.</p>';
  }
  boton.disabled = false; boton.textContent = 'Cambiarla y entrar';
});
</script>
</body>
</html>`;
}

export async function onRequest({ request, env, next }) {
  if (await sesionValida(request, env.PANEL)) return next();

  return new Response(pantalla(await hayClave(env.PANEL)), {
    status: 401,
    headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' },
  });
}
