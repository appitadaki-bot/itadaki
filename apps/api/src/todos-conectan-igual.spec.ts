import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Todos los scripts se conectan por el mismo lugar.
 *
 * `conexionPostgres` es el que pasa la CA del proveedor cuando hay una
 * configurada; `withSslWhenRemote` sólo agrega `sslmode` a la cadena. Un
 * script que usa el segundo contra Supabase falla con
 * SELF_SIGNED_CERT_IN_CHAIN — y falla recién el día que alguien lo corre, que
 * fue lo que pasó con el alta de la cuenta de soporte.
 *
 * Se mira el directorio entero y no una lista escrita a mano: el que se
 * agregue mañana queda cubierto sin que nadie se acuerde.
 */
const AQUI = __dirname;

const fuentes = readdirSync(AQUI)
  .filter((archivo) => archivo.endsWith('.ts') && !archivo.endsWith('.spec.ts'))
  .filter((archivo) => archivo !== 'db-url.ts');

describe('cómo se conecta cada script a Postgres', () => {
  it('ninguno arma su conexión con withSslWhenRemote', () => {
    const culpables = fuentes.filter((archivo) =>
      readFileSync(join(AQUI, archivo), 'utf-8').includes('withSslWhenRemote('),
    );

    expect(culpables).toEqual([]);
  });

  it('y los que abren una conexión usan conexionPostgres', () => {
    const sinCertificado = fuentes.filter((archivo) => {
      const fuente = readFileSync(join(AQUI, archivo), 'utf-8');
      const abre = fuente.includes('new Client(') || fuente.includes('new Database(');
      return abre && !fuente.includes('conexionPostgres(');
    });

    expect(sinCertificado).toEqual([]);
  });
});
