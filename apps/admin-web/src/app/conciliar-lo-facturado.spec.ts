import { conciliar } from './conciliar-lo-facturado';

const cobro = (cobrado: number, descuento = 0) => ({
  cobrado: { amountInMinorUnits: cobrado },
  descuento: { amountInMinorUnits: descuento },
});

describe('conciliar lo facturado con lo cobrado', () => {
  /** El caso que hizo dudar: faltaban $4.370 y no se decía por qué. */
  it('reparte el hueco entre descuento y mesas abiertas', () => {
    const resultado = conciliar(14_600_000, [
      cobro(6_540_000),
      cobro(3_330_000),
      cobro(2_313_000, 257_000),
      cobro(1_980_000),
    ]);

    expect(resultado.cobrado).toBe(14_163_000);
    expect(resultado.descuento).toBe(257_000);
    expect(resultado.sinCerrar).toBe(180_000);
    expect(resultado.cierra).toBe(true);
  });

  it('cierra exacto cuando se cobró todo y no hubo descuento', () => {
    const resultado = conciliar(10_000, [cobro(10_000)]);

    expect(resultado.sinCerrar).toBe(0);
    expect(resultado.descuento).toBe(0);
    expect(resultado.cierra).toBe(true);
  });

  /**
   * Una mesa de ayer cobrada hoy entra en lo cobrado sin estar en lo
   * facturado de esta ventana. Decir "menos cero" sería inventar prolijidad.
   */
  it('avisa cuando lo cobrado supera lo facturado del período', () => {
    const resultado = conciliar(5_000, [cobro(8_000)]);

    expect(resultado.cierra).toBe(false);
    expect(resultado.sinCerrar).toBe(0);
  });

  it('sin cobros, todo lo facturado está sin cerrar', () => {
    const resultado = conciliar(7_500, []);

    expect(resultado.sinCerrar).toBe(7_500);
    expect(resultado.cobrado).toBe(0);
  });
});
