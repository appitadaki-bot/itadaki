import { readFileSync, globSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Que cada `INSERT` nombre tantas columnas como valores le pasa.
 *
 * Sacando una columna que ya no se usaba quedó la lista en cinco nombres y el
 * `VALUES` en seis marcadores. TypeScript no mira adentro de un string, los
 * tests usan los almacenes en memoria, y el build pasó limpio: se descubrió
 * en producción, con el alta de mesas entera rota —la demo de la landing y el
 * botón de crear mesa del panel— y un 502 que no dice qué pasó.
 *
 * Es el error más barato de cometer editando SQL a mano y el más caro de
 * encontrar, así que se cuenta acá en vez de confiar en que alguien sume bien
 * la próxima vez.
 */

/**
 * Lo que hay entre el paréntesis que abre en `desde` y el que lo cierra.
 *
 * A mano y no con una expresión regular porque las dos listas anidan: una
 * columna puede llenarse con `now()` o con `'{}'::jsonb`, y `[^)]*` corta en
 * el primer paréntesis que encuentra, que es el de adentro.
 */
function entreParentesis(sql: string, desde: number): { texto: string; fin: number } | null {
  let profundidad = 0;
  let comilla = false;

  for (let i = desde; i < sql.length; i += 1) {
    const caracter = sql[i];
    if (comilla) {
      if (caracter === "'") comilla = false;
      continue;
    }
    if (caracter === "'") comilla = true;
    else if (caracter === '(') profundidad += 1;
    else if (caracter === ')') {
      profundidad -= 1;
      if (profundidad === 0) return { texto: sql.slice(desde + 1, i), fin: i };
    }
  }
  return null;
}

/** Cuántos elementos tiene una lista, contando sólo las comas de afuera. */
function cuantos(lista: string): number {
  if (lista.trim() === '') return 0;

  let total = 1;
  let profundidad = 0;
  let comilla = false;

  for (const caracter of lista) {
    if (comilla) {
      if (caracter === "'") comilla = false;
      continue;
    }
    if (caracter === "'") comilla = true;
    else if (caracter === '(') profundidad += 1;
    else if (caracter === ')') profundidad -= 1;
    else if (caracter === ',' && profundidad === 0) total += 1;
  }
  return total;
}

interface Insercion {
  readonly archivo: string;
  readonly tabla: string;
  readonly columnas: number;
  readonly valores: number;
}

function inserciones(archivo: string, fuente: string): Insercion[] {
  const encontradas: Insercion[] = [];
  const inicio = /INSERT\s+INTO\s+(\w+)\s*\(/gi;

  for (const coincidencia of fuente.matchAll(inicio)) {
    const abre = coincidencia.index + coincidencia[0].length - 1;
    const columnas = entreParentesis(fuente, abre);
    if (columnas === null) continue;

    const resto = fuente.slice(columnas.fin);
    const values = /VALUES\s*\(/i.exec(resto);
    // `INSERT ... SELECT` no lleva `VALUES`: no hay nada que contar.
    if (values === null || values.index > 40) continue;

    const valores = entreParentesis(resto, values.index + values[0].length - 1);
    if (valores === null) continue;

    encontradas.push({
      archivo,
      tabla: coincidencia[1] ?? '',
      columnas: cuantos(columnas.texto),
      valores: cuantos(valores.texto),
    });
  }
  return encontradas;
}

const RAIZ = join(__dirname, '..', '..', '..', '..', '..');

const TODAS = globSync('libs/*/infra/src/lib/*.ts', { cwd: RAIZ })
  .filter((ruta) => !ruta.endsWith('.spec.ts'))
  .flatMap((ruta) => inserciones(ruta, readFileSync(join(RAIZ, ruta), 'utf-8')));

describe('los INSERT cierran', () => {
  it('encuentra los INSERT de los almacenes', () => {
    // Si el patrón deja de encontrar nada, los casos de abajo pasarían sin
    // mirar nada y el chequeo se volvería decorativo sin que nadie se entere.
    expect(TODAS.length).toBeGreaterThan(10);
  });

  it.each(TODAS)('$archivo → $tabla', ({ columnas, valores }) => {
    expect(valores).toBe(columnas);
  });
});
