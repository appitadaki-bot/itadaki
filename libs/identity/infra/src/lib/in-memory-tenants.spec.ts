import { InMemoryTenantStore } from './in-memory-tenants';

const alta = (email: string, tenantId = 'manolo') => ({
  tenantId,
  name: 'Manolo San Telmo',
  slug: tenantId,
  currency: 'ARS',
  staff: {
    id: `u-${tenantId}`,
    email,
    displayName: 'Manolo',
    passwordHash: 'hash',
    role: 'OWNER' as const,
  },
});

describe('el alta en memoria', () => {
  beforeEach(() => InMemoryTenantStore.reset());

  it('crea el restaurante y su dueño', async () => {
    const store = new InMemoryTenantStore();
    const creado = await store.signUp(alta('manolo@ejemplo.test'));
    if (creado.isErr()) throw new Error('expected ok');

    expect(creado.value.tenant.name).toBe('Manolo San Telmo');
    expect(creado.value.owner.role).toBe('OWNER');
  });

  it('rechaza un mail que ya tiene cuenta', async () => {
    // El índice de mails es global en Postgres, así que acá también: si no,
    // el alta andaría distinto en local que en producción.
    const store = new InMemoryTenantStore();
    await store.signUp(alta('manolo@ejemplo.test'));

    const otra = await store.signUp(alta('manolo@ejemplo.test', 'otro'));
    expect(otra.isErr()).toBe(true);
  });

  it('el mismo mail en otra capitalización también está tomado', async () => {
    const store = new InMemoryTenantStore();
    await store.signUp(alta('manolo@ejemplo.test'));

    const otra = await store.signUp(alta('MANOLO@Ejemplo.Test', 'otro'));
    expect(otra.isErr()).toBe(true);
  });

  it('el trial no arranca al crear la cuenta', async () => {
    // Arranca con el primer pedido: quien se anota y espera la carta no puede
    // perder esos días.
    const store = new InMemoryTenantStore();
    await store.signUp(alta('manolo@ejemplo.test'));

    const suscripcion = await store.subscriptionFor('manolo');
    if (suscripcion.isErr()) throw new Error('expected ok');

    expect(suscripcion.value.trialEndsAt).toBeNull();
    expect(suscripcion.value.estrenado).toBe(false);
  });

  it('el primer pedido lo arranca, y sólo el primero', async () => {
    const store = new InMemoryTenantStore();
    await store.signUp(alta('manolo@ejemplo.test'));

    const primera = await store.estrenar('manolo', new Date());
    const segunda = await store.estrenar('manolo', new Date());
    if (primera.isErr() || segunda.isErr()) throw new Error('expected ok');

    expect(primera.value).toBe(true);
    // Si la segunda también arrancara, cada pedido correría la fecha treinta
    // días y el trial no terminaría nunca.
    expect(segunda.value).toBe(false);
  });
});

describe('la verificación del mail en memoria', () => {
  beforeEach(() => InMemoryTenantStore.reset());

  const AHORA = new Date('2026-08-26T12:00:00Z');
  const enHoras = (h: number) => new Date(AHORA.getTime() + h * 3_600_000);

  it('verifica con el token correcto', async () => {
    const store = new InMemoryTenantStore();
    await store.signUp(alta('manolo@ejemplo.test'));
    await store.pedirVerificacion('manolo@ejemplo.test', 'digest-1', enHoras(72));

    const hecho = await store.verificarMail('digest-1', AHORA);
    if (hecho.isErr()) throw new Error('expected ok');

    // El mail y no el local: verificar también abre la sesión, y con el local
    // solo no se sabría cuál de las personas del restaurante abrió el link.
    expect(hecho.value).toBe('manolo@ejemplo.test');
  });

  it('el mismo token no sirve dos veces', async () => {
    // Un link reenviado a otro no puede volver a verificar.
    const store = new InMemoryTenantStore();
    await store.signUp(alta('manolo@ejemplo.test'));
    await store.pedirVerificacion('manolo@ejemplo.test', 'digest-1', enHoras(72));
    await store.verificarMail('digest-1', AHORA);

    const otraVez = await store.verificarMail('digest-1', AHORA);
    if (otraVez.isErr()) throw new Error('expected ok');
    expect(otraVez.value).toBeNull();
  });

  it('un token vencido no verifica', async () => {
    const store = new InMemoryTenantStore();
    await store.signUp(alta('manolo@ejemplo.test'));
    await store.pedirVerificacion('manolo@ejemplo.test', 'digest-1', enHoras(-1));

    const hecho = await store.verificarMail('digest-1', AHORA);
    if (hecho.isErr()) throw new Error('expected ok');
    expect(hecho.value).toBeNull();
  });

  it('un token que no existe no verifica', async () => {
    const store = new InMemoryTenantStore();
    const hecho = await store.verificarMail('inventado', AHORA);
    if (hecho.isErr()) throw new Error('expected ok');

    expect(hecho.value).toBeNull();
  });

  it('recién después de verificar figura como verificado', async () => {
    const store = new InMemoryTenantStore();
    await store.signUp(alta('manolo@ejemplo.test'));
    await store.pedirVerificacion('manolo@ejemplo.test', 'digest-1', enHoras(72));

    const antes = await store.mailVerificado('manolo@ejemplo.test');
    if (antes.isErr()) throw new Error('expected ok');
    expect(antes.value).toBe(false);

    await store.verificarMail('digest-1', AHORA);

    const despues = await store.mailVerificado('manolo@ejemplo.test');
    if (despues.isErr()) throw new Error('expected ok');
    expect(despues.value).toBe(true);
  });
});
