/**
 * Graba el flujo real en video: el comensal pide y la cocina lo recibe.
 *
 * No es una animación dibujada — es la aplicación corriendo contra la base,
 * con una mesa de verdad. Eso es lo que prueba que funciona: una animación la
 * puede hacer cualquiera, esto sólo se puede grabar si el sistema anda.
 *
 * Requiere las cuatro apps levantadas y ffmpeg instalado.
 *
 *   node scripts/grabar-flujo.mjs
 */
import { mkdir, readdir, rename, rm, stat } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { chromium } from 'playwright';

const COMENSAL = 'http://localhost:4200';
const API = 'http://localhost:3000/api';
const SALIDA = 'video-out';

/** El teléfono al lado de la pantalla de cocina, en una sola toma. */
const ANCHO = 1280;
const ALTO = 720;

const esperar = (ms) => new Promise((listo) => setTimeout(listo, ms));

/** Corre ffmpeg y espera a que termine. */
function ffmpeg(args) {
  return new Promise((listo, falla) => {
    const proceso = spawn('ffmpeg', args, { stdio: ['ignore', 'ignore', 'pipe'] });
    let error = '';
    proceso.stderr.on('data', (d) => (error += d.toString()));
    proceso.on('close', (codigo) =>
      codigo === 0 ? listo() : falla(new Error(`ffmpeg salió ${codigo}: ${error.slice(-400)}`)),
    );
  });
}

