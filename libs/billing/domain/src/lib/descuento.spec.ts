import { Money } from '@itadaki/shared/domain';
import {
  aplicaA,
  consumoConDescuento,
  descuentoDe,
  montoDelDescuento,
} from './descuento';

/**
 * El descuento por pagar en efectivo.
 *
 * El local se ahorra la comisión de la tarjeta y comparte parte con quien
 * paga en efectivo. Hasta ahora se arreglaba de palabra en la mesa, así que
 * el comensal se enteraba —o no— cuando ya había decidido cómo pagar.
 */

const ars = (minor: number): Money => {
  const result = Money.of(minor, 'ARS');
  if (result.isErr()) throw new Error('fixture must be valid');
  return result.value;
};

const diez = descuentoDe(0.1);
if (diez.isErr()) throw new Error('fixture must be valid');
const DIEZ = diez.value;

describe('configurar el descuento', () => {
  it('acepta un porcentaje razonable', () => {
    expect(descuentoDe(0.1).isOk()).toBe(true);
  });

  it('cero significa que el local no lo ofrece', () => {
    // Lo que pasa por defecto: esto no aparece hasta que alguien lo configura.
    const sin = descuentoDe(0);
    if (sin.isErr()) throw new Error('expected ok');

    expect(montoDelDescuento(sin.value, ars(1_000_000)).unwrapOr(ars(-1))).toEqual(ars(0));
  });

  it('rechaza más de la mitad', () => {
    // Quien quiso poner 10 y puso 100 se entera acá, no cuando la primera
    // mesa paga casi nada.
    expect(descuentoDe(1).isErr()).toBe(true);
    expect(descuentoDe(0.9).isErr()).toBe(true);
  });

  it('rechaza un porcentaje negativo', () => {
    // Un "descuento" negativo sería un recargo, y eso no es lo que dice el
    // botón que la mesa toca.
    expect(descuentoDe(-0.1).isErr()).toBe(true);
  });
});

describe('a qué medios de pago se aplica', () => {
  it('al efectivo', () => {
    expect(aplicaA('CASH')).toBe(true);
  });

  it('no a la tarjeta', () => {
    // Es justamente la comisión que el local quiere evitar.
    expect(aplicaA('CARD')).toBe(false);
  });

  it('no a pagar en la caja', () => {
    // Ahí el local todavía no sabe con qué van a pagar: prometerlo sería
    // prometer algo que quizás no corresponda cuando llegue el momento.
    expect(aplicaA('COUNTER')).toBe(false);
  });

  it('no cuando la mesa no decidió', () => {
    expect(aplicaA('UNDECIDED')).toBe(false);
    expect(aplicaA(null)).toBe(false);
  });
});

describe('cuánto se descuenta', () => {
  it('el diez por ciento de veinte mil son dos mil', () => {
    const monto = montoDelDescuento(DIEZ, ars(2_000_000));
    if (monto.isErr()) throw new Error('expected ok');

    expect(monto.value.amountInMinorUnits).toBe(200_000);
  });

  it('el consumo con descuento es el consumo menos el descuento', () => {
    const conDescuento = consumoConDescuento(DIEZ, ars(2_000_000));
    if (conDescuento.isErr()) throw new Error('expected ok');

    expect(conDescuento.value.amountInMinorUnits).toBe(1_800_000);
  });

  it('un consumo con centavos raros no pierde plata', () => {
    // El redondeo tiene que dejar las dos partes sumando el total: si no, la
    // cuenta no cierra y alguien paga un centavo de más o de menos.
    const consumo = ars(999_999);
    const monto = montoDelDescuento(DIEZ, consumo);
    const resto = consumoConDescuento(DIEZ, consumo);
    if (monto.isErr() || resto.isErr()) throw new Error('expected ok');

    expect(monto.value.amountInMinorUnits + resto.value.amountInMinorUnits).toBe(
      consumo.amountInMinorUnits,
    );
  });
});

describe('consumo con descuento', () => {
  it('sin descuento el consumo no cambia', () => {
    const sin = descuentoDe(0);
    if (sin.isErr()) throw new Error('expected ok');

    const consumo = ars(2_000_000);
    const conDescuento = consumoConDescuento(sin.value, consumo);
    if (conDescuento.isErr()) throw new Error('expected ok');

    expect(conDescuento.value.amountInMinorUnits).toBe(consumo.amountInMinorUnits);
  });
});

describe('el descuento con los medios separados', () => {
  it('sigue siendo sólo por efectivo', () => {
    // El descuento existe porque el efectivo le ahorra comisión al local.
    // Ninguno de los otros se la ahorra, así que ninguno lo lleva.
    expect(aplicaA('CASH')).toBe(true);
    expect(aplicaA('DEBIT')).toBe(false);
    expect(aplicaA('CREDIT')).toBe(false);
  });

  it('la transferencia no lleva descuento', () => {
    // Es la que más se presta a la duda: al dueño le entra casi entera, pero
    // la tiene que conciliar a mano y no es lo que se le prometió a la mesa.
    expect(aplicaA('TRANSFER')).toBe(false);
  });

  it('las cuentas viejas con "CARD" tampoco', () => {
    expect(aplicaA('CARD')).toBe(false);
  });
});
