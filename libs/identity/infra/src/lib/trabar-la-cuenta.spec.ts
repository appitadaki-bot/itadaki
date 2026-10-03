import { InMemoryResetStore } from './in-memory-resets';
import { InMemoryStaffStore } from './in-memory-staff';

/**
 * Trabar la cuenta por contraseña, y destrabarla al recuperarla.
 *
 * El tope de la ruta cuenta por dirección de red, y quien prueba contraseñas
 * a ciegas cambia de IP cuando quiere; de cuenta no cambia, porque es la que
 * vino a abrir. Por eso el contador va en la fila de la persona.
 *
 * Lo segundo apareció probándolo: quien se quedaba afuera probando y venía a
 * recuperar la contraseña **seguía trabado**, ahora con una contraseña nueva
 * que tampoco lo dejaba entrar y sin nada que le explicara por qué. El reset
 * tiene que limpiar el contador además de cambiar el hash.
 */

const MAIL = 'dueno@itadaki.test';

async function elDueno() {
  const staff = new InMemoryStaffStore();
  const found = await staff.findByEmail(MAIL);
  if (found.isErr()) throw new Error('el restaurante de demostración no se sembró');
  return { staff, persona: found.value };
}

describe('trabar la cuenta por contraseña', () => {
  it('arranca sin intentos', async () => {
    const { persona } = await elDueno();
    expect(persona.intentos).toBe(0);
    expect(persona.trabadoHasta).toBeNull();
  });

  it('cuenta los fallidos y guarda hasta cuándo', async () => {
    const { staff, persona } = await elDueno();
    const hasta = new Date('2026-10-03T21:00:00Z');

    await staff.registrarIntentoDeClave(persona.id, false, null);
    await staff.registrarIntentoDeClave(persona.id, false, hasta);

    const despues = await staff.findByEmail(MAIL);
    expect(despues.isOk() && despues.value.intentos).toBe(2);
    expect(despues.isOk() && despues.value.trabadoHasta).toEqual(hasta);
  });

  it('acertar borra el contador', async () => {
    // Quien se equivocó dos veces no arrastra eso el resto del día.
    const { staff, persona } = await elDueno();
    await staff.registrarIntentoDeClave(persona.id, false, null);
    await staff.registrarIntentoDeClave(persona.id, true, null);

    const despues = await staff.findByEmail(MAIL);
    expect(despues.isOk() && despues.value.intentos).toBe(0);
    expect(despues.isOk() && despues.value.trabadoHasta).toBeNull();
  });

  it('recuperar la contraseña destraba la cuenta', async () => {
    // El agujero: cambiar el hash y dejar el contador deja a alguien afuera
    // con una contraseña nueva que sí es la correcta.
    const { staff, persona } = await elDueno();
    const resets = new InMemoryResetStore();
    const ahora = new Date('2026-10-03T20:00:00Z');

    await staff.registrarIntentoDeClave(
      persona.id,
      false,
      new Date('2026-10-03T20:15:00Z'),
    );

    await resets.create(
      'digest-de-prueba',
      { tenantId: persona.tenantId, userId: persona.id },
      new Date('2026-10-03T21:00:00Z'),
    );
    const usado = await resets.consume('digest-de-prueba', 'scrypt$65536$8$1$aa$bb', ahora);
    expect(usado.isOk()).toBe(true);

    const despues = await staff.findByEmail(MAIL);
    expect(despues.isOk() && despues.value.intentos).toBe(0);
    expect(despues.isOk() && despues.value.trabadoHasta).toBeNull();
    expect(despues.isOk() && despues.value.passwordHash).toBe('scrypt$65536$8$1$aa$bb');
  });
});
