/**
 * De qué restaurante es quien está entrando.
 *
 * El dueño comparte un link con el slug del local —que ya es su identificador,
 * así que no hay nada que crear— y de ahí sale la pantalla que se muestra: con
 * local, usuario y PIN; sin local, mail y contraseña.
 *
 * Equivocarse acá tiene dos formas malas: mandar al dueño a una pantalla de
 * PIN que no puede usar, o dejar al mozo pidiendo un mail que no tiene.
 */

/** Lo mismo que decide el componente, extraído para poder probarlo. */
function localDelLink(pathname: string): string | null {
  const tramo = pathname.split('/').filter(Boolean)[0] ?? '';
  return /^[a-z0-9-]{2,60}$/.test(tramo) ? tramo : null;
}

describe('sacar el restaurante del link', () => {
  it('lo toma del primer tramo', () => {
    expect(localDelLink('/parrilla-don-pepe')).toBe('parrilla-don-pepe');
  });

  it('funciona con barra al final', () => {
    // Los navegadores la agregan solos, y quien copia el link a veces la deja.
    expect(localDelLink('/parrilla-don-pepe/')).toBe('parrilla-don-pepe');
  });

  it('ignora lo que venga después', () => {
    expect(localDelLink('/parrilla-don-pepe/mesas')).toBe('parrilla-don-pepe');
  });

  it('sin tramo no hay local', () => {
    // La raíz es por donde entra el dueño, con mail y contraseña.
    expect(localDelLink('/')).toBeNull();
    expect(localDelLink('')).toBeNull();
  });

  it('rechaza un tramo con mayúsculas o símbolos', () => {
    // Los slugs se generan en minúscula: algo distinto no es un local, es
    // otra ruta de la app.
    expect(localDelLink('/Parrilla')).toBeNull();
    expect(localDelLink('/parrilla_don_pepe')).toBeNull();
  });

  it('rechaza uno de una sola letra', () => {
    expect(localDelLink('/a')).toBeNull();
  });

  it('rechaza uno desmedidamente largo', () => {
    expect(localDelLink(`/${'x'.repeat(80)}`)).toBeNull();
  });

  it('acepta números y guiones, que es como salen los slugs', () => {
    // El alta agrega un sufijo cuando el nombre ya está tomado.
    expect(localDelLink('/parrilla-don-pepe-64005')).toBe('parrilla-don-pepe-64005');
  });
});
