import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { ROLES } from '@itadaki/identity/domain';

/**
 * Que los roles del código existan también en la base.
 *
 * Ya nos pasó dos veces. Con TRANSFER: se agregó el medio de cobro sin tocar
 * el CHECK, y la mesa que lo elegía recibía un 502. Y con SOPORTE: el rol
 * compilaba, los tests pasaban, y crear la cuenta reventaba contra
 * `staff_role_valid`.
 *
 * El código no se entera de lo que dice Postgres, así que se cruzan acá.
 */
const DIR = join(process.cwd(), 'libs/shared/persistence/src/lib/migrations');

/** La última definición del CHECK es la que queda en la base. */
function checkVigente(): string {
  const archivos = readdirSync(DIR)
    .filter((n) => n.endsWith('.sql'))
    .sort()
    .filter((n) => readFileSync(join(DIR, n), 'utf8').includes('staff_role_valid'));

  expect(archivos.length).toBeGreaterThan(0);
  return readFileSync(join(DIR, archivos[archivos.length - 1] as string), 'utf8');
}

describe('los roles que la base acepta', () => {
  it('están todos los que el código conoce', () => {
    const sql = checkVigente();
    for (const rol of ROLES) {
      expect(sql).toContain(`'${rol}'`);
    }
  });

  /** Corre en cada despliegue: la segunda vez no puede fallar. */
  it('la migración se puede aplicar dos veces', () => {
    expect(checkVigente()).toContain('DROP CONSTRAINT IF EXISTS staff_role_valid');
  });
});
