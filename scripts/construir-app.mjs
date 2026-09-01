/**
 * Construye la app de este proyecto de Vercel, y sólo esa.
 *
 * Vercel prefiere el script `vercel-build` sobre `build` cuando existe, así
 * que esto es lo que corre allá aunque el campo Build Command del proyecto
 * esté vacío. Y estaba vacío: el `build` de siempre construye el comensal, la
 * cocina, el admin y la API de una, así que un solo proyecto construía casi
 * todo el repositorio en cada despliegue.
 *
 * Cuál es cada uno lo dice la variable APP, la misma que usa el filtro que
 * decide si hace falta construir.
 */
import { execSync } from 'node:child_process';

const GUION = {
  comensal: 'build:comensal',
  cocina: 'build:cocina',
  admin: 'build:admin',
  salon: 'build:salon',
  landing: 'build:landing',
};

const app = process.env.APP;
const guion = app === undefined ? undefined : GUION[app];

if (guion === undefined) {
  // Mejor parar que construir cualquier cosa: sin APP no hay forma de saber
  // qué tiene que quedar en `dist`, y publicar la app equivocada se ve como
  // que el despliegue anduvo.
  console.error(
    `APP no dice qué construir (llegó ${JSON.stringify(app)}).\n` +
      `Poné una de: ${Object.keys(GUION).join(', ')}`,
  );
  process.exit(1);
}

console.log(`construyendo ${app} con npm run ${guion}`);
execSync(`npm run ${guion}`, { stdio: 'inherit' });
