import { juntarLoIgual } from './juntar-lo-igual';

const linea = (id: string, name: string, quantity: number, precio: number) => ({
  id,
  name,
  quantity,
  unitTotal: { amountInMinorUnits: precio, currency: 'ARS' },
});

describe('juntar lo igual en la cuenta', () => {
  /** El caso real: aguas y flanes desparramados por toda la lista. */
  it('junta el mismo plato aunque se haya pedido en momentos distintos', () => {
    const juntadas = juntarLoIgual([
      linea('1', 'Agua mineral', 1, 180_000),
      linea('2', 'Flan casero', 1, 420_000),
      linea('3', 'Agua mineral', 2, 180_000),
      linea('4', 'Flan casero', 1, 420_000),
    ]);

    expect(juntadas).toHaveLength(2);
    expect(juntadas[0]).toMatchObject({ name: 'Agua mineral', quantity: 3 });
    expect(juntadas[1]).toMatchObject({ name: 'Flan casero', quantity: 2 });
  });

  /** El mismo plato con un agregado cuesta distinto: son dos renglones. */
  it('no junta lo que no cuesta lo mismo', () => {
    const juntadas = juntarLoIgual([
      linea('1', 'Provoleta', 1, 580_000),
      linea('2', 'Provoleta', 1, 640_000),
    ]);

    expect(juntadas).toHaveLength(2);
  });

  /** Ni lo que está en otra moneda. */
  it('no junta monedas distintas', () => {
    const juntadas = juntarLoIgual([
      { ...linea('1', 'Agua', 1, 1000), unitTotal: { amountInMinorUnits: 1000, currency: 'ARS' } },
      { ...linea('2', 'Agua', 1, 1000), unitTotal: { amountInMinorUnits: 1000, currency: 'USD' } },
    ]);

    expect(juntadas).toHaveLength(2);
  });

  it('respeta el orden en que aparecieron', () => {
    const juntadas = juntarLoIgual([
      linea('1', 'Bife', 1, 1_250_000),
      linea('2', 'Agua', 1, 180_000),
      linea('3', 'Bife', 1, 1_250_000),
    ]);

    expect(juntadas.map((l) => l.name)).toEqual(['Bife', 'Agua']);
  });

  it('con una lista vacía no inventa renglones', () => {
    expect(juntarLoIgual([])).toEqual([]);
  });
});
