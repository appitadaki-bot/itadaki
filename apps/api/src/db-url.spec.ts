import { conexionPostgres, withSslWhenRemote } from './db-url';

describe('withSslWhenRemote', () => {
  it('le agrega TLS a una base remota que no lo pide', () => {
    expect(withSslWhenRemote('postgresql://u:p@algo.oregon-postgres.render.com/db')).toBe(
      'postgresql://u:p@algo.oregon-postgres.render.com/db?sslmode=verify-full',
    );
  });

  /** El Postgres de Docker no ofrece TLS: exigirlo lo dejaría afuera. */
  it('no toca localhost', () => {
    const local = 'postgres://itadaki:itadaki@localhost:5433/itadaki';
    expect(withSslWhenRemote(local)).toBe(local);
  });

  it('respeta lo que la cadena ya diga', () => {
    const explicito = 'postgresql://u:p@remoto.example.com/db?sslmode=disable';
    expect(withSslWhenRemote(explicito)).toBe(explicito);

    const yaPuesto = 'postgresql://u:p@remoto.example.com/db?sslmode=verify-full';
    expect(withSslWhenRemote(yaPuesto)).toBe(yaPuesto);
  });

  it('conserva los demás parámetros', () => {
    expect(withSslWhenRemote('postgresql://u:p@remoto.example.com/db?application_name=itadaki')).toBe(
      'postgresql://u:p@remoto.example.com/db?application_name=itadaki&sslmode=verify-full',
    );
  });

  it('deja pasar lo que no sabe leer', () => {
    expect(withSslWhenRemote('no-es-una-url')).toBe('no-es-una-url');
  });
});

/**
 * Verificar contra la CA del proveedor, cuando firma con una propia.
 *
 * Supabase lo hace, y el handshake falla con `SELF_SIGNED_CERT_IN_CHAIN`: el
 * certificado está bien, lo que falta es el raíz que lo respalda.
 */
describe('la conexión con una CA propia', () => {
  const guardada = process.env['DATABASE_CA_CERT'];
  afterEach(() => {
    if (guardada === undefined) delete process.env['DATABASE_CA_CERT'];
    else process.env['DATABASE_CA_CERT'] = guardada;
  });

  const CADENA = 'postgresql://u:p@db.pooler.supabase.com:5432/postgres';

  it('sin CA configurada, se comporta como antes', () => {
    delete process.env['DATABASE_CA_CERT'];
    const config = conexionPostgres(CADENA);

    expect(config.ssl).toBeUndefined();
    expect(config.connectionString).toContain('sslmode=verify-full');
  });

  it('con CA, la manda aparte y saca el sslmode de la cadena', () => {
    // `pg` descarta el objeto ssl si la cadena trae sslmode: el certificado no
    // llegaría nunca y el error sería el mismo.
    process.env['DATABASE_CA_CERT'] = '-----BEGIN CERTIFICATE-----\nx\n-----END CERTIFICATE-----';
    const config = conexionPostgres(CADENA);

    expect(config.ssl?.ca).toContain('BEGIN CERTIFICATE');
    expect(config.connectionString).not.toContain('sslmode');
  });

  it('una CA vacía o con espacios no cuenta como configurada', () => {
    process.env['DATABASE_CA_CERT'] = '   ';
    expect(conexionPostgres(CADENA).ssl).toBeUndefined();
  });

  it('sigue verificando: nunca apaga la comprobación', () => {
    process.env['DATABASE_CA_CERT'] = '-----BEGIN CERTIFICATE-----';
    const config = conexionPostgres(CADENA);

    expect(JSON.stringify(config)).not.toContain('rejectUnauthorized');
    expect(config.connectionString).not.toContain('no-verify');
  });
});
