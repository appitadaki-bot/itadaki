import { urlFromEnv } from './config';

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
