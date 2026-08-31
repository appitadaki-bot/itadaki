/**
 * Decide si esta app tiene que construirse, o si el commit no la toca.
 *
 * Vercel lo corre antes de cada build (Ignored Build Step). La convención es
 * al revés de lo que uno esperaría: **salir con 0 cancela el build** y salir
 * con 1 lo deja seguir.
 *
 * Un merge cualquiera disparaba los cinco proyectos: un cambio de CSS en el
 * panel construía también el comensal, la cocina, el salón y la landing. Los
 * builds son cuota, y cada despliegue tira la caché de una app que no cambió.
 *
 * Cada proyecto dice cuál es con la variable APP.
 */
import { execFileSync } from 'node:child_process';

/**
 * Qué mira cada app, además de su propia carpeta.
 *
 * La landing y el comensal publican los documentos legales, que se escriben
 * en Markdown dentro de admin y se convierten al construir: un cambio en esos
 * textos no toca su carpeta pero sí lo que publican.
 */
const EXTRAS = {
  comensal: ['apps/admin-web/src/legal/', 'scripts/build-legal.mjs'],
  landing: ['apps/admin-web/src/legal/', 'scripts/build-legal.mjs', 'scripts/build-landing.mjs'],
};

const CARPETAS = {
  comensal: 'apps/diner-pwa/',
  cocina: 'apps/kds-web/',
  admin: 'apps/admin-web/',
  salon: 'apps/floor-web/',
  landing: 'apps/landing/',
};

/**
 * Lo que comparten las cinco. Un cambio acá las construye a todas: no vale la
 * pena adivinar cuál de las apps usa qué parte de `libs/`, y equivocarse deja
 * una app vieja en producción sin que nadie se entere.
 */
const DE_TODOS = [
  'libs/',
  'package.json',
  'package-lock.json',
  'angular.json',
  'vercel.json',
  'tsconfig',
];

export function hayQueConstruir(app, archivos) {
  const carpeta = CARPETAS[app];
  if (carpeta === undefined) return true;

  const propias = [carpeta, ...(EXTRAS[app] ?? [])];

  return archivos.some(
    (archivo) =>
      DE_TODOS.some((comun) => archivo.startsWith(comun)) ||
      propias.some((mia) => archivo.startsWith(mia)),
  );
}

/**
 * Los archivos que cambió este commit.
 *
 * Devuelve `null` cuando no se puede saber —Vercel clona sin historial
 * completo, y a veces no hay contra qué comparar—. Ahí se construye igual:
 * un build de más cuesta unos minutos, uno de menos deja producción vieja
 * sin que nadie lo note.
 */
function archivosDelCommit() {
  const anterior = process.env.VERCEL_GIT_PREVIOUS_SHA;
  const rangos = [];
  if (anterior !== undefined && anterior !== '') rangos.push(`${anterior}..HEAD`);
  rangos.push('HEAD^..HEAD');

  for (const rango of rangos) {
    try {
      const salida = execFileSync('git', ['diff', '--name-only', rango], { encoding: 'utf8' });
      return salida.split('\n').map((linea) => linea.trim()).filter((linea) => linea !== '');
    } catch {
      // Ese rango no existe en este clon; se prueba el siguiente.
    }
  }
  return null;
}

function main() {
  const app = process.env.APP;
  if (app === undefined || app === '') {
    console.log('sin APP: se construye por las dudas');
    process.exit(1);
  }

  const archivos = archivosDelCommit();
  if (archivos === null) {
    console.log('no se pudo leer qué cambió: se construye por las dudas');
    process.exit(1);
  }

  if (hayQueConstruir(app, archivos)) {
    console.log(`${app}: hay cambios que la tocan, se construye`);
    process.exit(1);
  }

  console.log(`${app}: este commit no la toca, se saltea`);
  process.exit(0);
}

/**
 * Autochequeo: `node scripts/hace-falta-construir.mjs --check`.
 *
 * Va acá y no en un `.spec` porque jest sólo mira `apps/` y `libs/`, y meter
 * un script de despliegue ahí adentro para poder probarlo es la cola moviendo
 * al perro. Son cinco `assert` y corren en un segundo.
 */
function chequear() {
  const solo = ['apps/admin-web/src/app/admin.component.css'];
  assert(hayQueConstruir('admin', solo), 'la app que cambió se construye');
  assert(!hayQueConstruir('comensal', solo), 'las otras no');
  assert(!hayQueConstruir('landing', solo), 'la landing tampoco');

  for (const comun of ['libs/ordering/domain/x.ts', 'package.json', 'angular.json']) {
    for (const app of Object.keys(CARPETAS)) {
      assert(hayQueConstruir(app, [comun]), `${comun} construye ${app}`);
    }
  }

  // Los legales se escriben en admin y los publican el comensal y la landing.
  const legales = ['apps/admin-web/src/legal/privacidad.md'];
  assert(hayQueConstruir('comensal', legales), 'el comensal publica los legales');
  assert(hayQueConstruir('landing', legales), 'la landing también');
  assert(!hayQueConstruir('cocina', legales), 'la cocina no los publica');

  // El backend se despliega en otro lado.
  assert(!hayQueConstruir('admin', ['apps/api/src/main.ts']), 'el backend no construye apps');

  // Una app que no está en la lista es una que alguien acaba de agregar.
  assert(hayQueConstruir('inventada', ['apps/kds-web/x.ts']), 'ante la duda, construye');

  console.log('hace-falta-construir: bien');
}

function assert(condicion, que) {
  if (!condicion) {
    console.error(`FALLA: ${que}`);
    process.exit(1);
  }
}

if (process.argv.includes('--check')) chequear();
else main();
