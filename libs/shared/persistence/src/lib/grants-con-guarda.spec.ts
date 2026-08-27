import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const CARPETA = join(__dirname, 'migrations');

/**
 * Ningún GRANT puede darse por sentado que `itadaki_app` existe.
 *
 * El rol es del Postgres de la laptop, donde lo crea `scripts/init-db.sql`. En
 * una base hosteada —Render, Neon— no se puede crear: la app se conecta con el
 * usuario del proveedor, y como las tablas tienen RLS en modo FORCE las
 * políticas también lo alcanzan a él. Ahí el rol simplemente no está.
 *
 * Un GRANT suelto contra un rol que no existe no es un aviso: es
 * `role "itadaki_app" does not exist` y la migración entera aborta. Nos pasó
 * estrenando la base de Neon, con la mitad del esquema ya aplicada.
 *
 * Este test es para la próxima migración, no para las que ya están: escribir
 * el GRANT sin guarda es lo natural, y sin esto se descubre recién cuando
 * alguien estrena una base hosteada.
 */
describe('los GRANT de las migraciones', () => {
  const archivos = readdirSync(CARPETA).filter((nombre) => nombre.endsWith('.sql'));

  it('hay migraciones para revisar', () => {
    expect(archivos.length).toBeGreaterThan(0);
  });

  it.each(archivos)('%s sólo le da permisos al rol si existe', (archivo) => {
    const contenido = readFileSync(join(CARPETA, archivo), 'utf8');

    for (const grant of [...contenido.matchAll(/^[ \t]*GRANT\b.*$/gm)]) {
      const hasta = grant.index ?? 0;
      const abre = contenido.lastIndexOf('DO $$', hasta);
      const cierra = contenido.lastIndexOf('END $$;', hasta);

      // Dentro del bloque abierto más cercano, y que ese bloque pregunte por
      // el rol. Alcanza porque acá los bloques no se anidan.
      const dentro = abre > cierra;
      const guardado = dentro && contenido.slice(abre, hasta).includes('pg_roles');

      expect(`${archivo}: ${grant[0].trim()} — ${guardado ? 'ok' : 'sin guarda'}`).toContain('ok');
    }
  });
});
