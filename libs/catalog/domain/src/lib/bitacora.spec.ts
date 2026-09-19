import { comoSeLee, precioComoTexto, queCambioDelPlato } from './bitacora';

describe('qué cambió de un plato', () => {
  const base = { nombre: 'Milanesa', precioMinor: 1_200_000, currency: 'ARS', disponible: true };

  it('el precio, con los dos valores', () => {
    const cambio = queCambioDelPlato(base, { ...base, precioMinor: 1_400_000 });
    expect(cambio).toEqual({ antes: '$\u00a012.000', despues: '$\u00a014.000' });
  });

  it('el nombre', () => {
    const cambio = queCambioDelPlato(base, { ...base, nombre: 'Milanesa napolitana' });
    expect(cambio).toEqual({ antes: 'Milanesa', despues: 'Milanesa napolitana' });
  });

  it('y quedarse sin stock', () => {
    const cambio = queCambioDelPlato(base, { ...base, disponible: false });
    expect(cambio).toEqual({ antes: 'disponible', despues: 'sin stock' });
  });

  /** Dos cosas a la vez se leen juntas, no en dos filas. */
  it('varios cambios en un solo registro', () => {
    const cambio = queCambioDelPlato(base, {
      ...base,
      nombre: 'Napolitana',
      precioMinor: 1_500_000,
    });
    expect(cambio).toEqual({
      antes: 'Milanesa · $\u00a012.000',
      despues: 'Napolitana · $\u00a015.000',
    });
  });

  /**
   * Guardar sin tocar nada no deja rastro.
   *
   * Una fila por cada guardado llenaría la bitácora de ruido, y una bitácora
   * ruidosa no la lee nadie.
   */
  it('guardar sin cambios no registra nada', () => {
    expect(queCambioDelPlato(base, { ...base })).toBeNull();
  });
});

describe('cómo se lee un cambio', () => {
  it('un plato nuevo', () => {
    expect(
      comoSeLee({ entidad: 'PLATO', entidadId: 'p1', accion: 'CREO', antes: null, despues: 'Flan' }),
    ).toBe('agregó un plato: Flan');
  });

  it('un plato borrado', () => {
    expect(
      comoSeLee({ entidad: 'PLATO', entidadId: 'p1', accion: 'BORRO', antes: 'Flan', despues: null }),
    ).toBe('borró un plato: Flan');
  });

  it('un precio, con el antes y el después', () => {
    expect(
      comoSeLee({
        entidad: 'PLATO',
        entidadId: 'p1',
        accion: 'CAMBIO',
        antes: '$12.000',
        despues: '$14.000',
      }),
    ).toBe('cambió un plato: $12.000 → $14.000');
  });

  it('una importación de la carta entera', () => {
    expect(
      comoSeLee({
        entidad: 'CARTA',
        entidadId: null,
        accion: 'IMPORTO',
        antes: null,
        despues: '70 platos',
      }),
    ).toBe('importó la carta (70 platos)');
  });

  it('una categoría', () => {
    expect(
      comoSeLee({
        entidad: 'CATEGORIA',
        entidadId: 'c1',
        accion: 'CREO',
        antes: null,
        despues: 'Postres',
      }),
    ).toBe('agregó una categoría: Postres');
  });
});

describe('el precio como se escribe', () => {
  /** Sin centavos: la carta no los usa y se lee de un vistazo. */
  it('en pesos enteros', () => {
    // `Intl` en es-AR separa el signo con un espacio fino; es el formato
    // correcto del locale, así que se respeta en vez de recortarlo a mano.
    expect(precioComoTexto(1_200_000, 'ARS')).toBe('$\u00a012.000');
    expect(precioComoTexto(300_000, 'ARS')).toBe('$\u00a03.000');
  });
});
