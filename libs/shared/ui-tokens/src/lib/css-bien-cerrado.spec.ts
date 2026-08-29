import { readFileSync } from 'node:fs';
import { globSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Que ninguna declaración de CSS se quede sin punto y coma.
 *
 * Pasó en siete lugares de las cuatro apps, todos iguales: un `font-size` sin
 * `;` seguido de un `letter-spacing` con `;;`. El navegador no avisa —descarta
 * las dos declaraciones en silencio— así que los títulos se veían con el
 * tamaño heredado y nadie lo notó. Venía de una edición masiva que corrió sobre
 * todos los archivos a la vez, que es exactamente el modo en que este error se
 * multiplica.
 *
 * El compilador tampoco lo cruza: un CSS con esto compila sin una queja.
 */

const RAIZ = join(__dirname, '../../../../..');

/** Los .css de las apps y las librerías, sin lo compilado ni las dependencias. */
function hojasDeEstilo(): readonly string[] {
  return globSync('{apps,libs}/**/*.css', { cwd: RAIZ })
    .filter((ruta) => !ruta.includes('node_modules') && !ruta.includes('dist'));
}

/** Las líneas que abren una declaración y la dejan sin cerrar. */
function declaracionesSinCerrar(css: string): readonly string[] {
  // Los comentarios se sacan primero: adentro hay dos puntos —"cocina: no se
  // estira"— que se leen igual que una propiedad.
  const lineas = css.replace(/\/\*[\s\S]*?\*\//g, '').split('\n');

  return lineas.flatMap((linea, i) => {
    const actual = linea.trim();
    const siguiente = lineas[i + 1]?.trim() ?? '';

    const esDeclaracionAbierta =
      /^[a-z-]+\s*:\s*[^;{}]+$/.test(actual) && !/[;{,(]$/.test(actual);
    const siguienteEsOtraDeclaracion = /^[a-z-]+\s*:/.test(siguiente);

    return esDeclaracionAbierta && siguienteEsOtraDeclaracion ? [`${i + 1}: ${actual}`] : [];
  });
}

describe('el CSS cierra sus declaraciones', () => {
  it.each(hojasDeEstilo())('%s', (ruta) => {
    const css = readFileSync(join(RAIZ, ruta), 'utf-8');

    expect(declaracionesSinCerrar(css)).toEqual([]);
  });
});

describe('cómo se detecta', () => {
  it('encuentra la declaración sin punto y coma', () => {
    const roto = '.x {\n  font-size: 1rem\n  letter-spacing: 2px;\n}';

    expect(declaracionesSinCerrar(roto)).toHaveLength(1);
  });

  it('deja pasar el CSS correcto', () => {
    const bien = '.x {\n  font-size: 1rem;\n  letter-spacing: 2px;\n}';

    expect(declaracionesSinCerrar(bien)).toEqual([]);
  });

  it('no se confunde con los dos puntos de un comentario', () => {
    // "cocina: no se estira" adentro de un comentario se lee igual que una
    // propiedad si no se sacan los comentarios primero.
    const conComentario = '.x {\n  /* algo: otra cosa */\n  font-size: 1rem;\n}';

    expect(declaracionesSinCerrar(conComentario)).toEqual([]);
  });

  it('no se queja de la última propiedad antes de la llave', () => {
    // Un `;` final es de estilo, no un error: lo que rompe es que la de
    // arriba se coma la de abajo.
    const sinPuntoFinal = '.x {\n  font-size: 1rem\n}';

    expect(declaracionesSinCerrar(sinPuntoFinal)).toEqual([]);
  });

  it('acepta un valor con paréntesis en varias líneas', () => {
    const gradiente = '.x {\n  background: linear-gradient(\n    red,\n    blue\n  );\n}';

    expect(declaracionesSinCerrar(gradiente)).toEqual([]);
  });
});
