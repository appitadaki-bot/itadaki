/**
 * El restaurante de prueba, y las cuatro pantallas adentro de una sola.
 *
 * Se pide al cargar y no con otro botón: quien llega acá ya tocó "Probar la
 * app" en la landing, y pedirle que lo confirme de nuevo es cobrarle dos
 * veces la misma decisión.
 */
/*
 * A dónde apunta cada pantalla.
 *
 * En la máquina de desarrollo son cinco `ng serve` en cinco puertos; en
 * producción, cinco subdominios. Se elige por el host y no por una variable
 * de entorno porque esto es un archivo estático: no pasa por ningún build
 * que pudiera reemplazarle nada.
 */
const EN_LOCAL = ['localhost', '127.0.0.1'].includes(globalThis.location.hostname);

const API = EN_LOCAL ? 'http://localhost:3000/api' : 'https://itadaki-api.onrender.com/api';

const APPS = EN_LOCAL
  ? {
      mesa: 'http://localhost:4200',
      cocina: 'http://localhost:4500',
      salon: 'http://localhost:4600',
      admin: 'http://localhost:4400',
    }
  : {
      mesa: 'https://mesa.itadaki.app',
      cocina: 'https://cocina.itadaki.app',
      salon: 'https://salon.itadaki.app',
      admin: 'https://admin.itadaki.app',
    };

/** Qué cuenta usa cada pantalla. El comensal no usa ninguna: no hay login. */
const ROL = { cocina: 'KITCHEN', salon: 'CAJA', admin: 'OWNER' };

/*
 * El restaurante vive en la pestaña, no en el link.
 *
 * Un F5 pedía uno nuevo y dejaba el anterior ocupando lugar del tope hasta
 * vencer, con todo lo cargado adentro perdido. Guardarlo acá hace que
 * refrescar vuelva al mismo. En `sessionStorage`: cerrar la pestaña es irse.
 */
const GUARDADO = 'itadaki.demo';

const marco = document.getElementById('marco');
const aviso = document.getElementById('aviso');

function avisar(texto) {
  document.getElementById('aviso-texto').textContent = texto;
  aviso.hidden = false;
}

/** Cuánto le queda, en palabras. */
function contar(expiraEn) {
  const faltan = Math.max(0, Math.round((expiraEn.getTime() - Date.now()) / 60_000));
  const horas = Math.floor(faltan / 60);
  const minutos = faltan % 60;
  const cuanto = horas > 0 ? `${horas} h ${minutos} min` : `${minutos} min`;

  const texto =
    faltan === 0
      ? 'Tu restaurante de prueba venció. Recargá para empezar otro.'
      : `Se borra en ${cuanto}, con todo lo que hayas cargado.`;

  for (const donde of document.querySelectorAll('.reloj-texto')) donde.textContent = texto;
}

/**
 * La dirección de una pantalla, con su sesión puesta.
 *
 * El token va en la dirección porque es lo único que cruza dos dominios
 * distintos sin pedirle nada a nadie. La app lo guarda y lo saca de la barra
 * apenas lo lee. El del comensal es el del QR de la mesa, que es como entra
 * de verdad: ahí nunca hubo login.
 */
function direccion(demo, app) {
  if (app === 'mesa') {
    return `${APPS.mesa}/bienvenida?t=${encodeURIComponent(demo.tableToken)}`;
  }

  const acceso = demo.accesos.find((uno) => uno.rol === ROL[app]);
  return `${APPS[app]}/${demo.tenantId}?s=${encodeURIComponent(acceso.token)}`;
}

/*
 * El cajón del menú, en teléfono.
 *
 * El estado vive en un atributo del contenedor y el resto lo hace el CSS: en
 * escritorio el costado está siempre, así que abrir y cerrar no significa
 * nada y el atributo se queda ahí sin efecto.
 */
