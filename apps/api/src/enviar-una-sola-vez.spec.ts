import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const COMANDAS = readFileSync(join(__dirname, 'orders.controller.ts'), 'utf-8').replace(/\r\n/g, '\n');
const GUARDADO = readFileSync(
  join(__dirname, '..', '..', '..', 'libs', 'ordering', 'infra', 'src', 'lib', 'postgres-orders.ts'),
  'utf-8',
).replace(/\r\n/g, '\n');

/**
 * Dos personas de la misma mesa tocando "enviar" a la vez.
 *
 * El carrito es de la mesa. Con la clave que inventaba cada teléfono, los dos
 * envíos llevaban las mismas líneas con claves distintas: se creaban dos
 * comandas y la cocina cocinaba todo dos veces.
 */
describe('enviar el pedido una sola vez', () => {
  it('la clave la calcula el servidor, de la mesa y las líneas', () => {
    expect(COMANDAS).toContain('claveDeEnvio(parsed.data.sessionId, parsed.data.lineIds)');
  });

  /** Sin líneas no hay de dónde derivarla: vale la del cliente. */
  it('cae en la del cliente cuando no hay líneas', () => {
    const donde = COMANDAS.indexOf('const clave =');
    expect(COMANDAS.slice(donde, donde + 300)).toContain('idempotencyKey ?? parsed.data.clientRequestId');
  });

  /**
   * Y si los dos llegan en el mismo instante, ninguno ve la comanda del otro:
   * el índice único frena al segundo, y ahí hay que devolver la que existe.
   */
  it('el choque exacto devuelve la comanda que ya está', () => {
    expect(GUARDADO).toContain('esClaveRepetida(error)');
    expect(GUARDADO).toContain("error.code === '23505'");
  });
});
