import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { MEDIOS_QUE_ELIGE_LA_MESA } from '@itadaki/billing/domain';

/**
 * Qué medios de pago ve la mesa en su cuenta.
 *
 * La lista estaba escrita a mano en la pantalla, con dos opciones: efectivo y
 * un "tarjeta" genérico, de cuando débito y crédito iban juntos. Al unificar
 * el vocabulario con el del mozo esta lista quedó atrás, así que la mesa no
 * podía elegir transferencia ni decir cuál de las dos tarjetas — y el mozo se
 * enteraba recién al llegar.
 *
 * Ahora sale del vocabulario compartido. El test cruza los dos: una lista
 * escrita a mano vuelve a desincronizarse en cuanto alguien agregue un medio.
 */

const CUENTA = readFileSync(join(__dirname, 'bill.page.ts'), 'utf-8');

describe('los medios que la mesa puede elegir', () => {
  it('salen del vocabulario compartido', () => {
    // Escritos a mano se desincronizan: fue exactamente lo que pasó.
    expect(CUENTA).toContain('MEDIOS_QUE_ELIGE_LA_MESA.map(');
  });

  it('no quedó ninguna lista escrita a mano', () => {
    expect(CUENTA).not.toContain("{ id: 'CASH', label:");
  });

  it('no ofrece el "tarjeta" viejo', () => {
    // Con débito y crédito separados, "tarjeta" no dice cuál — y al dueño le
    // cuestan distinto.
    expect(CUENTA).not.toContain("id: 'CARD'");
  });

  it('son cuatro', () => {
    // Efectivo, débito, crédito y transferencia: los mismos que el mozo
    // confirma al cobrar.
    expect(MEDIOS_QUE_ELIGE_LA_MESA).toHaveLength(4);
  });

  it('cada uno explica qué va a pasar', () => {
    // "Débito" solo no dice que el mozo viene con el posnet.
    expect(CUENTA).toContain('LO_QUE_PASA_SI_ELIGE[medio]');
  });
});
