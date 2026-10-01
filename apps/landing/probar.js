/**
 * Arma el restaurante de prueba y muestra por dónde entrar a cada pantalla.
 *
 * Se pide al cargar y no con otro botón: quien llega acá ya tocó "Probar la
 * app" en la landing, y pedirle que lo confirme de nuevo es cobrarle dos
 * veces la misma decisión.
 */
const API = 'https://itadaki-api.onrender.com/api';

const APPS = {
  mesa: 'https://mesa.itadaki.app',
  cocina: 'https://cocina.itadaki.app',
  salon: 'https://salon.itadaki.app',
  admin: 'https://admin.itadaki.app',
};

const estado = document.getElementById('estado');
const listo = document.getElementById('listo');

function poner(id, texto) {
  const donde = document.getElementById(id);
  if (donde !== null) donde.textContent = texto;
}

function enlazar(id, url) {
  const donde = document.getElementById(id);
  if (donde !== null) donde.href = url;
}

/** Cuánto le queda, en palabras. Se refresca solo mientras la pestaña viva. */
function contar(expiraEn) {
  const faltan = Math.max(0, Math.round((expiraEn.getTime() - Date.now()) / 60_000));
  const horas = Math.floor(faltan / 60);
  const minutos = faltan % 60;

  poner(
    'queda',
    faltan === 0
      ? 'Tu restaurante de prueba venció.'
      : horas > 0
        ? `Tu restaurante de prueba vive ${horas} h ${minutos} min más.`
        : `Tu restaurante de prueba vive ${minutos} min más.`,
  );
}

function fallar(mensaje) {
  estado.hidden = false;
  estado.textContent = mensaje;
}

async function armar() {
  let respuesta;
  try {
    respuesta = await fetch(`${API}/demo`, { method: 'POST' });
  } catch {
    // La primera visita del día despierta al servidor y puede tardar: decirlo
    // es mejor que un error que no explica nada.
    fallar('No pudimos conectarnos con el servidor. Esperá un momento y recargá la página.');
    return;
  }

  if (respuesta.status === 503) {
    fallar(
      'Ahora mismo no hay lugar: hay varios restaurantes de prueba abiertos. ' +
        'Volvé a intentar en un rato, o escribinos por WhatsApp y te lo mostramos.',
    );
    return;
  }

  if (respuesta.status === 429) {
    fallar('Ya armaste varios restaurantes de prueba. Probá de nuevo más tarde.');
    return;
  }

  if (!respuesta.ok) {
    fallar('No pudimos armar el restaurante de prueba. Probá de nuevo en un momento.');
    return;
  }

  const demo = await respuesta.json();
  const porRol = Object.fromEntries(demo.accesos.map((acceso) => [acceso.rol, acceso]));

  enlazar('link-mesa', `${APPS.mesa}/bienvenida?t=${encodeURIComponent(demo.tableToken)}`);
  enlazar('link-cocina', `${APPS.cocina}/${demo.tenantId}`);
  enlazar('link-salon', `${APPS.salon}/${demo.tenantId}`);
  enlazar('link-panel', `${APPS.admin}/${demo.tenantId}`);

  poner('cocina-usuario', porRol.KITCHEN.usuario);
  poner('cocina-clave', porRol.KITCHEN.clave);
  poner('salon-usuario', porRol.CAJA.usuario);
  poner('salon-clave', porRol.CAJA.clave);
  poner('panel-usuario', porRol.OWNER.usuario);
  poner('panel-clave', porRol.OWNER.clave);

  const expiraEn = new Date(demo.expiraEn);
  contar(expiraEn);
  setInterval(() => contar(expiraEn), 30_000);

  estado.hidden = true;
  listo.hidden = false;
}

void armar();