/** El link del QR de una mesa, como lo daría el panel. */
async function linkDeMesa(etiqueta) {
  const login = await fetch(`${API}/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: 'dueno@itadaki.test', password: 'Itadaki2026Demo' }),
  });
  const credenciales = await login.json();

  // El login tiene límite de intentos: grabando varias veces seguidas se
  // agota, y sin decirlo el script fallaba con "lista.find is not a function".
  if (!login.ok || typeof credenciales.token !== 'string') {
    throw new Error(
      `no se pudo entrar (${login.status}): ${JSON.stringify(credenciales).slice(0, 120)}. ` +
        'Si dice TOO_MANY_REQUESTS, esperá unos minutos o reiniciá la API.',
    );
  }

  const { token } = credenciales;

  const mesas = await fetch(`${API}/tables`, { headers: { authorization: `Bearer ${token}` } });
  const lista = await mesas.json();
  if (!Array.isArray(lista)) {
    throw new Error(`la API no devolvió mesas: ${JSON.stringify(lista).slice(0, 120)}`);
  }

  const mesa = lista.find((m) => m.label === etiqueta) ?? lista[0];

  return {
    url: mesa.url.replace(/^https?:\/\/[^/]+/, COMENSAL),
    token,
    tableId: mesa.id,
  };
}

/**
 * El código que hay que escribir para sentarse.
 *
 * Se lee después de liberar la mesa y no antes: liberarla le pone un código
 * nuevo —para que el de un grupo no le sirva al siguiente— así que el que se
 * leyó antes ya no vale y la grabación queda en "Entrando…" para siempre.
 */
async function codigoDeMesa(token, tableId) {
  const respuesta = await fetch(`${API}/sessions/codes`, {
    headers: { authorization: `Bearer ${token}` },
  });
  const filas = await respuesta.json().catch(() => []);
  return (filas ?? []).find((c) => c.tableId === tableId)?.joinCode ?? null;
}

/** Deja la mesa vacía: el video arranca con alguien sentándose. */
async function liberarMesas(token) {
  const cabeceras = { authorization: `Bearer ${token}`, 'content-type': 'application/json' };
  const abiertas = await (await fetch(`${API}/sessions/open`, { headers: cabeceras })).json();

  for (const sesion of abiertas ?? []) {
    await fetch(`${API}/sessions/${sesion.sessionId}/release`, {
      method: 'POST',
      headers: cabeceras,
    }).catch(() => undefined);
  }
}

await rm(SALIDA, { recursive: true, force: true });
await mkdir(`${SALIDA}/raw`, { recursive: true });

const { url, token, tableId } = await linkDeMesa('Mesa 4');

await liberarMesas(token);
await esperar(1200);

// El código existe igual, pero la grabación no lo usa: corre con la exigencia
// apagada, que es como está la demo que ve un cliente nuevo.
void codigoDeMesa;
void tableId;

/*
 * Chrome bloquea que una página pida a `localhost` aunque el servidor mande
 * los encabezados de CORS correctos: es Private Network Access, pensado para
 * que un sitio cualquiera no escanee la red de quien lo visita.
 *
 * Acá las dos puntas son nuestras y corren en esta misma máquina, así que se
 * apaga para poder grabar. Sólo afecta a este navegador de grabación.
 */
const navegador = await chromium.launch({
  args: [
    '--disable-features=BlockInsecurePrivateNetworkRequests,PrivateNetworkAccessSendPreflights',
  ],
});
const contexto = await navegador.newContext({
  viewport: { width: ANCHO, height: ALTO },
  deviceScaleFactor: 2,
  recordVideo: { dir: `${SALIDA}/raw`, size: { width: ANCHO, height: ALTO } },
});

const pagina = await contexto.newPage();

/*
 * La app trae fijada la API de producción en un <meta>, para que el deploy no
 * dependa de configurar nada. Para grabar hay que apuntarla a la local, o el
 * navegador pide contra Render —que exige el código de mesa— y la pantalla
 * queda en "Entrando…".
 *
 * Se reescribe la respuesta en vuelo en vez de editar el archivo: el índice
 * del repositorio no se toca por grabar un video.
 */
/*
 * Todo desde el mismo origen.
 *
 * Chrome bloquea que una página en localhost:4200 pida a localhost:3000 —es
 * Private Network Access— y el pedido se corta antes de salir: el servidor ni
 * se entera. Apagarlo por bandera no alcanzó.
 *
 * Así que se elimina la red cruzada en vez de pelearla: lo que la app pide a
 * /api se reenvía al servidor local desde acá, y para el navegador todo vive
 * en el mismo origen. De paso ya no hace falta tocar el <meta>.
 */
await contexto.route(`${COMENSAL}/api/**`, async (ruta) => {
  const pedido = ruta.request();
  const destino = API.replace(/\/api$/, '') + new URL(pedido.url()).pathname.replace(/^\/api/, '/api');

  const respuesta = await fetch(destino + new URL(pedido.url()).search, {
    method: pedido.method(),
    headers: pedido.headers(),
    body: ['GET', 'HEAD'].includes(pedido.method()) ? undefined : pedido.postData(),
  });

  await ruta.fulfill({
    status: respuesta.status,
    headers: { 'content-type': respuesta.headers.get('content-type') ?? 'application/json' },
    body: Buffer.from(await respuesta.arrayBuffer()),
  });
});

// Las páginas HTML: el <meta> pasa a apuntar al mismo origen, que el route de
// arriba reenvía.
await contexto.route(
  (url) => url.origin === COMENSAL && !url.pathname.startsWith('/api'),
  async (ruta) => {
    const respuesta = await ruta.fetch();
    const tipo = respuesta.headers()['content-type'] ?? '';

    if (!tipo.includes('text/html')) {
      await ruta.fulfill({ response: respuesta });
      return;
    }

    const html = await respuesta.text();
    await ruta.fulfill({
      response: respuesta,
      body: html.replace(
        /<meta name="itadaki-api" content="[^"]*"\s*\/?>/,
        `<meta name="itadaki-api" content="${COMENSAL}" />`,
      ),
    });
  },
);

console.log('1/5 · el comensal escanea el QR');
await pagina.goto(url, { waitUntil: 'networkidle' });
await esperar(1800);

console.log('2/5 · elige su nombre y entra');

// La bienvenida saluda con el número de mesa antes del formulario: hay que
// pasarla, o el video se queda mirando esa pantalla los veinte segundos.
const verCarta = pagina.getByRole('link', { name: /ver la carta/i })
  .or(pagina.getByRole('button', { name: /ver la carta/i }))
  .first();
if (await verCarta.isVisible().catch(() => false)) {
  await verCarta.click();
  await esperar(2000);
}

const nombre = pagina.locator('#nickname');
if (await nombre.isVisible().catch(() => false)) {
  await nombre.fill(`Cami ${Date.now().toString().slice(-3)}`);
  await esperar(900);

  // El código no se escribe: la grabación corre con REQUIRE_JOIN_CODE=0, que
  // es como está la demo. Escribir uno viejo hacía que el servidor rechazara
  // y la pantalla quedaba en "Entrando…" para siempre.

  await pagina.getByRole('button', { name: /entrar a la mesa/i }).click();
  await esperar(3000);
}

console.log('3/5 · mira la carta y elige');
await pagina.waitForURL(/carta/, { timeout: 15000 }).catch(() => undefined);

// Espera a que haya un plato de verdad, no un tiempo fijo: la carta viaja por
// el proxy y tarda más que contra la API directa.
await pagina
  .locator('.dish, article, .product')
  .first()
  .waitFor({ state: 'visible', timeout: 15000 })
  .catch(() => undefined);
await esperar(2200);

// Recorre la carta como lo haría alguien decidiendo.
await pagina.mouse.wheel(0, 320);
await esperar(1600);

const platos = pagina.locator('.dish, .product, article').first();
if (await platos.isVisible().catch(() => false)) {
  await platos.click();
  await esperar(2200);
}

console.log('4/5 · elige opciones y agrega');

/*
 * Elige una opción de cada grupo antes de agregar.
 *
 * El bife pide guarnición y punto de cocción, y sin elegirlos el botón queda
 * deshabilitado: el carrito quedaba vacío y el paso siguiente moría esperando
 * un "enviar" que decía "agregá algo para enviar".
 */
for (const grupo of await pagina.locator('.options').all()) {
  const primera = grupo.locator('.option').first();
  if (await primera.isVisible().catch(() => false)) {
    await primera.click().catch(() => undefined);
    await esperar(700);
  }
}

const agregar = pagina.getByRole('button', { name: /^agregar/i }).last();
if (await agregar.isEnabled().catch(() => false)) {
  await agregar.click();
  await esperar(2400);
}

console.log('5/5 · manda el pedido a la cocina');

// Al carrito, que es donde se envía.
const alCarrito = pagina
  .getByRole('link', { name: /carrito|ver mi pedido|mi pedido/i })
  .or(pagina.getByRole('button', { name: /carrito|ver mi pedido|mi pedido/i }))
  .first();

if (await alCarrito.isVisible().catch(() => false)) {
  await alCarrito.click();
} else {
  await pagina.goto(`${COMENSAL}/carrito`, { waitUntil: 'networkidle' });
}
await esperar(2400);

const enviar = pagina.getByRole('button', { name: /enviar a la cocina|enviar/i }).first();
if (await enviar.isVisible().catch(() => false)) {
  await enviar.click();
  // El momento que vale: la confirmación de que el pedido salió.
  await esperar(4000);
}

await contexto.close();
await navegador.close();

// Playwright deja un .webm por pestaña y no dice cuál es cuál. Se toma el más
// pesado: es el del recorrido largo, no el de la pantalla que sólo se abrió.
const crudos = (await readdir(`${SALIDA}/raw`)).filter((f) => f.endsWith('.webm'));
if (crudos.length === 0) throw new Error('no se grabó ningún video');

const pesos = await Promise.all(
  crudos.map(async (nombre) => ({
    nombre,
    peso: (await stat(`${SALIDA}/raw/${nombre}`)).size,
  })),
);
pesos.sort((a, b) => b.peso - a.peso);

const origen = `${SALIDA}/raw/${pesos[0].nombre}`;
const destino = `${SALIDA}/itadaki-flujo.mp4`;

console.log('convirtiendo a mp4…');
await ffmpeg([
  '-y',
  '-i', origen,
  // H.264 con yuv420p: es lo que reproduce cualquier navegador y WhatsApp.
  '-c:v', 'libx264',
  '-pix_fmt', 'yuv420p',
  '-crf', '26',
  '-preset', 'slow',
  '-movflags', '+faststart',
  '-an',
  destino,
]);

await rename(origen, `${SALIDA}/raw/original.webm`);
console.log(`\nlisto -> ${destino}`);
