import {
  MEDIOS_DE_COBRO,
  MEDIOS_QUE_ELIGE_EL_MOZO,
  cobradoDeLaCuenta,
  esMedioDeCobro,
  nombreDelMedio,
} from './medio-de-cobro';

/**
 * Con qué se cobró.
 *
 * Lo elige el mozo al cerrar la mesa y lo lee el dueño en sus métricas. Que
 * las dos pantallas usen los mismos nombres no es cosmético: si una dice
 * "Débito" y la otra "Tarjeta de débito", el dueño no sabe si está mirando el
 * mismo número.
 */

describe('los medios de cobro', () => {
  it('separa crédito de débito', () => {
    // La razón de todo esto: no cuestan lo mismo ni se acreditan igual, y un
    // solo "tarjeta" esconde justo lo que el dueño querría mirar.
    expect(MEDIOS_DE_COBRO).toContain('CREDIT');
    expect(MEDIOS_DE_COBRO).toContain('DEBIT');
  });

  it('incluye transferencia', () => {
    expect(MEDIOS_DE_COBRO).toContain('TRANSFER');
  });

  it('no tiene un "tarjeta" suelto', () => {
    // Dejarlo sería tener dos formas de decir lo mismo, y el mozo elegiría
    // una u otra según la pantalla.
    expect(MEDIOS_DE_COBRO).not.toContain('CARD');
  });

  it('reconoce los que conoce', () => {
    expect(esMedioDeCobro('CREDIT')).toBe(true);
    expect(esMedioDeCobro('TRANSFER')).toBe(true);
  });

  it('rechaza cualquier otra cosa', () => {
    // Llega por HTTP: puede venir cualquier cosa.
    expect(esMedioDeCobro('CRIPTO')).toBe(false);
    expect(esMedioDeCobro(null)).toBe(false);
    expect(esMedioDeCobro(7)).toBe(false);
  });

  it('el mozo elige entre todos, con efectivo primero', () => {
    // Es el más frecuente y el que tiene descuento.
    expect(MEDIOS_QUE_ELIGE_EL_MOZO[0]).toBe('CASH');
    expect(MEDIOS_QUE_ELIGE_EL_MOZO).toHaveLength(MEDIOS_DE_COBRO.length);
  });

  it('deja "en la caja" al final', () => {
    // No es un medio de pago: es que la plata la cobró otro.
    expect(MEDIOS_QUE_ELIGE_EL_MOZO.at(-1)).toBe('COUNTER');
  });
});

describe('cómo se llama cada medio en pantalla', () => {
  it('les da nombre a todos', () => {
    // Un medio sin nombre saldría como "CREDIT" en la pantalla del dueño.
    for (const medio of MEDIOS_DE_COBRO) {
      expect(nombreDelMedio(medio)).not.toBe(medio);
      expect(nombreDelMedio(medio).length).toBeGreaterThan(0);
    }
  });

  it('nombra el hueco de los que nadie declaró', () => {
    // Se muestra en la lista: repartirlas a ojo entre las otras sería
    // inventar un número que el dueño cruza con su caja.
    expect(nombreDelMedio(null)).toBe('Sin declarar');
  });

  it('muestra tal cual un medio viejo que ya no está en la lista', () => {
    // Las cuentas cobradas antes de esto tienen 'CARD' guardado. Mostrar el
    // código es feo, pero mejor que una fila en blanco o que romper la
    // pantalla de métricas por un dato histórico.
    expect(nombreDelMedio('CARD')).toBe('CARD');
  });
});

describe('cuánto entró en la caja', () => {
  it('es el consumo cuando no hubo descuento', () => {
    expect(cobradoDeLaCuenta(500_000, 0)).toBe(500_000);
  });

  it('resta el descuento en efectivo', () => {
    // Sin esto las métricas dirían que entró más de lo que entró, justo en
    // las cuentas donde el local resignó plata a propósito.
    expect(cobradoDeLaCuenta(500_000, 50_000)).toBe(450_000);
  });

  it('nunca da negativo', () => {
    // Un descuento mal cargado arrastraría el total del día para abajo.
    expect(cobradoDeLaCuenta(100_000, 300_000)).toBe(0);
  });

  it('una cuenta sin consumo no suma nada', () => {
    expect(cobradoDeLaCuenta(0, 0)).toBe(0);
  });
});
