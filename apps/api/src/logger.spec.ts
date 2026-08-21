describe('log', () => {
  const originalFetch = global.fetch;
  let fetchMock: jest.Mock;

  beforeEach(() => {
    jest.resetModules();
    fetchMock = jest.fn().mockResolvedValue({ ok: true, status: 200, statusText: 'OK' });
    global.fetch = fetchMock as unknown as typeof fetch;
    jest.spyOn(console, 'log').mockImplementation(() => undefined);
    jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
    delete process.env['AXIOM_TOKEN'];
    delete process.env['AXIOM_DATASET'];
  });

  it('siempre escribe a consola, con o sin Axiom configurado', async () => {
    const { log } = await import('./logger');
    log.info('hola', { tenantId: 'itadaki' });
    expect(console.log).toHaveBeenCalledTimes(1);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('no manda nada a Axiom si sólo está seteada una de las dos variables', async () => {
    process.env['AXIOM_TOKEN'] = 'xaat-test';
    const { log } = await import('./logger');
    log.warn('a medias');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('envía la misma línea a Axiom cuando están las dos variables', async () => {
    process.env['AXIOM_TOKEN'] = '  xaat-test\n';
    process.env['AXIOM_DATASET'] = 'itadaki-api';
    const { log } = await import('./logger');

    log.error('se rompió', { incident: 'abc123' });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.axiom.co/v1/datasets/itadaki-api/ingest');
    expect(init.headers).toMatchObject({
      Authorization: 'Bearer xaat-test',
      'Content-Type': 'application/json',
    });
    const body = JSON.parse(init.body as string) as Array<Record<string, unknown>>;
    expect(body).toHaveLength(1);
    const [entry] = body;
    expect(entry).toMatchObject({ level: 'error', message: 'se rompió', incident: 'abc123' });
    expect(entry?.['_time']).toBe(entry?.['at']);
  });

  it('un fetch que rechaza no rompe el log, y avisa por consola', async () => {
    process.env['AXIOM_TOKEN'] = 'xaat-test';
    process.env['AXIOM_DATASET'] = 'itadaki-api';
    fetchMock.mockRejectedValue(new Error('network down'));
    const { log } = await import('./logger');

    expect(() => log.error('igual sigue')).not.toThrow();
    await Promise.resolve().then(() => Promise.resolve());
    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('network down'));
  });

  it('una respuesta no-ok de Axiom (ej. token inválido) avisa por consola, no rompe el log', async () => {
    process.env['AXIOM_TOKEN'] = 'xaat-test';
    process.env['AXIOM_DATASET'] = 'itadaki-api';
    fetchMock.mockResolvedValue({ ok: false, status: 401, statusText: 'Unauthorized' });
    const { log } = await import('./logger');

    expect(() => log.error('token vencido')).not.toThrow();
    await Promise.resolve().then(() => Promise.resolve());
    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('401'));
  });
});

describe('incidentId', () => {
  it('genera un código corto para correlacionar con el usuario', async () => {
    const { incidentId } = await import('./logger');
    expect(incidentId()).toMatch(/^[a-z0-9]+$/);
  });
});
