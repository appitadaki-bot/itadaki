import { conciliar, laPlataQueEntro } from './conciliar-lo-facturado';

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

/**
 * Lo facturado es la plata que entró, no lo que suman los platos.
 *
 * Una mesa de $146.000 que pagó $131.400 en efectivo con descuento aparecía
 * como $146.000 facturados: el número no coincidía con la caja que el dueño
 * cruza contra esto.
 */
describe('la plata que entró', () => {
  const cobro = (cobrado: number, descuento = 0) => ({
    cobrado: { amountInMinorUnits: cobrado },
    descuento: { amountInMinorUnits: descuento },
  });

  it('suma lo cobrado y no lo que valían los platos', () => {
    expect(laPlataQueEntro([cobro(13_140_000, 1_460_000)])).toBe(13_140_000);
  });

  it('junta todos los medios', () => {
    expect(laPlataQueEntro([cobro(10_000), cobro(5_000), cobro(2_500)])).toBe(17_500);
  });

  it('cuenta lo cobrado sin declarar con qué', () => {
    // Es plata que entró igual; dejarla afuera haría que el total diga de menos.
    expect(laPlataQueEntro([cobro(10_000), cobro(3_000)])).toBe(13_000);
  });

  it('sin cobros todavía, es cero', () => {
    expect(laPlataQueEntro([])).toBe(0);
  });
});
