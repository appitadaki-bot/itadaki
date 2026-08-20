/**
 * Ir del plato a su foto, sin perder el plato en el camino.
 *
 * Había un ida y vuelta del que no se salía: "Trabajar la foto" cambiaba de
 * solapa pero dejaba el modal abierto encima, y cerrarlo borraba la selección.
 * La solapa de fotos se quedaba sin plato, decía "elegí un plato de tu carta"
 * y mandaba de vuelta a la carta.
 */

type Tab = 'carta' | 'fotos';

interface Pantalla {
  tab: Tab;
  modal: 'editar' | null;
  seleccionado: string | null;
}

/** Tocar un plato en la carta abre su ficha. */
const tocarPlato = (p: Pantalla, id: string): Pantalla => ({
  ...p,
  seleccionado: id,
  modal: 'editar',
});

/** Cerrar la ficha suelta el plato: se terminó de trabajar con él. */
const cerrarFicha = (p: Pantalla): Pantalla => ({ ...p, modal: null, seleccionado: null });

/** "Trabajar la foto": cierra la ficha pero conserva el plato. */
const trabajarLaFoto = (p: Pantalla): Pantalla => ({ ...p, modal: null, tab: 'fotos' });

/** La solapa de fotos sin plato ya no manda a ningún lado: se elige ahí. */
const puedeEditarFoto = (p: Pantalla): boolean => p.tab === 'fotos' && p.seleccionado !== null;

describe('del plato a su foto', () => {
  const inicio: Pantalla = { tab: 'carta', modal: null, seleccionado: null };

  it('llega a la foto con el plato puesto', () => {
    const final = trabajarLaFoto(tocarPlato(inicio, 'milanesa'));

    expect(final.tab).toBe('fotos');
    expect(final.seleccionado).toBe('milanesa');
    expect(puedeEditarFoto(final)).toBe(true);
  });

  it('no deja el modal abierto encima de la solapa nueva', () => {
    // Ahí empezaba el loop: el modal tapaba la solapa de fotos, y cerrarlo
    // borraba el plato.
    expect(trabajarLaFoto(tocarPlato(inicio, 'milanesa')).modal).toBeNull();
  });

  it('cerrar la ficha desde la carta sí suelta el plato', () => {
    // El otro camino tiene que seguir funcionando: quien mira una ficha y la
    // cierra no quedó a mitad de nada.
    const final = cerrarFicha(tocarPlato(inicio, 'milanesa'));

    expect(final.seleccionado).toBeNull();
    expect(final.tab).toBe('carta');
  });

  it('en fotos sin plato no se edita nada, y no se rebota', () => {
    // Antes este estado mandaba de vuelta a la carta. Ahora el plato se elige
    // en la misma solapa, así que el estado existe pero no es un callejón.
    const enFotos: Pantalla = { tab: 'fotos', modal: null, seleccionado: null };
    expect(puedeEditarFoto(enFotos)).toBe(false);
  });

  it('elegir el plato desde fotos alcanza para editar', () => {
    const enFotos: Pantalla = { tab: 'fotos', modal: null, seleccionado: null };
    const conPlato: Pantalla = { ...enFotos, seleccionado: 'provoleta' };

    expect(puedeEditarFoto(conPlato)).toBe(true);
    // Y sin abrir ninguna ficha: elegir acá es elegir, no editar el plato.
    expect(conPlato.modal).toBeNull();
  });
});
