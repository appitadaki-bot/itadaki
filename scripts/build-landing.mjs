/**
 * Arma la landing lista para publicar.
 *
 * Es HTML plano: no hay nada que compilar. Lo único que hace falta es copiar
 * las páginas legales al lado, porque el pie las enlaza con /legal/... y sin
 * ellas esos enlaces darían 404 justo en la página donde alguien se da de alta.
 */
import { cp, mkdir, readFile, rm } from 'node:fs/promises';

const SALIDA = 'dist/landing';

await rm(SALIDA, { recursive: true, force: true });
await mkdir(SALIDA, { recursive: true });

/*
 * Un @keyframes dentro de un @media rompe el parser: el navegador descarta
 * todo lo que sigue en la hoja, sin decir nada. Se ve como estilos que "no se
 * aplican" y cuesta horas encontrarlo, así que se revisa antes de publicar.
 */
const hoja = await readFile('apps/landing/landing.css', 'utf8');
let profundidad = 0;

for (const [numero, linea] of hoja.split('\n').entries()) {
  for (const caracter of linea) {
    if (caracter === '{') profundidad += 1;
    if (caracter === '}') profundidad -= 1;
  }

  if (linea.includes('@keyframes') && profundidad > 1) {
    console.error(
      `landing.css:${numero + 1} — @keyframes anidado dentro de otra regla. ` +
        'Todo el CSS que sigue se descarta. Sacalo al primer nivel.',
    );
    process.exit(1);
  }
}

if (profundidad !== 0) {
  console.error(`landing.css — quedan ${profundidad} llaves sin cerrar`);
  process.exit(1);
}

await cp('apps/landing', SALIDA, { recursive: true });
await cp('apps/admin-web/src/legal', `${SALIDA}/legal`, {
  recursive: true,
  filter: (origen) => !origen.endsWith('.md'),
});

 
console.log('landing lista en', SALIDA);
