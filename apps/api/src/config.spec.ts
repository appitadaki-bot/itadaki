import { storageIsEphemeral, trimmedEnv, urlFromEnv } from './config';

describe('urlFromEnv', () => {
  afterEach(() => {
    delete process.env['ITADAKI_TEST_URL'];
  });

  const set = (value: string): void => {
    process.env['ITADAKI_TEST_URL'] = value;
  };

  /**
   * El caso real: el valor pegado en el panel de Render se guardó con un salto
   * de línea, y cada foto quedó con esa dirección adentro para siempre.
   */
  it('recorta el salto de línea que deja pegar el valor en un panel', () => {
    set('https://api.itadaki.ar/api/images\n');
    expect(urlFromEnv('ITADAKI_TEST_URL', 'x')).toBe('https://api.itadaki.ar/api/images');
  });

  it('recorta los espacios de los costados', () => {
    set('  https://api.itadaki.ar  ');
    expect(urlFromEnv('ITADAKI_TEST_URL', 'x')).toBe('https://api.itadaki.ar');
  });

  it('saca la barra final, la ponga quien la ponga', () => {
    set('https://api.itadaki.ar/');
    expect(urlFromEnv('ITADAKI_TEST_URL', 'x')).toBe('https://api.itadaki.ar');
  });

  it('usa el valor por defecto cuando no está', () => {
    expect(urlFromEnv('ITADAKI_TEST_URL', 'http://localhost:3000')).toBe('http://localhost:3000');
  });

  it('trata el valor en blanco como ausente', () => {
    set('   ');
    expect(urlFromEnv('ITADAKI_TEST_URL', 'http://localhost:3000')).toBe('http://localhost:3000');
  });
});

describe('storageIsEphemeral', () => {
  it('en producción sin bucket, guardar una foto es tirarla', () => {
    expect(storageIsEphemeral(false, 'production')).toBe(true);
  });

  it('con bucket, se guarda donde corresponde', () => {
    expect(storageIsEphemeral(true, 'production')).toBe(false);
  });

  /** Quien clona el repo no monta un bucket para ver si la app arranca. */
  it('en desarrollo el disco alcanza', () => {
    expect(storageIsEphemeral(false, 'development')).toBe(false);
    expect(storageIsEphemeral(false, undefined)).toBe(false);
  });
});

describe('trimmedEnv', () => {
  afterEach(() => {
    delete process.env['ITADAKI_TEST_TOKEN'];
  });

  it('recorta espacios y saltos de línea de un valor pegado', () => {
    process.env['ITADAKI_TEST_TOKEN'] = '  xaat-abc123\n';
    expect(trimmedEnv('ITADAKI_TEST_TOKEN')).toBe('xaat-abc123');
  });

  it('trata el valor ausente como no configurado', () => {
    expect(trimmedEnv('ITADAKI_TEST_TOKEN')).toBeUndefined();
  });

  it('trata el valor en blanco como no configurado', () => {
    process.env['ITADAKI_TEST_TOKEN'] = '   ';
    expect(trimmedEnv('ITADAKI_TEST_TOKEN')).toBeUndefined();
  });
});
