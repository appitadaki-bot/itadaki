import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Cobrar limpia el tablero de esa mesa.
 *
 * `listActive` filtraba sólo por el estado del envío, así que un plato que
 * quedó en "listo" porque nadie tocó "Llevé" seguía en el pase del mozo
 * después de que la mesa pagó y se fue. Quedaba ahí para siempre: ya no había
 * a quién llevárselo, y el mozo tenía que aprender a ignorar filas muertas,
 * que es como se empieza a ignorar también las vivas.
 */

const POSTGRES = readFileSync(
  join(__dirname, '..', '..', '..', 'libs', 'ordering', 'infra', 'src', 'lib', 'postgres-orders.ts'),
  'utf-8',
).replace(/\r\n/g, '\n');

describe('lo que el salón tiene delante', () => {
  it('no incluye los envíos de una mesa ya cerrada', () => {
    const consulta = POSTGRES.slice(POSTGRES.indexOf('async listActive'));
    const cuerpo = consulta.slice(0, consulta.indexOf('return ok('));

    expect(cuerpo).toContain('JOIN table_sessions');
    expect(cuerpo).toContain("s.status <> 'CLOSED'");
  });

  it('y sigue dejando afuera lo entregado y lo cancelado', () => {
    // El filtro viejo no se reemplazó: se le sumó el de la sesión.
    const consulta = POSTGRES.slice(POSTGRES.indexOf('async listActive'));
    expect(consulta.slice(0, consulta.indexOf('return ok('))).toContain(
      "NOT IN ('DELIVERED','CANCELLED')",
    );
  });
});
