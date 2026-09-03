import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { PAYMENT_METHODS } from '@itadaki/ordering/domain';
import { MEDIOS_DE_COBRO } from '@itadaki/billing/domain';

/**
 * Que la base acepte los medios que el código puede escribir.
 *
 * Pasó así: se unificó el vocabulario del comensal con el del mozo —la mesa
 * pasó a elegir débito, crédito y transferencia— pero la restricción de
 * `table_calls` seguía aceptando sólo las opciones viejas. Postgres rechazaba
 * la fila y el comensal veía un 502 al tocar "transferencia": un error de
 * servidor sin explicación, justo en la pantalla donde pide la cuenta.
 *
 * Ni el compilador ni los tests lo cruzaban, porque el desajuste está entre
 * TypeScript y SQL. Esto lo cruza.
 */

const MIGRACIONES = join(__dirname, '../../../libs/shared/persistence/src/lib/migrations');

/** El último CHECK que define una columna, que es el que rige. */
function ultimoCheck(columna: string): string {
  const archivos = readdirSync(MIGRACIONES).filter((n) => n.endsWith('.sql')).sort();

  let vigente = '';
  for (const archivo of archivos) {
    const sql = readFileSync(join(MIGRACIONES, archivo), 'utf-8').replace(/\r\n/g, "\n");
    // Sin comentarios: los medios viejos se nombran ahí al explicar por qué
    // se conservan, y eso no es lo que la base acepta.
    const limpio = sql.replace(/--[^\n]*/g, '');

    for (const bloque of limpio.split(/ADD CONSTRAINT/i).slice(1)) {
      if (bloque.includes(columna) && /CHECK/i.test(bloque)) {
        vigente = bloque.slice(0, bloque.indexOf(';'));
      }
    }
  }
  return vigente;
}

describe('los medios que la mesa declara al pedir la cuenta', () => {
  const check = ultimoCheck('payment_method');

  it('la base acepta todos los que el código puede mandar', () => {
    // El bug exacto: 'TRANSFER' llegaba y la restricción lo rechazaba.
    for (const medio of PAYMENT_METHODS) {
      expect(check).toContain(`'${medio}'`);
    }
  });

  it('sigue aceptando los guardados de antes', () => {
    // Sacarlos haría fallar cualquier actualización sobre esas filas.
    expect(check).toContain("'CARD'");
    expect(check).toContain("'COUNTER'");
  });
});

describe('los medios con los que el mozo confirma el cobro', () => {
  const check = ultimoCheck('cobrado_con');

  it('la base acepta todos los que el código puede mandar', () => {
    for (const medio of MEDIOS_DE_COBRO) {
      expect(check).toContain(`'${medio}'`);
    }
  });
});
