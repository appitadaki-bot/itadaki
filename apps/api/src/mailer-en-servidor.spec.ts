/**
 * Cuándo se exige un proveedor de correo de verdad.
 *
 * El guard miraba sólo `NODE_ENV`, y esa variable no estaba declarada en el
 * blueprint de Render: la API arrancaba con el mailer de consola, el link de
 * recuperación salía por el log del servidor, y quien se quedaba afuera de su
 * restaurante no recibía nada. Todo parecía funcionar, que es lo peor.
 */

/** Lo mismo que decide el arranque, extraído para poder probarlo. */
function exigeCorreoReal(entorno: {
  NODE_ENV?: string;
  DATABASE_URL?: string;
}): boolean {
  if (entorno.NODE_ENV === 'production') return true;

  const url = entorno.DATABASE_URL ?? '';
  return url.includes('://') && !url.includes('localhost');
}

const RENDER = 'postgresql://user:pass@dpg-abc.oregon-postgres.render.com/itadaki';
const LOCAL = 'postgres://itadaki:itadaki@localhost:5433/itadaki';

describe('cuándo hace falta un proveedor de correo', () => {
  it('lo exige con NODE_ENV en production', () => {
    expect(exigeCorreoReal({ NODE_ENV: 'production' })).toBe(true);
  });

  it('lo exige contra una base hosteada aunque falte NODE_ENV', () => {
    // Este era el agujero: sin NODE_ENV el guard no corría y la API arrancaba
    // en Render imprimiendo los links en el log.
    expect(exigeCorreoReal({ DATABASE_URL: RENDER })).toBe(true);
  });

  it('no lo exige en una máquina de desarrollo', () => {
    // Instalar el proyecto y probarlo no debería requerir una cuenta de correo.
    expect(exigeCorreoReal({ DATABASE_URL: LOCAL })).toBe(false);
  });

  it('no lo exige sin base configurada', () => {
    expect(exigeCorreoReal({})).toBe(false);
  });

  it('NODE_ENV manda sobre la base', () => {
    // Un servidor de pruebas con base local igual tiene que mandar correos de
    // verdad si se declara como producción.
    expect(exigeCorreoReal({ NODE_ENV: 'production', DATABASE_URL: LOCAL })).toBe(true);
  });
});
