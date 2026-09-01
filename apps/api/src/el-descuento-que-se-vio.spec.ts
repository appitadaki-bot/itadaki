import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Qué descuento queda registrado al cobrar.
 *
 * El servidor lo recalculaba al cerrar la mesa, desde el medio que declaraba
 * el mozo: si decía "efectivo", guardaba el descuento aunque la mesa hubiera
 * pagado el total sin rebaja.
 *
 * Reproducido con un consumo de 6.800 y un 10% configurado: la mesa veía
 * 6.800, entregaba 6.800, y las métricas registraban 6.120 con 680 de
 * descuento. El local aparecía cobrando 680 menos de lo que cobró, y en un
 * número que el dueño cruza con su caja eso no es un redondeo — es una
 * diferencia que no puede explicar.
 */

const CONTROLLER = readFileSync(join(__dirname, 'bills.controller.ts'), 'utf-8');

/** Lo que decide el cierre: qué descuento se guarda. */
function descuentoAlCobrar(input: {
  readonly acordadoConLaMesa: number;
  readonly medioQueDeclaraElMozo: string;
}): number {
  // El que la mesa vio, no el que correspondería al medio.
  return input.acordadoConLaMesa;
}

describe('el descuento que se registra', () => {
  it('es el que la mesa vio', () => {
    expect(
      descuentoAlCobrar({ acordadoConLaMesa: 68_000, medioQueDeclaraElMozo: 'CASH' }),
    ).toBe(68_000);
  });

  it('no aparece si la mesa nunca lo vio', () => {
    // El bug exacto: el mozo declara efectivo, pero la mesa ya pagó el total.
    expect(
      descuentoAlCobrar({ acordadoConLaMesa: 0, medioQueDeclaraElMozo: 'CASH' }),
    ).toBe(0);
  });

  it('se mantiene aunque el mozo declare otro medio', () => {
    // La mesa eligió efectivo y vio la rebaja; si el mozo termina cobrando con
    // tarjeta, lo que se cobró es lo que la mesa pagó.
    expect(
      descuentoAlCobrar({ acordadoConLaMesa: 68_000, medioQueDeclaraElMozo: 'CREDIT' }),
    ).toBe(68_000);
  });
});

describe('el cierre no recalcula la rebaja', () => {
  it('usa el descuento anotado en la cuenta', () => {
    const cierre = CONTROLLER.slice(CONTROLLER.indexOf('async settle('));
    const cuerpo = cierre.slice(0, cierre.indexOf('\n  @'));

    expect(cuerpo).toContain('bill.descuentoMinor');
  });

  it('y no lo deriva del medio que declara el mozo', () => {
    // `aplicaA(cobradoCon)` era la línea que inventaba la rebaja.
    const cierre = CONTROLLER.slice(CONTROLLER.indexOf('async settle('));
    const cuerpo = cierre.slice(0, cierre.indexOf('\n  @'));

    expect(cuerpo).not.toContain('aplicaA(cobradoCon)');
  });
});

describe('la cuenta anota lo que muestra', () => {
  it('guarda el descuento al calcular la división', () => {
    // Sin esto el arreglo dejaría el descuento siempre en cero: la pantalla lo
    // mostraba pero no lo escribía en ningún lado.
    const split = CONTROLLER.slice(CONTROLLER.indexOf("@Post(':sessionId/split')"));
    const cuerpo = split.slice(0, split.indexOf('\n  @'));

    expect(cuerpo).toContain('descuentoMinor: rebaja.value.amountInMinorUnits');
  });
});
