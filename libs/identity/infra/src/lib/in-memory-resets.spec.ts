import { InMemoryResetStore } from './in-memory-resets';
import { InMemoryStaffStore } from './in-memory-staff';

/**
 * Los pedidos de recuperación sin base de datos.
 *
 * Faltaban: el servicio armaba siempre el store de Postgres, aun con
 * `USE_POSTGRES=false`. Sin base, guardar el pedido fallaba y el mail nunca
 * salía — y la API contestaba `{"sent":true}` igual, porque esa respuesta es
 * la misma exista o no la cuenta, así que el flujo entero parecía andar sin
 * que llegara nada.
 *
 * Eso hacía que la recuperación no se pudiera probar en local, que es
 * justamente donde hay que probarla antes de tocar producción.
 */

const PEDIDO = { tenantId: 'itadaki', userId: 'dueno' };

// El personal de demostración tiene que estar cargado: consumir el pedido le
// cambia la contraseña a esa persona, y sin ella no hay a quién cambiársela.
beforeEach(async () => {
  await new InMemoryStaffStore().sembrar();
});
const AHORA = new Date('2026-09-01T12:00:00Z');
const enUnaHora = new Date(AHORA.getTime() + 3_600_000);

describe('guardar un pedido de recuperación', () => {
  it('se puede consumir después', async () => {
    const store = new InMemoryResetStore();
    await store.create('digest-1', PEDIDO, enUnaHora);

    const usado = await store.consume('digest-1', 'hash-nuevo', AHORA);

    expect(usado.isOk()).toBe(true);
  });

  it('pedirlo dos veces deja vivo sólo el último', async () => {
    // Dos links vivos en la misma casilla es una credencial de más dando
    // vueltas, y quien la encuentre entra.
    const store = new InMemoryResetStore();
    await store.create('viejo', PEDIDO, enUnaHora);
    await store.create('nuevo', PEDIDO, enUnaHora);

    expect((await store.consume('viejo', 'hash', AHORA)).isErr()).toBe(true);
    expect((await store.consume('nuevo', 'hash', AHORA)).isOk()).toBe(true);
  });
});

describe('lo que no deja pasar', () => {
  it('un token que nunca existió', async () => {
    const store = new InMemoryResetStore();

    expect((await store.consume('inventado', 'hash', AHORA)).isErr()).toBe(true);
  });

  it('el mismo token dos veces', async () => {
    // Un link reenviado a otro no puede volver a cambiar la contraseña.
    const store = new InMemoryResetStore();
    await store.create('digest-1', PEDIDO, enUnaHora);
    await store.consume('digest-1', 'hash', AHORA);

    expect((await store.consume('digest-1', 'otro', AHORA)).isErr()).toBe(true);
  });

  it('uno vencido', async () => {
    const store = new InMemoryResetStore();
    await store.create('digest-1', PEDIDO, new Date(AHORA.getTime() - 1000));

    expect((await store.consume('digest-1', 'hash', AHORA)).isErr()).toBe(true);
  });

  it('todos fallan igual', async () => {
    // Distinguir "no existe" de "vencido" le confirma a quien prueba tokens
    // que acertó uno.
    const store = new InMemoryResetStore();
    await store.create('vencido', PEDIDO, new Date(AHORA.getTime() - 1000));

    const inexistente = await store.consume('nunca-existio', 'hash', AHORA);
    const caducado = await store.consume('vencido', 'hash', AHORA);
    if (inexistente.isOk() || caducado.isOk()) throw new Error('deberían fallar');

    expect(inexistente.error.kind).toBe(caducado.error.kind);
  });
});

describe('a quién le cambia la contraseña', () => {
  it('devuelve de quién era el pedido', async () => {
    // El controller lo usa para armarle la sesión: cambiar la contraseña
    // también entra, porque acaba de probar que la casilla es suya.
    const store = new InMemoryResetStore();
    await store.create('digest-1', PEDIDO, enUnaHora);

    const usado = await store.consume('digest-1', 'hash', AHORA);
    if (usado.isErr()) throw new Error('expected ok');

    expect(usado.value).toEqual(PEDIDO);
  });
});
