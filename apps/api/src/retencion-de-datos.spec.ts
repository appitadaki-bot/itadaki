/**
 * Cuánto se conserva el apodo de un comensal.
 *
 * Es el único dato personal que guardamos de quien come, y la política de
 * privacidad promete no conservarlo más de lo necesario. Una promesa así no se
 * cumple sola: sin un barrido que la ejecute, el nombre queda en la base para
 * siempre y el documento miente.
 */

interface Mesa {
  readonly estado: 'OPEN' | 'CLOSED';
  readonly diasDesdeQueAbrio: number;
  readonly tieneApodos: boolean;
}

const PLAZO_DIAS = 30;

/** Lo mismo que decide el barrido, para poder probarlo. */
function seBorraElApodo(mesa: Mesa): boolean {
  return mesa.estado === 'CLOSED' && mesa.tieneApodos && mesa.diasDesdeQueAbrio > PLAZO_DIAS;
}

describe('el apodo se borra cuando deja de servir', () => {
  it('borra el de una mesa cerrada hace más de un mes', () => {
    expect(
      seBorraElApodo({ estado: 'CLOSED', diasDesdeQueAbrio: 45, tieneApodos: true }),
    ).toBe(true);
  });

  it('no toca una mesa que está comiendo ahora', () => {
    // Mientras la mesa está abierta el apodo cumple su función: el resto ve
    // quién pidió qué.
    expect(seBorraElApodo({ estado: 'OPEN', diasDesdeQueAbrio: 60, tieneApodos: true })).toBe(false);
  });

  it('conserva el del último mes', () => {
    // Un restaurante que revisa el fin de semana anterior todavía quiere ver
    // quién pidió qué en la mesa que discutió la cuenta.
    expect(
      seBorraElApodo({ estado: 'CLOSED', diasDesdeQueAbrio: 5, tieneApodos: true }),
    ).toBe(false);
  });

  it('no vuelve a tocar lo que ya está limpio', () => {
    // Sin esta condición el barrido reescribiría cada mesa vieja en cada
    // corrida, para dejarla igual.
    expect(
      seBorraElApodo({ estado: 'CLOSED', diasDesdeQueAbrio: 90, tieneApodos: false }),
    ).toBe(false);
  });

  it('justo en el límite todavía se conserva', () => {
    expect(
      seBorraElApodo({ estado: 'CLOSED', diasDesdeQueAbrio: PLAZO_DIAS, tieneApodos: true }),
    ).toBe(false);
  });
});

describe('qué sobrevive al borrado', () => {
  /**
   * El pedido guarda su propia copia del plato y el precio —para que la
   * historia no cambie cuando cambia la carta— y nunca el nombre de quien
   * pidió. Por eso borrar el apodo no toca el registro de ventas.
   */
  const pedidoGuardado = {
    productName: 'Bife de chorizo',
    unitPriceMinor: 950_000,
    quantity: 1,
  };

  it('el pedido no lleva el nombre de nadie', () => {
    expect(Object.keys(pedidoGuardado)).not.toContain('nickname');
    expect(Object.keys(pedidoGuardado)).not.toContain('dinerName');
  });

  it('la venta queda entera', () => {
    // Es el registro comercial del restaurante: borrarla al limpiar datos
    // personales falsearía sus números.
    expect(pedidoGuardado.productName).toBe('Bife de chorizo');
    expect(pedidoGuardado.unitPriceMinor).toBe(950_000);
  });
});
