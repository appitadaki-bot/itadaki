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

/**
 * Entrar a "Fotos" sin haber pasado por la carta.
 *
 * Nadie garantiza que el recorrido empiece en la carta: la solapa está ahí
 * arriba y se toca directo. Y el plato elegido antes puede haber dejado de
 * existir — se borró, o se importó una carta nueva encima.
 */
interface Plato {
  id: string;
  foto: string | null;
}

/** Lo que decide si hay algo que editar: el plato, no el id guardado. */
const hayQueEditar = (seleccionado: string | null, platos: readonly Plato[]): boolean =>
  seleccionado !== null && platos.some((p) => p.id === seleccionado);

/** Los que no tienen foto primero: es la lista de lo que falta hacer. */
const sinFotoPrimero = (platos: readonly Plato[]): readonly Plato[] => [
  ...platos.filter((p) => p.foto === null),
  ...platos.filter((p) => p.foto !== null),
];

describe('entrar directo a la solapa de fotos', () => {
  const carta: readonly Plato[] = [
    { id: 'milanesa', foto: 'u1' },
    { id: 'provoleta', foto: null },
    { id: 'flan', foto: null },
  ];

  it('sin plato elegido no edita nada: pide elegir', () => {
    // El estado inicial de la app. Nadie garantiza que se pase por la carta.
    expect(hayQueEditar(null, carta)).toBe(false);
  });

  it('un plato borrado no deja la pantalla editando un fantasma', () => {
    // El id sobrevive a que el plato desaparezca, así que preguntar por el id
    // dejaba la pantalla "editando" algo inexistente, con el nombre en blanco.
    expect(hayQueEditar('bife', carta)).toBe(false);
  });

  it('con un plato que sí existe, edita', () => {
    expect(hayQueEditar('provoleta', carta)).toBe(true);
  });

  it('ofrece primero los que no tienen foto', () => {
    // Con veinte platos cargados, los que ya tienen foto son ruido: buscar el
    // que falta entre ellos es el trabajo que esta pantalla viene a ahorrar.
    expect(sinFotoPrimero(carta).map((p) => p.id)).toEqual(['provoleta', 'flan', 'milanesa']);
  });

  it('con todos fotografiados igual se pueden cambiar', () => {
    const completa: readonly Plato[] = [
      { id: 'milanesa', foto: 'u1' },
      { id: 'flan', foto: 'u2' },
    ];
    expect(sinFotoPrimero(completa)).toHaveLength(2);
  });

  it('sin platos cargados no hay nada que ofrecer', () => {
    expect(sinFotoPrimero([])).toEqual([]);
    expect(hayQueEditar(null, [])).toBe(false);
  });
});
