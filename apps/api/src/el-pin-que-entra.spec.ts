import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Que los tipos de la función de búsqueda coincidan con los de la tabla.
 *
 * `pin_intentos` es `smallint` en la tabla y la función lo declaraba
 * `integer`. Postgres no convierte solo: aborta la consulta entera con
 * "structure of query does not match function result type", así que buscar
 * por usuario fallaba antes de mirar ningún PIN.
 *
 * Para quien lo vivía era peor que un error. El alta mostraba usuario y PIN
 * recién generados, y esas credenciales no servían: el mozo probaba, no
 * entraba, y lo razonable era pensar que se había copiado mal el número. El
 * dueño no lo veía nunca, porque entra con mail y contraseña — ese login usa
 * otra función, que no devuelve esta columna.
 *
 * Se leen los archivos en vez de correrlos porque los tests no tienen
 * Postgres; lo que se fija acá es que la declaración y la conversión estén.
 */
const DIR = join(process.cwd(), 'libs/shared/persistence/src/lib/migrations');

const migraciones = readdirSync(DIR)
  .filter((name) => name.endsWith('.sql'))
  .sort();

/** La última definición de la función es la que queda en la base. */
function ultimaDefinicion(): string {
  const conLaFuncion = migraciones.filter((name) =>
    readFileSync(join(DIR, name), 'utf8').includes(
      'CREATE OR REPLACE FUNCTION staff_username_lookup_fn',
    ),
  );
  expect(conLaFuncion.length).toBeGreaterThan(0);
  return readFileSync(join(DIR, conLaFuncion[conLaFuncion.length - 1] as string), 'utf8');
}

describe('el PIN del personal sirve para entrar', () => {
  it('la función convierte pin_intentos al tipo que declara', () => {
    const sql = ultimaDefinicion();

    // Declarado integer y la columna es smallint: sin el cast, Postgres
    // aborta la consulta y nadie puede entrar con PIN.
    expect(sql).toContain('pin_intentos     integer');
    expect(sql).toContain('s.pin_intentos::integer');
  });

  /** La columna sigue siendo smallint; si eso cambiara, el cast sobra pero no molesta. */
  it('la tabla la crea como smallint', () => {
    const alta = readFileSync(join(DIR, '029_usuario_y_pin.sql'), 'utf8');
    expect(alta).toContain('pin_intentos smallint');
  });

  /**
   * El GRANT necesita guarda: el rol de la aplicación no existe en una base
   * recién creada, y sin ella la migración entera aborta.
   */
  it('el permiso se otorga sólo si el rol existe', () => {
    const sql = ultimaDefinicion();
    const donde = sql.indexOf('GRANT EXECUTE ON FUNCTION staff_username_lookup_fn');
    expect(donde).toBeGreaterThan(-1);
    expect(sql.slice(donde - 250, donde)).toContain("rolname = 'itadaki_app'");
  });
});
