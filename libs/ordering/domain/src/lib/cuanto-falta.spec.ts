import {
  DE_MAS_PARA_DEMORADO,
  PEDIDOS_PARA_ESTIMAR,
  estadoDeLaEspera,
  minutosEsperando,
  redondearEspera,
} from './cuanto-falta';

/**
 * Cuánto falta para que llegue la comida.
 *
 * Lo que se cuida acá es no mentirle a la mesa. El número lo va a usar para
 * decidir si espera o se va, y un local que recién abre no tiene con qué
 * contestar — decir cualquier cosa es peor que no decir nada.
 */

const habitual = (minutos: number | null, pedidos = 50) => ({
  habitualMinutos: minutos,
  pedidosMedidos: pedidos,
});

describe('cuándo se puede estimar', () => {
  it('con pocos pedidos no se dice nada', () => {
    // La mediana de tres pedidos es la anécdota de tres mesas.
    const estado = estadoDeLaEspera({
      ...habitual(20, PEDIDOS_PARA_ESTIMAR - 1),
      esperandoMinutos: 5,
    });

    expect(estado.kind).toBe('SIN_DATOS');
  });

  it('con suficientes, sí', () => {
    const estado = estadoDeLaEspera({
      ...habitual(20, PEDIDOS_PARA_ESTIMAR),
      esperandoMinutos: 5,
    });

    expect(estado.kind).toBe('EN_HORA');
  });

  it('un local sin historial no dice nada', () => {
    expect(estadoDeLaEspera({ ...habitual(null), esperandoMinutos: 5 }).kind).toBe('SIN_DATOS');
  });

  it('una mediana de cero no es una estimación', () => {
    // Pasaría si todos los pedidos se marcaran entregados al instante: decir
    // "suele tardar 0 minutos" es peor que callarse.
    expect(estadoDeLaEspera({ ...habitual(0), esperandoMinutos: 5 }).kind).toBe('SIN_DATOS');
  });

  it('una mediana negativa tampoco', () => {
    // Un reloj desfasado entre la cocina y el servidor puede producirla.
    expect(estadoDeLaEspera({ ...habitual(-5), esperandoMinutos: 1 }).kind).toBe('SIN_DATOS');
  });
});

describe('cuándo la espera dejó de ser normal', () => {
  it('dentro de lo habitual está en hora', () => {
    const estado = estadoDeLaEspera({ ...habitual(20), esperandoMinutos: 15 });

    expect(estado.kind).toBe('EN_HORA');
  });

  it('justo en lo habitual todavía está en hora', () => {
    // El plato que sale exactamente a tiempo no es una demora.
    expect(estadoDeLaEspera({ ...habitual(20), esperandoMinutos: 20 }).kind).toBe('EN_HORA');
  });

  it('pasarse un poco no es demora', () => {
    // Una noche ocupada no puede leerse como alarma, o la mesa deja de creer
    // en el aviso cuando de verdad importe.
    expect(estadoDeLaEspera({ ...habitual(20), esperandoMinutos: 25 }).kind).toBe('EN_HORA');
  });

  it('pasarse de la mitad más sí lo es', () => {
    const estado = estadoDeLaEspera({ ...habitual(20), esperandoMinutos: 31 });

    expect(estado.kind).toBe('DEMORADO');
  });

  it('el umbral es el declarado', () => {
    // Si alguien cambia la constante, esto lo cruza con el comportamiento.
    const justo = 20 * DE_MAS_PARA_DEMORADO;

    expect(estadoDeLaEspera({ ...habitual(20), esperandoMinutos: justo }).kind).toBe('EN_HORA');
    expect(estadoDeLaEspera({ ...habitual(20), esperandoMinutos: justo + 0.1 }).kind).toBe(
      'DEMORADO',
    );
  });

  it('cuando se demora, dice cuánto se está esperando', () => {
    // Es lo que el mozo necesita escuchar cuando la mesa lo llama.
    const estado = estadoDeLaEspera({ ...habitual(20), esperandoMinutos: 45 });
    if (estado.kind !== 'DEMORADO') throw new Error('esperaba demorado');

    expect(estado.esperandoMinutos).toBe(45);
    expect(estado.habitualMinutos).toBe(20);
  });
});

describe('cómo se dice el número', () => {
  it('redondea a los cinco minutos', () => {
    // Nadie dice "diecisiete minutos".
    expect(redondearEspera(17)).toBe(15);
    expect(redondearEspera(23)).toBe(25);
  });

  it('nunca dice menos de cinco', () => {
    // "Suele tardar 0 minutos" no es una espera, y prometer 2 minutos es
    // ponerse en falta enseguida.
    expect(redondearEspera(1)).toBe(5);
    expect(redondearEspera(0)).toBe(5);
  });

  it('deja los redondos como están', () => {
    expect(redondearEspera(20)).toBe(20);
  });
});

describe('cuánto hace que se espera', () => {
  const ahora = new Date('2026-08-28T21:30:00Z');

  it('cuenta desde que se envió', () => {
    const enviado = new Date('2026-08-28T21:10:00Z');

    expect(minutosEsperando(enviado, ahora)).toBe(20);
  });

  it('nunca da negativo', () => {
    // El reloj del teléfono puede estar atrasado respecto del servidor, y una
    // espera negativa mostraría un texto absurdo.
    const enviado = new Date('2026-08-28T21:45:00Z');

    expect(minutosEsperando(enviado, ahora)).toBe(0);
  });
});
