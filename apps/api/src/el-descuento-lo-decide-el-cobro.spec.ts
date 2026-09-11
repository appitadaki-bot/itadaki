import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Qué descuento queda registrado al cobrar: el del medio con el que pagaron.
 *
 * La mesa dice cómo piensa pagar cuando pide la cuenta, y eso cambia en la
 * mesa. Elige crédito, el mozo le cuenta que en efectivo tiene un diez por
 * ciento menos, y paga en efectivo. Cuando se guardaba lo que la mesa eligió,
 * ese cobro quedaba sin descuento en el salón y en las métricas, aunque el mozo
 * había cobrado con la rebaja.
 *
 * Estuvo al revés una vez, por el caso contrario: el mozo declaraba efectivo,
 * se guardaba el descuento y la mesa había pagado el total. Pasaba porque el
 * botón de efectivo no decía cuánto era. Ahora cada medio muestra su monto
 * antes de tocarlo, así que lo que se guarda es lo que el mozo vio y cobró.
 */
const CONTROLLER = readFileSync(join(__dirname, 'bills.controller.ts'), 'utf-8').replace(
  /\r\n/g,
  '\n',
);

const cierre = (() => {
  const desde = CONTROLLER.slice(CONTROLLER.indexOf('async settle('));
  return desde.slice(0, desde.indexOf('\n  @'));
})();

describe('el descuento lo decide el medio con el que pagaron', () => {
  it('se calcula desde el medio que declara el mozo', () => {
    expect(cierre).toContain('aplicaA(cobradoCon)');
  });

  it('con el porcentaje del local, no con un monto que mande el teléfono', () => {
    // Aceptar un monto del cliente dejaría que cualquiera declare la rebaja
    // que quiera.
    expect(cierre).toContain('descuentoDelLocal(this.tenants.store, scope.tenantId)');
    expect(cierre).toContain('montoDelDescuento(delLocal, subtotal)');
  });

  it('ya no se queda con lo que la mesa eligió antes de pagar', () => {
    expect(cierre).not.toContain('const yaAcordado = bill.descuentoMinor');
  });
});

describe('la cuenta anota lo que muestra', () => {
  it('guarda el descuento al calcular la división', () => {
    // Es lo que el comensal ve mientras decide cómo pagar.
    const split = CONTROLLER.slice(CONTROLLER.indexOf("@Post(':sessionId/split')"));
    const cuerpo = split.slice(0, split.indexOf('\n  @'));

    expect(cuerpo).toContain('descuentoMinor: rebaja.value.amountInMinorUnits');
  });
});
