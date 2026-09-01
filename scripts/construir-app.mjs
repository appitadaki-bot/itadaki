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
  /*
   * Sin APP se construye todo, como antes de que esto existiera.
   *
   * La primera versión fallaba acá, para que publicar la app equivocada no
   * pasara por un despliegue que anduvo. Pero la variable no llegaba a
   * Vercel, y eso dejó producción sin desplegar: el que no publica no es
   * peor que el que publica de más, es peor que todo.
   *
   * Construir de más es exactamente lo que se hacía antes. Se avisa fuerte
   * y se sigue.
   */
  console.warn(
    'APP no dice qué construir (llegó ' +
      JSON.stringify(app) +
      '). Se construye todo, que es lo de antes. Poné una de: ' +
      Object.keys(GUION).join(', '),
  );
  execSync('npm run build', { stdio: 'inherit' });
  process.exit(0);
}

console.log(`construyendo ${app} con npm run ${guion}`);
execSync(`npm run ${guion}`, { stdio: 'inherit' });
