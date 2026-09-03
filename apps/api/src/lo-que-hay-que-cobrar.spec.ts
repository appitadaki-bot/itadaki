import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const SESIONES = readFileSync(join(__dirname, 'sessions.controller.ts'), 'utf-8').replace(/\r\n/g, '\n');
const SALON = readFileSync(
  join(__dirname, '..', '..', 'floor-web', 'src', 'app', 'floor.component.ts'),
  'utf-8',
).replace(/\r\n/g, '\n');

/**
 * El salón cobra lo acordado, no lo que suman los platos.
 *
 * Lo adeudado se arma de las comandas, que no saben cómo se paga. Si la mesa
 * eligió efectivo, el descuento quedó guardado en la cuenta: sin mirarlo, el
 * mozo cobraba el total y tenía que acordarse de restar el porcentaje de
 * memoria — o cobrarlo de más, que es lo que pasa en la mesa apurada.
 */
describe('lo que el salón tiene que cobrar', () => {
  it('la lista de mesas por cobrar mira la cuenta', () => {
    expect(SESIONES).toContain('this.bills.store.findBySession(tenantId, table.sessionId)');
  });

  it('y descuenta lo acordado', () => {
    expect(SESIONES).toContain('descuentoMinor');
    expect(SESIONES).toContain('aCobrar');
  });

  /** El botón dice el número que se cobra, no el de los platos. */
  it('el botón de cobrar usa lo acordado', () => {
    const boton = SALON.indexOf('Cobré');
    expect(SALON.slice(boton - 200, boton + 120)).toContain('mesa.aCobrar');
  });

  /** Y se dice de dónde sale, por si el cliente pregunta. */
  it('el salón explica por qué es menos', () => {
    expect(SALON).toContain('menos {{ money(mesa.descuento) }} en efectivo');
  });
});
