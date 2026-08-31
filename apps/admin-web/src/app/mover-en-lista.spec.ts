import { moverEnLista } from './mover-en-lista';

const carta = ['entradas', 'principales', 'postres', 'bebidas'];

describe('moverEnLista', () => {
  it('sube una posición, que es lo que hace la flecha', () => {
    expect(moverEnLista(carta, 2, 1)).toEqual([
      'entradas',
      'postres',
      'principales',
      'bebidas',
    ]);
  });

  /** Soltarla sobre otra: ocupa el lugar de esa y el resto corre. */
  it('lleva la última al principio', () => {
    expect(moverEnLista(carta, 3, 0)).toEqual([
      'bebidas',
      'entradas',
      'principales',
      'postres',
    ]);
  });

  it('soltarla sobre sí misma no cambia nada', () => {
    expect(moverEnLista(carta, 1, 1)).toEqual(carta);
  });

  it('no inventa lugares fuera de la lista', () => {
    expect(moverEnLista(carta, 0, 9)).toEqual(carta);
    expect(moverEnLista(carta, -1, 2)).toEqual(carta);
  });

  it('no toca la lista que recibe', () => {
    const original = [...carta];
    moverEnLista(carta, 0, 3);
    expect(carta).toEqual(original);
  });
});