const contenedor = document.getElementById('probador');
const telon = document.getElementById('telon');
const hamburguesa = document.getElementById('hamburguesa');

function menu(abierto) {
  contenedor.dataset.menu = abierto ? 'abierto' : 'cerrado';
  telon.hidden = !abierto;
  hamburguesa.setAttribute('aria-expanded', String(abierto));
}

hamburguesa.addEventListener('click', () => menu(true));
document.getElementById('cerrar').addEventListener('click', () => menu(false));
telon.addEventListener('click', () => menu(false));

// Escape cierra, como cualquier cosa que se abre encima de otra.
document.addEventListener('keydown', (evento) => {
  if (evento.key === 'Escape') menu(false);
});

/**
 * Muestra una pantalla.
 *
 * Cada una se carga una sola vez y después se esconde: volver a la cocina
 * tiene que encontrar el pedido donde se dejó, y cambiar el `src` la
 * arrancaría de cero cada vez. Son cuatro marcos, como son cuatro aparatos.
 */
const marcos = new Map();

function mostrar(demo, app) {
  for (const boton of document.querySelectorAll('.pantalla')) {
    if (boton.dataset.app === app) boton.setAttribute('aria-current', 'page');
    else boton.removeAttribute('aria-current');
  }

  for (const [cual, cuadro] of marcos) cuadro.hidden = cual !== app;

  if (marcos.has(app)) return;

  const cuadro = app === 'mesa' ? marco : marco.cloneNode();
  cuadro.id = `marco-${app}`;
  cuadro.src = direccion(demo, app);
  cuadro.hidden = false;
  if (cuadro !== marco) marco.parentElement.insertBefore(cuadro, aviso);
  marcos.set(app, cuadro);
}

/** El que ya está en esta pestaña, si no venció. */
function elGuardado() {
  try {
    const crudo = sessionStorage.getItem(GUARDADO);
    if (crudo === null) return null;

    const demo = JSON.parse(crudo);
    return new Date(demo.expiraEn).getTime() > Date.now() ? demo : null;
  } catch {
    // Sin almacenamiento o con algo que no se puede leer: se pide uno nuevo.
    return null;
  }
}

async function pedir() {
  let respuesta;
  try {
    respuesta = await fetch(`${API}/demo`, { method: 'POST' });
  } catch {
    // La primera visita del día despierta al servidor y puede tardar: decirlo
    // es mejor que un error que no explica nada.
    avisar('No pudimos conectarnos con el servidor. Esperá un momento y recargá la página.');
    return null;
  }

  if (respuesta.status === 503) {
    avisar(
      'Ahora mismo no hay lugar: hay varios restaurantes de prueba abiertos. ' +
        'Volvé a intentar en un rato, o escribinos por WhatsApp y te lo mostramos.',
    );
    return null;
  }

  if (respuesta.status === 429) {
    avisar('Ya armaste varios restaurantes de prueba. Probá de nuevo más tarde.');
    return null;
  }

  if (!respuesta.ok) {
    avisar('No pudimos armar el restaurante de prueba. Probá de nuevo en un momento.');
    return null;
  }

  const demo = await respuesta.json();
  try {
    sessionStorage.setItem(GUARDADO, JSON.stringify(demo));
  } catch {
    // Sin almacenamiento el refresh pide otro. Funciona igual.
  }
  return demo;
}

async function armar() {
  const demo = elGuardado() ?? (await pedir());
  if (demo === null) return;

  const expiraEn = new Date(demo.expiraEn);
  contar(expiraEn);
  setInterval(() => contar(expiraEn), 30_000);

  for (const boton of document.querySelectorAll('.pantalla')) {
    boton.addEventListener('click', () => {
      mostrar(demo, boton.dataset.app);
      // Se abrió para elegir: dejarlo abierto tapa la app recién elegida.
      menu(false);
    });
  }

  aviso.hidden = true;
  mostrar(demo, 'mesa');
}

void armar();
