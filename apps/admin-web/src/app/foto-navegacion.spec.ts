/**
 * Ir del plato a su foto.
 *
 * El acceso salía de un botón dentro de la ficha del plato, y esa ficha
 * quedaba abierta tapando justamente la pantalla a la que acababa de llevar:
 * había que adivinar que se cerraba tocando afuera. Ahora la foto se toca
 * sobre la foto, en la fila, y no abre nada que después haya que cerrar.
 */

type Tab = 'carta' | 'fotos';

interface Pantalla {
  tab: Tab;
  ficha: 'editar' | null;
  seleccionado: string | null;
}

const inicio: Pantalla = { tab: 'carta', ficha: null, seleccionado: null };

/** Tocar el nombre o el precio abre la ficha del plato. */
const tocarFicha = (p: Pantalla, id: string): Pantalla => ({
  ...p,
  seleccionado: id,
  ficha: 'editar',
});

/** Tocar la foto lleva a la foto. Sin abrir la ficha. */
const tocarFoto = (p: Pantalla, id: string): Pantalla => ({
  ...p,
  seleccionado: id,
  tab: 'fotos',
});

/** Elegir un plato desde la propia solapa de fotos. */
const elegirEnFotos = (p: Pantalla, id: string): Pantalla => ({ ...p, seleccionado: id });

const puedeEditarFoto = (p: Pantalla): boolean =>
  p.tab === 'fotos' && p.seleccionado !== null && p.ficha === null;

describe('del plato a su foto', () => {
  it('llega a la foto con el plato puesto', () => {
    const final = tocarFoto(inicio, 'milanesa');

    expect(final.tab).toBe('fotos');
    expect(final.seleccionado).toBe('milanesa');
    expect(puedeEditarFoto(final)).toBe(true);
  });

  it('no deja ninguna ficha abierta encima', () => {
    // Acá estaba el problema: la ficha tapaba la pantalla de la foto y había
    // que adivinar que se cerraba tocando afuera.
    expect(tocarFoto(inicio, 'milanesa').ficha).toBeNull();
  });

  it('tocar la ficha sigue abriendo la ficha, no la foto', () => {
    // Los dos accesos conviven en la misma fila y cada uno hace lo suyo.
    const final = tocarFicha(inicio, 'milanesa');

    expect(final.ficha).toBe('editar');
    expect(final.tab).toBe('carta');
  });

  it('en fotos sin plato no se edita nada', () => {
    expect(puedeEditarFoto({ tab: 'fotos', ficha: null, seleccionado: null })).toBe(false);
  });

  it('elegir el plato desde fotos alcanza para editar', () => {
    const enFotos: Pantalla = { tab: 'fotos', ficha: null, seleccionado: null };
    const conPlato = elegirEnFotos(enFotos, 'provoleta');

    expect(puedeEditarFoto(conPlato)).toBe(true);
    // Y sin abrir ninguna ficha: elegir acá es elegir, no editar el plato.
    expect(conPlato.ficha).toBeNull();
  });
});
