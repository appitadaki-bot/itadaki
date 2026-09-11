import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const SESIONES = readFileSync(join(__dirname, 'sessions.controller.ts'), 'utf-8').replace(
  /\r\n/g,
  '\n',
);
const SALON = readFileSync(
  join(__dirname, '..', '..', 'floor-web', 'src', 'app', 'floor.component.ts'),
  'utf-8',
).replace(/\r\n/g, '\n');

/**
 * Lo que el salón cobra, según con qué paguen.
 *
 * El botón de cobrar mostraba lo que la mesa había dicho al pedir la cuenta.
 * Si dijo crédito y después pagó en efectivo, el salón no mostraba el
 * descuento en ningún lado, y el mozo cobraba el total o restaba de memoria.
 */
describe('lo que el salón tiene que cobrar', () => {
  it('sabe cuánto baja en efectivo aunque la mesa haya elegido otra cosa', () => {
    // Del porcentaje del local, no de lo que quedó anotado en la cuenta.
    expect(SESIONES).toContain('descuentoDelLocal(this.tenants.store, tenantId)');
    expect(SESIONES).not.toContain('this.bills.store.findBySession(tenantId, table.sessionId)');
  });

  it('cada medio dice cuánto se cobra con él, antes de tocarlo', () => {
    // Tocar el botón cobra en el acto: el monto tiene que estar en el botón.
    const botones = SALON.slice(SALON.indexOf('@for (medio of mediosDeCobro'));
    expect(botones.slice(0, 600)).toContain('money(montoPara(mesa, medio))');
  });

  it('la pregunta ya no dice un monto, porque depende de lo que toquen', () => {
    expect(SALON).toContain('<p class="cobro-ask">¿Con qué pagaron?</p>');
  });

  it('la tarjeta avisa cuánto sale en efectivo', () => {
    expect(SALON).toContain("En efectivo, {{ money(montoPara(mesa, 'CASH')) }}");
  });

  it('el descuento se resta sólo en efectivo', () => {
    const cuenta = SALON.slice(SALON.indexOf('protected montoPara('));
    expect(cuenta.slice(0, 500)).toContain("medio === 'CASH' && mesa.descuento !== null");
  });
});
