import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { MEDIOS_QUE_ELIGE_EL_MOZO, MEDIOS_QUE_ELIGE_LA_MESA } from '@itadaki/billing/domain';

const CUENTA = readFileSync(join(__dirname, 'bill.page.ts'), 'utf-8').replace(/\r\n/g, '\n');

/**
 * La mesa y el mozo eligen entre lo mismo.
 *
 * La pantalla de la cuenta tenía su propia lista con dos —efectivo y
 * "tarjeta"— mientras el mozo elegía entre cuatro. La mesa decía "tarjeta", el
 * mozo traducía a débito o crédito al cobrar, y las métricas por medio nunca
 * cuadraban con lo que la mesa había elegido.
 */
describe('los medios que ve la mesa', () => {
  it('son los mismos que elige el mozo', () => {
    expect([...MEDIOS_QUE_ELIGE_LA_MESA]).toEqual([...MEDIOS_QUE_ELIGE_EL_MOZO]);
  });

  it('los cuatro, no dos', () => {
    expect(MEDIOS_QUE_ELIGE_LA_MESA).toHaveLength(4);
    expect(MEDIOS_QUE_ELIGE_LA_MESA).toContain('DEBIT');
    expect(MEDIOS_QUE_ELIGE_LA_MESA).toContain('CREDIT');
  });

  /** Salen del dominio: una lista propia se separa de la del mozo el día que
      alguien agrega un medio. */
  it('la pantalla los toma del dominio', () => {
    expect(CUENTA).toContain('MEDIOS_QUE_ELIGE_LA_MESA.map');
    expect(CUENTA).not.toContain("{ id: 'CARD'");
  });
});

/** Por ahora se cobra en pesos y nada más. */
describe('la moneda', () => {
  it('no se elige en la cuenta', () => {
    expect(CUENTA).not.toContain('Ver en');
    expect(CUENTA).not.toContain('displayCurrency');
  });
});
