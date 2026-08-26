import { withSslWhenRemote } from './db-url';

describe('withSslWhenRemote', () => {
  it('le agrega TLS a una base remota que no lo pide', () => {
    expect(withSslWhenRemote('postgresql://u:p@algo.oregon-postgres.render.com/db')).toBe(
      'postgresql://u:p@algo.oregon-postgres.render.com/db?sslmode=require',
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
      'postgresql://u:p@remoto.example.com/db?application_name=itadaki&sslmode=require',
    );
  });

  it('deja pasar lo que no sabe leer', () => {
    expect(withSslWhenRemote('no-es-una-url')).toBe('no-es-una-url');
  });
});
