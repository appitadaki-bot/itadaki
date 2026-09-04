import { cuantosPlatos, juntarLoMismoEnCocina } from './juntar-lo-mismo-en-cocina';

const plato = (key: string, name: string, status: string, quantity = 1) => ({
  key,
  name,
  quantity,
  status,
});

describe('juntar lo mismo en cocina', () => {
  it('junta el mismo plato en el mismo estado', () => {
    const juntados = juntarLoMismoEnCocina([
      plato('a', 'Empanadas de carne', 'DELIVERED'),
      plato('b', 'Empanadas de carne', 'DELIVERED'),
    ]);

    expect(juntados).toHaveLength(1);
    expect(juntados[0]?.quantity).toBe(2);
  });

  it('deja separado el mismo plato en distinto estado', () => {
    const juntados = juntarLoMismoEnCocina([
      plato('a', 'Empanadas de carne', 'DELIVERED'),
      plato('b', 'Empanadas de carne', 'ACCEPTED'),
    ]);

    expect(juntados.map((uno) => uno.status)).toEqual(['DELIVERED', 'ACCEPTED']);
    expect(juntados.every((uno) => uno.quantity === 1)).toBe(true);
  });

  it('suma las cantidades, no cuenta los renglones', () => {
    const juntados = juntarLoMismoEnCocina([
      plato('a', 'Agua mineral', 'SENT', 2),
      plato('b', 'Agua mineral', 'SENT', 3),
    ]);

    expect(juntados[0]?.quantity).toBe(5);
  });

  it('respeta el orden en que se pidieron', () => {
    const juntados = juntarLoMismoEnCocina([
      plato('a', 'Asado de tira', 'ACCEPTED'),
      plato('b', 'Flan casero', 'SENT'),
      plato('c', 'Asado de tira', 'ACCEPTED'),
    ]);

    expect(juntados.map((uno) => uno.name)).toEqual(['Asado de tira', 'Flan casero']);
  });

  it('conserva el resto de la línea del primero', () => {
    const juntados = juntarLoMismoEnCocina([
      { ...plato('a', 'Provoleta', 'READY'), pedidoEn: 'temprano' },
      { ...plato('b', 'Provoleta', 'READY'), pedidoEn: 'tarde' },
    ]);

    expect(juntados[0]?.pedidoEn).toBe('temprano');
    expect(juntados[0]?.key).toBe('a');
  });

  it('sin platos no junta nada', () => {
    expect(juntarLoMismoEnCocina([])).toEqual([]);
  });

  it('cuenta las cantidades para el "2 de 5"', () => {
    expect(
      cuantosPlatos([plato('a', 'Empanadas de carne', 'DELIVERED', 2), plato('b', 'Flan', 'SENT')]),
    ).toBe(3);
  });
});
