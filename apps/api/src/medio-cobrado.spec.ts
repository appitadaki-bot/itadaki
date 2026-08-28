import { z } from 'zod';
import { MEDIOS_DE_COBRO } from '@itadaki/billing/domain';

/**
 * Qué acepta el servidor cuando el mozo cierra la mesa.
 *
 * Lo mismo que valida el controller, extraído para poder probarlo sin
 * levantar Nest entero.
 *
 * Lo que se cuida acá es que un medio mal escrito no se guarde como "nadie lo
 * dijo": el mozo declaró algo, y responderle que salió bien dejándolo en null
 * le hace creer que quedó registrado. El hueco aparecería a fin de mes, cuando
 * ya no hay forma de reconstruir con qué se cobró esa mesa.
 */
const cobroSchema = z.object({ cobradoCon: z.enum(MEDIOS_DE_COBRO).optional() });

describe('el medio que declara el mozo al cobrar', () => {
  it('acepta los cuatro medios reales', () => {
    for (const medio of ['CASH', 'DEBIT', 'CREDIT', 'TRANSFER']) {
      expect(cobroSchema.safeParse({ cobradoCon: medio }).success).toBe(true);
    }
  });

  it('acepta "en la caja"', () => {
    // No es un medio de pago: es que la plata la cobró otro. Pero se declara
    // igual, porque explica por qué esa mesa no aparece en la caja.
    expect(cobroSchema.safeParse({ cobradoCon: 'COUNTER' }).success).toBe(true);
  });

  it('deja cobrar sin declarar el medio', () => {
    // La mesa que se cobra sin que nadie diga con qué: el null es deliberado,
    // y mejor que inventar un medio.
    expect(cobroSchema.safeParse({}).success).toBe(true);
  });

  it('rechaza un medio que no existe', () => {
    // Antes esto pasaba silenciosamente a null y respondía que todo salió
    // bien.
    expect(cobroSchema.safeParse({ cobradoCon: 'CRIPTO' }).success).toBe(false);
  });

  it('rechaza el "CARD" viejo', () => {
    // Sigue existiendo en la base para las cuentas cobradas antes de separar
    // crédito de débito, pero ninguna pantalla lo vuelve a escribir: aceptarlo
    // dejaría entrar cobros nuevos sin saber cuál de los dos fue.
    expect(cobroSchema.safeParse({ cobradoCon: 'CARD' }).success).toBe(false);
  });

  it('rechaza que venga en minúscula', () => {
    // Los medios se guardan tal cual llegan: 'cash' y 'CASH' serían dos filas
    // distintas en las métricas del dueño.
    expect(cobroSchema.safeParse({ cobradoCon: 'cash' }).success).toBe(false);
  });
});
